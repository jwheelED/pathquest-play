import { cn } from "@/lib/utils";

/**
 * Skip to main content link for keyboard and screen reader users
 * Visually hidden until focused - WCAG 2.1 AA requirement
 */
export const SkipLink = () => {
  return (
    <a
      href="#main-content"
      className={cn(
        "fixed top-0 left-0 z-[9999] p-4 bg-primary text-primary-foreground font-semibold",
        "transform -translate-y-full focus:translate-y-0 transition-transform",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      )}
    >
      Skip to main content
    </a>
  );
};
