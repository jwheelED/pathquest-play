import { cn } from "@/lib/utils";

interface FloatingDecorationsProps {
  className?: string;
  variant?: 'default' | 'minimal';
}

export function FloatingDecorations({ className, variant = 'default' }: FloatingDecorationsProps) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {/* Clouds */}
      <div className="absolute -top-20 -left-20 w-64 h-32 bg-white/40 dark:bg-white/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '0s' }} />
      <div className="absolute top-10 right-10 w-48 h-24 bg-white/30 dark:bg-white/5 rounded-full blur-2xl animate-float" style={{ animationDelay: '1s' }} />
      <div className="absolute bottom-40 -right-10 w-56 h-28 bg-white/35 dark:bg-white/8 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      
      {variant === 'default' && (
        <>
          {/* Geometric shapes */}
          <div className="absolute top-20 left-[15%] w-3 h-3 bg-headspace-coral/30 dark:bg-headspace-coral/20 rotate-45 animate-float" style={{ animationDelay: '0.5s' }} />
          <div className="absolute top-40 right-[20%] w-4 h-4 bg-headspace-mint/40 dark:bg-headspace-mint/20 rounded-full animate-float" style={{ animationDelay: '1.5s' }} />
          <div className="absolute bottom-60 left-[25%] w-2 h-2 bg-headspace-amber/40 dark:bg-headspace-amber/20 rotate-45 animate-float" style={{ animationDelay: '2.5s' }} />
          <div className="absolute top-60 left-[60%] w-3 h-3 bg-white/50 dark:bg-white/20 rounded-full animate-float" style={{ animationDelay: '0.8s' }} />
          <div className="absolute bottom-80 right-[30%] w-2 h-2 bg-headspace-coral/25 dark:bg-headspace-coral/15 rotate-45 animate-float" style={{ animationDelay: '1.8s' }} />
          
          {/* Stars/sparkles */}
          <svg className="absolute top-32 right-[35%] w-4 h-4 text-headspace-amber/50 dark:text-headspace-amber/30 animate-pulse-soft" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L13.09 8.26L19 9L13.09 9.74L12 16L10.91 9.74L5 9L10.91 8.26L12 2Z" />
          </svg>
          <svg className="absolute bottom-48 left-[40%] w-3 h-3 text-white/60 dark:text-white/30 animate-pulse-soft" style={{ animationDelay: '1s' }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L13.09 8.26L19 9L13.09 9.74L12 16L10.91 9.74L5 9L10.91 8.26L12 2Z" />
          </svg>
        </>
      )}
    </div>
  );
}
