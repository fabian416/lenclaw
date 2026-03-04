import { motion } from "framer-motion"

export function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-6" role="status">
        {/* Animated skeleton cards */}
        <div className="w-80 space-y-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="data-card rounded-xl p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="skeleton-text w-24 h-3" />
                <div className="skeleton-circle w-8 h-8" />
              </div>
              <div className="skeleton-text w-32 h-5" />
              <div className="flex gap-1 h-3">
                {Array.from({ length: 8 }).map((_, j) => (
                  <motion.div
                    key={j}
                    className="flex-1 rounded-sm bg-violet-500/10"
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: j * 0.1,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
        <motion.span
          className="mono-text text-sm text-muted-foreground"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {label}
        </motion.span>
      </div>
    </div>
  )
}
