import * as React from "react"
import { cn } from "@/lib/utils"

const badgeVariants = {
  default: "border-transparent bg-pigskin-500 text-white hover:bg-pigskin-600",
  secondary: "border-transparent bg-gray-100 text-gray-800 hover:bg-gray-200",
  destructive: "border-transparent bg-red-500 text-white hover:bg-red-600",
  outline: "text-gray-700 border-gray-300",
}

const badgeSizes = {
  sm: "px-2 py-0 text-[10px]",
  md: "px-2.5 py-0.5 text-xs",
}

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof badgeVariants
  // Call sites already pass size; without it here the value fell through to the
  // DOM as an invalid <div size="sm"> attribute.
  size?: keyof typeof badgeSizes
}

function Badge({ className, variant = "default", size = "md", ...props }: BadgeProps) {
  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-full border font-semibold transition-colors",
        badgeSizes[size],
        badgeVariants[variant],
        className
      )} 
      {...props} 
    />
  )
}

export { Badge }