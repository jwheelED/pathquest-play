import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  description?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "primary" | "success" | "warning" | "streak";
  className?: string;
  onClick?: () => void;
}

export function MetricCard({
  icon,
  label,
  value,
  description,
  size = "md",
  variant = "default",
  className,
  onClick,
}: MetricCardProps) {
  const sizeClasses = {
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  const valueSizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
  };

  const variantClasses = {
    default: "bg-card border-border/50",
    primary: "bg-primary/5 border-primary/20",
    success: "bg-success/5 border-success/20",
    warning: "bg-warning/5 border-warning/20",
    streak: "bg-streak/5 border-streak/20",
  };

  const iconColorClasses = {
    default: "text-muted-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    streak: "text-streak",
  };

  return (
    <div
      className={cn(
        "headspace-card border rounded-2xl transition-all duration-200",
        sizeClasses[size],
        variantClasses[variant],
        onClick && "cursor-pointer hover:shadow-md hover:scale-[1.02]",
        className
      )}
      onClick={onClick}
    >
      {/* Label row with icon */}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("shrink-0", iconColorClasses[variant])}>{icon}</div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>

      {/* Value */}
      <p className={cn("font-bold text-foreground", valueSizeClasses[size])}>
        {value}
      </p>

      {/* Description (never truncated) */}
      {description && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {description}
        </p>
      )}
    </div>
  );
}
