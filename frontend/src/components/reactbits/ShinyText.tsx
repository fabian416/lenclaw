interface ShinyTextProps {
  text: string
  className?: string
  /** Speed of the shimmer in seconds */
  speed?: number
}

export function ShinyText({ text, className = "", speed = 3 }: ShinyTextProps) {
  return (
    <span
      className={`inline-block bg-clip-text text-transparent bg-[length:200%_100%] animate-[shiny-text_linear_infinite] ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(20,241,149,0.9) 25%, rgba(255,255,255,0.5) 50%, rgba(20,241,149,0.9) 75%, rgba(255,255,255,0.5) 100%)",
        animationDuration: `${speed}s`,
      }}
    >
      {text}
    </span>
  )
}
