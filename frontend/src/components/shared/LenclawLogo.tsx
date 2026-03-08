interface LenclawLogoProps {
  className?: string
}

export function LenclawLogo({ className = "w-8 h-8" }: LenclawLogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Lenclaw"
    >
      {/* Door body */}
      <rect x="6" y="2" width="19" height="27" rx="2.5" fill="var(--primary)" />
      {/* Claw marks — 3 sharp diamond slashes, compact, left-aligned */}
      <path d="M9.7,5 L11.3,14 L10.7,24 L9,14 Z" fill="white" />
      <path d="M13,4.5 L14.5,14 L14,24.5 L12.5,14 Z" fill="white" />
      <path d="M16.3,5 L18,14 L17.5,24 L15.7,14 Z" fill="white" />
      {/* Doorknob */}
      <circle
        cx="22"
        cy="16"
        r="1.6"
        fill="white"
        fillOpacity="0.9"
      />
      {/* Floor line extending right from bottom-right — Lendoor inspired */}
      <rect x="21" y="26.25" width="10.5" height="2.5" rx="1.25" fill="var(--primary)" />
    </svg>
  )
}
