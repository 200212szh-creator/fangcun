import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold motion-press cursor-pointer touch-manipulation disabled:pointer-events-none disabled:opacity-50",
  { variants: { variant: { default: "bg-navy text-white shadow-sm hover:bg-ink", secondary: "border border-border bg-surface text-ink hover:border-navy hover:bg-paper-muted", ghost: "text-ink hover:bg-paper-muted", brass: "bg-brass text-white hover:bg-[#704900]", danger: "bg-danger text-white hover:bg-[#8b1d1d]" }, size: { default: "h-11", sm: "h-10 px-3 text-xs", lg: "h-12 px-5" } }, defaultVariants: { variant: "default", size: "default" } },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, asChild = false, ...props }, ref) {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
