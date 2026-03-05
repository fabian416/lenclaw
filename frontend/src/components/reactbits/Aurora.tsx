interface AuroraProps {
  className?: string
}

export function Aurora({ className = "" }: AuroraProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* Primary orange blob */}
      <div
        className="absolute -top-1/2 -left-1/4 w-[80%] h-[80%] rounded-full opacity-[0.05] dark:opacity-[0.07] animate-[aurora-1_15s_ease-in-out_infinite]"
        style={{
          background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
        }}
      />
      {/* Secondary purple blob */}
      <div
        className="absolute -bottom-1/3 -right-1/4 w-[70%] h-[70%] rounded-full opacity-[0.04] dark:opacity-[0.05] animate-[aurora-2_20s_ease-in-out_infinite]"
        style={{
          background: "radial-gradient(circle, var(--chart-2) 0%, transparent 70%)",
        }}
      />
      {/* Tertiary accent blob */}
      <div
        className="absolute top-1/4 right-1/4 w-[50%] h-[50%] rounded-full opacity-[0.03] dark:opacity-[0.04] animate-[aurora-3_12s_ease-in-out_infinite]"
        style={{
          background: "radial-gradient(circle, var(--primary) 0%, transparent 60%)",
        }}
      />
    </div>
  )
}
