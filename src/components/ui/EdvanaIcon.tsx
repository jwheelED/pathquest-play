import { cn } from "@/lib/utils";

interface EdvanaIconProps {
  className?: string;
  animate?: boolean;
}

export function EdvanaIcon({ className, animate = false }: EdvanaIconProps) {
  return (
    <img 
      src="/edvana-icon.png" 
      alt="Edvana" 
      className={cn(
        "object-contain",
        animate && "animate-pulse",
        className
      )} 
    />
  );
}
