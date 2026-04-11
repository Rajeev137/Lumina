import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-30 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-heading placeholder:text-muted-foreground/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50 resize-y",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
