interface NoiseProps {
  opacity?: number
  className?: string
}

export function Noise({ opacity = 0.03, className = "" }: NoiseProps) {
  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity }}
    >
      <filter id="noise-filter">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.65"
          numOctaves="3"
          stitchTiles="stitch"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise-filter)" />
    </svg>
  )
}
