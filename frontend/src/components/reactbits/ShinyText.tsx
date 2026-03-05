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
          "linear-gradient(90deg, var(--muted-foreground) 0%, var(--primary) 25%, var(--muted-foreground) 50%, var(--primary) 75%, var(--muted-foreground) 100%)",
        animationDuration: `${speed}s`,
      }}
    >
      {text}
    </span>
  )
}
