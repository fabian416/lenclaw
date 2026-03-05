import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#14f195] text-black",
        secondary: "border-transparent bg-white/[0.06] text-white/70",
        destructive: "border-transparent bg-red-500/15 text-red-400",
        outline: "border-white/[0.15] text-white/60",
        success: "border-transparent bg-[#14f195]/15 text-[#14f195]",
        warning: "border-transparent bg-amber-500/15 text-amber-400",
        danger: "border-transparent bg-red-500/15 text-red-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
