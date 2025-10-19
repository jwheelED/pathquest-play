import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        bronze: "border-transparent bg-[hsl(var(--badge-bronze))] text-white shadow-[0_0_10px_hsl(var(--badge-bronze-glow)/0.5)]",
        silver: "border-transparent bg-[hsl(var(--badge-silver))] text-white shadow-[0_0_10px_hsl(var(--badge-silver-glow)/0.5)]",
        gold: "border-transparent bg-[hsl(var(--badge-gold))] text-[hsl(var(--achievement-foreground))] shadow-[0_0_10px_hsl(var(--badge-gold-glow)/0.5)]",
        platinum: "border-transparent bg-[hsl(var(--badge-platinum))] text-white shadow-[0_0_10px_hsl(var(--badge-platinum-glow)/0.5)]",
        locked: "border-dashed border-[hsl(var(--badge-locked))] bg-muted/30 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
