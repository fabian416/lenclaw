import { useEffect, useState, useCallback } from "react"

interface TextScrambleProps {
  text: string
  trigger?: "mount" | "hover"
  speed?: number
  className?: string
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"

export function TextScramble({
  text,
  trigger = "mount",
  speed = 50,
  className = "",
}: TextScrambleProps) {
  const [display, setDisplay] = useState(trigger === "mount" ? randomString(text.length) : text)

  const scramble = useCallback(() => {
    let iteration = 0
    const interval = setInterval(() => {
      setDisplay(
        text
          .split("")
          .map((char, i) => {
            if (i < iteration) return char
            return CHARS[Math.floor(Math.random() * CHARS.length)]
          })
          .join("")
      )
      iteration += 1 / 3
      if (iteration >= text.length) {
        setDisplay(text)
        clearInterval(interval)
      }
    }, speed)
    return () => clearInterval(interval)
  }, [text, speed])

  useEffect(() => {
    if (trigger === "mount") {
      return scramble()
    }
  }, [trigger, scramble])

  const handleHover = () => {
    if (trigger === "hover") {
      scramble()
    }
  }

  return (
    <span className={`mono-text ${className}`} onMouseEnter={handleHover}>
      {display}
    </span>
  )
}

function randomString(length: number): string {
  return Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("")
}
