import { marked } from 'marked'
import { useMemo } from 'react'

/** Текст для чтения: markdown со списками и таблицами. HTML внутри текста не допускается. */
export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => {
    const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return marked.parse(escaped, { async: false, gfm: true, breaks: true })
  }, [source])

  return <div className="reading" dangerouslySetInnerHTML={{ __html: html }} />
}
