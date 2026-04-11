import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = { sm: "size-4", md: "size-6", lg: "size-8" } as const;

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin text-accent", sizeMap[size], className)}
      aria-label="Loading"
    />
  );
}
