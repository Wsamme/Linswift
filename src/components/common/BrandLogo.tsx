import brandLogoUrl from '../../assets/brand-logo.png'

interface BrandLogoProps {
  className?: string
  iconFrameClassName?: string
  imageClassName?: string
  showText?: boolean
  textClassName?: string
  text?: string
  alt?: string
}

export default function BrandLogo({
  className = '',
  iconFrameClassName = '',
  imageClassName = 'h-10 w-10',
  showText = true,
  textClassName = 'text-[20px] font-bold tracking-tight text-[var(--color-foreground)]',
  text = 'Linswift',
  alt = 'Linswift logo',
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`.trim()}>
      <div
        className={`shrink-0 ${iconFrameClassName}`.trim()}
      >
        <img src={brandLogoUrl} alt={alt} className={`shrink-0 object-contain ${imageClassName}`.trim()} />
      </div>
      {showText ? <span className={textClassName}>{text}</span> : null}
    </div>
  )
}
