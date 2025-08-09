import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost"
  size?: "sm" | "md" | "lg"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-pigskin-500 text-white hover:bg-pigskin-600": variant === "primary",
            "bg-gold-500 text-pigskin-900 hover:bg-gold-600": variant === "secondary",
            "border border-pigskin-500 text-pigskin-500 hover:bg-pigskin-50": variant === "outline",
            "hover:bg-stone-100 hover:text-pigskin-900": variant === "ghost",
          },
          {
            "h-8 px-3 text-sm": size === "sm",
            "h-10 py-2 px-4": size === "md",
            "h-12 px-6 text-lg": size === "lg",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }