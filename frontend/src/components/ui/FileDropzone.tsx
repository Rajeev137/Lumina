import { useCallback, useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { UploadCloud } from "lucide-react";

interface FileDropzoneProps {
  accept: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
}

export function FileDropzone({
  accept,
  onFile,
  disabled,
  children,
  className,
}: FileDropzoneProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (!disabled) setDragActive(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => setDragActive(false), []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [disabled, onFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
      e.target.value = "";
    },
    [onFile],
  );

  return (
    <label
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-all duration-200",
        dragActive
          ? "border-accent bg-accent/5 scale-[1.01]"
          : "border-border hover:border-accent/40 hover:bg-accent/5",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="sr-only"
        disabled={disabled}
      />

      <div className="flex size-12 items-center justify-center rounded-full bg-accent/10">
        <UploadCloud className="size-6 text-accent" />
      </div>

      {children ?? (
        <>
          <p className="text-sm font-medium text-heading">
            Drop your file here or{" "}
            <span className="text-accent underline underline-offset-2">
              browse
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Accepted formats: {accept}
          </p>
        </>
      )}
    </label>
  );
}
