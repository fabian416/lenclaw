import { motion } from "framer-motion"

export function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-6" role="status">
        <div className="w-72 space-y-3">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="skeleton-text w-24 h-3" />
                <div className="w-8 h-8 rounded-full skeleton" />
              </div>
              <div className="skeleton-text w-32 h-5" />
            </motion.div>
          ))}
        </div>
        <span className="text-sm text-white/40 animate-pulse">
          {label}
        </span>
      </div>
    </div>
  )
}
