type Props = {
  /** Размер плитки в пикселях */
  size?: number
  className?: string
}

/**
 * Логотип «С-облачко»: буква С из «Сұрақ» в виде облачка реплики — «спроси».
 * Белый знак на розовой плитке. Исходники: public/logo.svg (одноцветный), public/favicon.svg (плитка).
 */
export function Logo({ size = 48, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      role="img"
      aria-label="Сұрақ қой"
      className={className}
    >
      <rect width="256" height="256" rx="56" className="fill-pink" />
      <path className="fill-white" d="M209.72 66.38A90 90 0 1 0 209.72 169.62L175.32 145.53A48 48 0 1 1 175.32 90.47Z" />
      <path className="fill-white" d="M58.06 163 102.29 201.45 48 224Z" />
    </svg>
  )
}
