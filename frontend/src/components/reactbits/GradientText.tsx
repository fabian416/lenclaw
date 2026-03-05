interface GradientTextProps {
  text: string
  className?: string
  from?: string
  via?: string
  to?: string
}

export function GradientText({
  text,
  className = "",
  from = "#14f195",
  via = "#9945FF",
  to = "#14f195",
}: GradientTextProps) {
  return (
    <span
      className={`bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${from}, ${via}, ${to})`,
      }}
    >
      {text}
    </span>
  )
}
