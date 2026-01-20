import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuickAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "outline";
}

interface QuickActionsProps {
  actions: QuickAction[];
  className?: string;
}

export function QuickActions({ actions, className }: QuickActionsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {actions.map((action, index) => (
        <Button
          key={index}
          variant={action.variant === "primary" ? "default" : action.variant || "outline"}
          size="sm"
          onClick={action.onClick}
          className={cn(
            "rounded-full gap-2 text-xs",
            action.variant === "primary" && "bg-primary hover:bg-primary/90"
          )}
        >
          {action.icon}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
