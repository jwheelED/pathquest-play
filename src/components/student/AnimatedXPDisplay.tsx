import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Sparkles, Flame } from "lucide-react";

interface AnimatedXPDisplayProps {
  points: number;
  multiplier?: number;
  isCorrect: boolean;
  className?: string;
}

export function AnimatedXPDisplay({ points, multiplier = 1, isCorrect, className }: AnimatedXPDisplayProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const [showBurst, setShowBurst] = useState(false);
  
  const absPoints = Math.abs(points);
  const isGain = points > 0;
  const isHighMultiplier = multiplier >= 2;
  const isMaxMultiplier = multiplier >= 3;

  useEffect(() => {
    // Reset and start animation
    setDisplayValue(0);
    setIsAnimating(true);
    setShowBurst(false);
    
    const duration = 1200; // 1.2 seconds
    const steps = 30;
    const stepTime = duration / steps;
    const increment = absPoints / steps;
    
    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      // Ease out cubic for satisfying deceleration
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(absPoints * easedProgress));
      
      if (currentStep >= steps) {
        clearInterval(timer);
        setDisplayValue(absPoints);
        setIsAnimating(false);
        if (isGain && absPoints >= 15) {
          setShowBurst(true);
        }
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [points, absPoints, isGain]);

  return (
    <div className={cn("relative flex flex-col items-center gap-2", className)}>
      {/* Celebration burst effect */}
      {showBurst && isGain && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <Sparkles
              key={i}
              className={cn(
                "absolute w-4 h-4 text-achievement animate-xp-particle",
                isMaxMultiplier && "text-streak"
              )}
              style={{
                left: `${50 + Math.cos(i * 45 * Math.PI / 180) * 40}%`,
                top: `${50 + Math.sin(i * 45 * Math.PI / 180) * 40}%`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      )}
      
      {/* Main XP display */}
      <div className={cn(
        "flex items-center gap-3 transition-all duration-300",
        isAnimating && "scale-110",
        !isAnimating && showBurst && "animate-xp-complete"
      )}>
        {isGain ? (
          <div className={cn(
            "p-2 rounded-full transition-all",
            isMaxMultiplier ? "bg-streak/20 animate-pulse-soft" : 
            isHighMultiplier ? "bg-achievement/20" : "bg-primary/20"
          )}>
            {isMaxMultiplier ? (
              <Flame className="w-6 h-6 text-streak animate-pulse-soft" />
            ) : (
              <TrendingUp className={cn(
                "w-6 h-6",
                isHighMultiplier ? "text-achievement" : "text-primary"
              )} />
            )}
          </div>
        ) : (
          <div className="p-2 rounded-full bg-destructive/20">
            <TrendingDown className="w-6 h-6 text-destructive" />
          </div>
        )}
        
        <div className="flex flex-col items-center">
          <span className={cn(
            "font-bold transition-all",
            isAnimating ? "text-4xl" : "text-3xl",
            isGain 
              ? isMaxMultiplier 
                ? "text-streak animate-text-glow-fire" 
                : isHighMultiplier 
                  ? "text-achievement animate-text-glow-gold"
                  : "text-primary"
              : "text-destructive"
          )}>
            {isGain ? "+" : "-"}{displayValue}
          </span>
          <span className={cn(
            "text-sm font-medium uppercase tracking-wider",
            isGain ? "text-primary" : "text-destructive"
          )}>
            XP
          </span>
        </div>
      </div>
      
      {/* Multiplier badge */}
      {multiplier > 1 && isGain && (
        <div className={cn(
          "flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold animate-fade-in",
          isMaxMultiplier 
            ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30" 
            : isHighMultiplier
              ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-400/30"
              : "bg-primary/20 text-primary"
        )}>
          {isMaxMultiplier && <Flame className="w-3 h-3" />}
          {multiplier}x Confidence Bonus!
          {isMaxMultiplier && <Flame className="w-3 h-3" />}
        </div>
      )}
    </div>
  );
}
