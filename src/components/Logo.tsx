/**
 * A7Box Logo Component
 * C-1 Bold: Gradient red triangle with '7' negative space (mask technique)
 */

interface LogoProps {
  /** Size in pixels (width & height) */
  size?: number
  /** Use mono-white variant instead of gradient red */
  mono?: boolean
  /** Additional CSS class */
  className?: string
}

export function Logo({ size = 24, mono = false, className = '' }: LogoProps) {
  const maskId = mono ? 'a7-mask-m' : 'a7-mask-c'
  const gradientId = 'a7-grad-c'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {!mono && (
          <linearGradient id={gradientId} x1="100" y1="18" x2="100" y2="178" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF7875" />
            <stop offset="100%" stopColor="#FF4D4F" />
          </linearGradient>
        )}
        <mask id={maskId}>
          <rect width="200" height="200" fill="white" />
          <path d="M58 62 L148 62 L148 82 L104 82 L72 166 L54 166 L88 82 L58 82 Z" fill="black" />
        </mask>
      </defs>
      <path
        d="M100 18 L182 178 L18 178 Z"
        fill={mono ? '#FAFAFA' : `url(#${gradientId})`}
        mask={`url(#${maskId})`}
      />
    </svg>
  )
}
