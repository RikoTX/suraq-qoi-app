// Приёмка, пп. 4–6: Slow 3G и режим «самолёт» на собранном PWA (Service Worker).
// Headless-браузер по Chrome DevTools Protocol, Node 22 без зависимостей.
// node frontend/scripts/accept-net.mjs <ws-url браузера> <адрес приложения> <код класса> "<ученик>" (PIN 1234)
// Создаёт ученику 2 сессии — запускать на демо-классе.
const [, , wsUrl, appUrl, classCode, studentName] = process.argv
const ws = new WebSocket(wsUrl)
let id = 0
const pending = new Map()
const listeners = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  else if (m.method) listeners.forEach((l) => l(m))
}
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const msg = { id: ++id, method, params }
  if (sessionId) msg.sessionId = sessionId
  pending.set(msg.id, res)
  ws.send(JSON.stringify(msg))
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await new Promise((r) => (ws.onopen = r))

const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' })
const { result: { sessionId: s } } = await send('Target.attachToTarget', { targetId, flatten: true })
await send('Page.enable', {}, s)
await send('Runtime.enable', {}, s)
await send('Network.enable', {}, s)
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }, s)
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s)
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }
  return r.result?.result?.value
}

// Трафик: байты по сети (encodedDataLength) — со сжатием, как на телефоне.
let bytes = 0
listeners.push((m) => { if (m.method === 'Network.loadingFinished' && m.sessionId === s) bytes += m.params.encodedDataLength })

// DevTools «Slow 3G»: 400 кбит/с вниз и вверх, задержка 2 с на запрос.
const SLOW_3G = { offline: false, latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000 }
const ONLINE = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
const net = (c) => send('Network.emulateNetworkConditions', c, s)

// Помощники в странице: ввод как у пользователя (React), ожидание условия.
const HELPERS = `
  window.sleep = (ms) => new Promise(r => setTimeout(r, ms));
  window.until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(100) } return null };
  window.setVal = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) };
  window.btn = (txt) => [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(txt));
  window.mainText = () => (document.querySelector('main')?.innerText ?? '').replace(/\\s+/g, ' ');
`
const helpers = () => evalJs(HELPERS + ';true')

const report = {}

// --- 1. Первая загрузка на Slow 3G ---
await net(SLOW_3G)
bytes = 0
let t0 = Date.now()
await send('Page.navigate', { url: appUrl + '/login' }, s)
await evalJs('new Promise(r => { const t = setInterval(() => { if (document.querySelector("input")) { clearInterval(t); r(true) } }, 50) })')
report.firstLoadSlow3G = { seconds: (Date.now() - t0) / 1000, kb: Math.round(bytes / 1024) }

// --- 2. Вход ученика и сессия на Slow 3G ---
await helpers()
t0 = Date.now()
const login = await evalJs(`(async () => {
  setVal(document.querySelector('input[autocomplete=off]'), ${JSON.stringify(classCode)}); await sleep(100);
  document.querySelector('form').requestSubmit();
  const b = await until(() => btn(${JSON.stringify(studentName)})); if (!b) return 'нет ученика в списке';
  b.click(); await until(() => document.querySelector('input[type=password]'));
  setVal(document.querySelector('input[type=password]'), '1234'); await sleep(100);
  document.querySelector('form').requestSubmit();
  const link = await until(() => [...document.querySelectorAll('a')].find(a => a.getAttribute('href')?.startsWith('/texts/')), 60000);
  return link ? 'ok' : 'тексты не пришли: ' + mainText().slice(0, 120);
})()`)
report.loginSlow3G = { result: login, seconds: (Date.now() - t0) / 1000 }

const SESSION = (qs, conclusion) => `(async () => {
  const href = [...document.querySelectorAll('a')].find(a => a.getAttribute('href')?.startsWith('/texts/')).getAttribute('href');
  history.pushState({}, '', href + '/ask'); dispatchEvent(new PopStateEvent('popstate'));
  await until(() => document.querySelector('textarea'));
  for (const q of ${JSON.stringify(qs)}) {
    setVal(document.querySelector('textarea'), q); await sleep(150);
    (btn('Следующий вопрос') ?? btn('К выводу')).click(); await sleep(300);
  }
  setVal(document.querySelector('textarea'), ${JSON.stringify(conclusion)}); await sleep(150);
  const t = performance.now();
  btn('Готово').click();
  await until(() => location.pathname.startsWith('/results/'), 20000);
  return { secondsToResult: Math.round(performance.now() - t) / 1000, sessionId: location.pathname.split('/').pop(),
    status: document.querySelector('header')?.innerText.split('\\n').pop() };
})()`

report.sessionSlow3G = await evalJs(SESSION(
  ['Почему вечерний рейс автобуса отменён?', 'Во сколько утренний рейс автобуса приходит к школе?', 'Можно ли доверять новому расписанию автобуса?'],
  'Главное: автобус ходит по новому расписанию, утренний рейс продлён до школы.'))

// --- 3. Режим «самолёт»: перезагрузка без сети, сессия, потом сеть ---
await net(ONLINE)
// Service Worker должен успеть скачать оболочку приложения (это и есть «после первой загрузки»).
report.swReady = await evalJs(`(async () => { await navigator.serviceWorker.ready; await until(() => navigator.serviceWorker.controller, 20000);
  return { controlled: !!navigator.serviceWorker.controller, caches: (await caches.keys()).length } })()`)
await sleep(2000)
await net(OFFLINE)
await send('Page.navigate', { url: appUrl + '/' }, s)
await sleep(3000)
await helpers()
report.offlineReload = await evalJs(`({ onLine: navigator.onLine, controlledBySW: !!navigator.serviceWorker.controller, home: mainText().slice(0, 140) })`)
await until_(() => evalJs(`!![...document.querySelectorAll('a')].find(a => a.getAttribute('href')?.startsWith('/texts/'))`), 10000)
report.sessionOffline = await evalJs(SESSION(
  ['Почему утренний рейс продлён до школы?', 'Сколько рейсов автобуса отменили вечером?', 'Что будет, если автобус опоздает к школе?'],
  'Главное: расписание автобуса поменялось, утром удобнее ехать в школу.'))
t0 = Date.now()
await net(ONLINE)
const synced = await evalJs(`until(() => !/Предварительно/.test(document.querySelector('header')?.innerText ?? ''), 60000).then(Boolean)`)
report.afterOnline = { synced, seconds: (Date.now() - t0) / 1000, status: await evalJs(`document.querySelector('header')?.innerText.split('\\n').pop()`) }

console.log(JSON.stringify(report, null, 2))
ws.close()
process.exit(0)

async function until_(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(200) } return false }
