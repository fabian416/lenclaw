interface GlitchTextProps {
  text: string
  className?: string
}

export function GlitchText({ text, className = "" }: GlitchTextProps) {
  return (
    <>
      <span
        className={`glitch-text relative inline-block ${className}`}
        data-text={text}
      >
        {text}
      </span>
      <style>{`
        .glitch-text {
          position: relative;
        }
        .glitch-text::before,
        .glitch-text::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
        }
        .glitch-text::before {
          color: #14f195;
          clip-path: inset(0 0 60% 0);
        }
        .glitch-text::after {
          color: #9945FF;
          clip-path: inset(40% 0 0 0);
        }
        .glitch-text:hover::before {
          opacity: 0.8;
          animation: glitch-top 0.3s steps(2, end) infinite;
        }
        .glitch-text:hover::after {
          opacity: 0.8;
          animation: glitch-bottom 0.3s steps(2, end) infinite;
        }
        @keyframes glitch-top {
          0% { transform: translate(0); }
          25% { transform: translate(-2px, -1px); }
          50% { transform: translate(2px, 1px); }
          75% { transform: translate(-1px, 2px); }
          100% { transform: translate(0); }
        }
        @keyframes glitch-bottom {
          0% { transform: translate(0); }
          25% { transform: translate(2px, 1px); }
          50% { transform: translate(-2px, -1px); }
          75% { transform: translate(1px, -2px); }
          100% { transform: translate(0); }
        }
      `}</style>
    </>
  )
}
