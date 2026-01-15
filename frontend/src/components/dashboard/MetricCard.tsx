import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: {
    direction: "up" | "down" | "neutral";
    value: string;
  };
  size?: "sm" | "md" | "lg";
  variant?: "default" | "primary" | "success" | "warning" | "streak";
  className?: string;
  onClick?: () => void;
}

export function MetricCard({
  icon,
  label,
  value,
  trend,
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

  const iconSizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
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

  const iconBgClasses = {
    default: "bg-muted",
    primary: "bg-primary/10",
    success: "bg-success/10",
    warning: "bg-warning/10",
    streak: "bg-streak/10",
  };

  const iconColorClasses = {
    default: "text-muted-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    streak: "text-streak",
  };

  const TrendIcon = trend?.direction === "up" 
    ? TrendingUp 
    : trend?.direction === "down" 
    ? TrendingDown 
    : Minus;

  const trendColorClass = trend?.direction === "up" 
    ? "text-success" 
    : trend?.direction === "down" 
    ? "text-destructive" 
    : "text-muted-foreground";

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
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "rounded-xl flex items-center justify-center",
            iconSizeClasses[size],
            iconBgClasses[variant]
          )}
        >
          <div className={iconColorClasses[variant]}>{icon}</div>
        </div>
        {trend && (
          <div className={cn("flex items-center gap-1 text-xs", trendColorClass)}>
            <TrendIcon className="w-3 h-3" />
            <span>{trend.value}</span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className={cn("font-bold text-foreground", valueSizeClasses[size])}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}
