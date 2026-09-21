import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // "default" and "destructive" exist because call sites already pass them.
  // They used to be absent from this union, so those buttons matched none of
  // the variant classes below and rendered with no background at all.
  variant?: "primary" | "default" | "secondary" | "outline" | "ghost" | "destructive"
  size?: "sm" | "md" | "lg"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => {
    return (
      <button
        // A <button> with no type defaults to "submit". Inside a <form> — the
        // login, register and reset-password pages all have one — that submits
        // the form and reloads the page instead of running onClick. Anything
        // that genuinely submits can still pass type="submit" explicitly.
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-pigskin-500 text-white hover:bg-pigskin-600": variant === "primary" || variant === "default",
            "bg-gold-500 text-pigskin-900 hover:bg-gold-600": variant === "secondary",
            "border border-pigskin-500 text-pigskin-500 hover:bg-pigskin-50": variant === "outline",
            "hover:bg-stone-100 hover:text-pigskin-900": variant === "ghost",
            "bg-red-600 text-white hover:bg-red-700": variant === "destructive",
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