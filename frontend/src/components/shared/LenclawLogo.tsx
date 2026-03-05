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
      {/* Door body - rectangular, sharp corners */}
      <rect
        x="6"
        y="2"
        width="19"
        height="27"
        rx="1"
        fill="var(--primary)"
      />
      {/* Doorknob */}
      <circle
        cx="22"
        cy="16"
        r="1.6"
        fill="white"
        fillOpacity="0.9"
      />
      {/* Three claw marks - shifted left */}
      <path
        d="M9 25 Q12 15 11 5"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M14 25.5 Q16 14.5 15.5 5"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M19 25 Q18.5 13.5 19.5 5"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Floor line extending right from bottom-right - Lendoor inspired */}
      <line
        x1="24"
        y1="27.5"
        x2="31.5"
        y2="27.5"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
