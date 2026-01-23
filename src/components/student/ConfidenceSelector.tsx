import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Flame, Target, Shield, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very_high';

interface ConfidenceLevelConfig {
  level: ConfidenceLevel;
  label: string;
  emoji: string;
  icon: React.ComponentType<{ className?: string }>;
  multiplier: number;
  description: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  glowClass: string;
  riskLevel: number; // 0-100 for visual risk meter
}

const CONFIDENCE_LEVELS: ConfidenceLevelConfig[] = [
  {
    level: 'low',
    label: 'Not Sure',
    emoji: '🛡️',
    icon: Shield,
    multiplier: 0.5,
    description: 'Safe play • Half points if right',
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted/30',
    borderClass: 'border-border hover:border-muted-foreground/50',
    glowClass: '',
    riskLevel: 15,
  },
  {
    level: 'medium',
    label: 'Fairly Sure',
    emoji: '🎯',
    icon: Target,
    multiplier: 1.0,
    description: 'Standard play • Base points',
    colorClass: 'text-primary',
    bgClass: 'bg-primary/10',
    borderClass: 'border-primary/30 hover:border-primary/60',
    glowClass: 'hover:shadow-[0_0_20px_hsl(var(--primary)/0.2)]',
    riskLevel: 40,
  },
  {
    level: 'high',
    label: 'Confident',
    emoji: '⚡',
    icon: Zap,
    multiplier: 2.0,
    description: 'Bold play • 2x points or penalty',
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-500/15',
    borderClass: 'border-amber-500/40 hover:border-amber-500/80',
    glowClass: 'hover:shadow-[0_0_25px_hsl(45_100%_50%/0.25)]',
    riskLevel: 70,
  },
  {
    level: 'very_high',
    label: 'Absolutely Sure',
    emoji: '🔥',
    icon: Flame,
    multiplier: 3.0,
    description: 'Max risk • 3x points or big penalty',
    colorClass: 'text-orange-500',
    bgClass: 'bg-gradient-to-br from-orange-500/20 to-red-500/20',
    borderClass: 'border-orange-500/50 hover:border-orange-500',
    glowClass: 'hover:shadow-[0_0_30px_hsl(25_100%_50%/0.35)] animate-pulse-soft',
    riskLevel: 100,
  },
];

interface ConfidenceSelectorProps {
  baseReward: number;
  onSelect: (level: ConfidenceLevel, multiplier: number) => void;
  disabled?: boolean;
}

export function ConfidenceSelector({ baseReward, onSelect, disabled }: ConfidenceSelectorProps) {
  const [selectedLevel, setSelectedLevel] = useState<ConfidenceLevel | null>(null);
  const [hoveredLevel, setHoveredLevel] = useState<ConfidenceLevel | null>(null);

  const handleSelect = (level: ConfidenceLevel, multiplier: number) => {
    if (selectedLevel || disabled) return;
    setSelectedLevel(level);
    onSelect(level, multiplier);
  };

  return (
    <div className="space-y-5 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-1">
        <h3 className="text-xl font-bold text-foreground">How confident are you?</h3>
        <p className="text-sm text-muted-foreground">
          Higher confidence = bigger rewards (or penalties!)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CONFIDENCE_LEVELS.map((config, index) => {
          const Icon = config.icon;
          const isSelected = selectedLevel === config.level;
          const isHovered = hoveredLevel === config.level;
          const isLocked = selectedLevel !== null;
          const potentialReward = Math.round(baseReward * config.multiplier);
          const potentialLoss = config.level === 'low' ? Math.round(baseReward * 0.25) : 
                               config.level === 'medium' ? 0 :
                               Math.round(baseReward * config.multiplier * 0.5);

          return (
            <Card
              key={config.level}
              className={cn(
                "relative p-4 cursor-pointer transition-all duration-300 border-2 overflow-hidden",
                "transform hover:scale-[1.02] active:scale-[0.98]",
                config.borderClass,
                config.glowClass,
                isSelected && [
                  "scale-105 ring-2 ring-offset-2 ring-offset-background",
                  config.level === 'very_high' && "ring-orange-500 animate-lock-in-fire",
                  config.level === 'high' && "ring-amber-500 animate-lock-in-bounce",
                  config.level === 'medium' && "ring-primary animate-lock-in-bounce",
                  config.level === 'low' && "ring-muted-foreground animate-lock-in-bounce",
                ],
                isLocked && !isSelected && "opacity-30 scale-95 blur-[1px] pointer-events-none",
                disabled && "opacity-40 cursor-not-allowed",
                // Staggered entry animation
                "animate-in fade-in-0 slide-in-from-bottom-4",
              )}
              style={{
                animationDelay: `${index * 75}ms`,
                animationFillMode: 'both',
              }}
              onClick={() => handleSelect(config.level, config.multiplier)}
              onMouseEnter={() => setHoveredLevel(config.level)}
              onMouseLeave={() => setHoveredLevel(null)}
            >
              {/* Risk meter bar at top */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-muted/30 overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-500",
                    config.level === 'very_high' && "bg-gradient-to-r from-orange-500 to-red-500",
                    config.level === 'high' && "bg-gradient-to-r from-amber-400 to-orange-500",
                    config.level === 'medium' && "bg-primary",
                    config.level === 'low' && "bg-muted-foreground/50",
                    (isHovered || isSelected) && "animate-pulse"
                  )}
                  style={{ width: `${config.riskLevel}%` }}
                />
              </div>

              {/* Background glow effect for high risk options */}
              {(config.level === 'very_high' || config.level === 'high') && (isHovered || isSelected) && (
                <div className={cn(
                  "absolute inset-0 opacity-20 transition-opacity duration-300",
                  config.level === 'very_high' && "bg-gradient-to-br from-orange-500/40 to-red-500/40",
                  config.level === 'high' && "bg-gradient-to-br from-amber-500/30 to-orange-500/30"
                )} />
              )}

              <div className="relative flex items-start gap-3">
                <div className={cn(
                  "p-2.5 rounded-xl transition-all duration-300",
                  config.bgClass,
                  isSelected && "scale-110",
                  (isHovered || isSelected) && config.level === 'very_high' && "animate-pulse-soft"
                )}>
                  <Icon className={cn(
                    "w-5 h-5 transition-all duration-300",
                    config.colorClass,
                    isSelected && "scale-110"
                  )} />
                </div>
                
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{config.emoji}</span>
                    <h4 className={cn(
                      "font-bold text-foreground transition-all",
                      isSelected && "text-lg"
                    )}>
                      {config.label}
                    </h4>
                  </div>
                  
                  <p className="text-xs text-muted-foreground leading-tight">
                    {config.description}
                  </p>
                  
                  {/* XP Preview */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5">
                    <div className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold transition-all",
                      config.bgClass,
                      config.colorClass
                    )}>
                      <TrendingUp className="w-3 h-3" />
                      +{potentialReward}
                    </div>
                    {potentialLoss > 0 && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-destructive/10 text-destructive">
                        -{potentialLoss}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lock-in checkmark */}
                {isSelected && (
                  <div className={cn(
                    "absolute -top-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold animate-lock-in-check",
                    config.level === 'very_high' && "bg-gradient-to-br from-orange-500 to-red-500",
                    config.level === 'high' && "bg-amber-500",
                    config.level === 'medium' && "bg-primary",
                    config.level === 'low' && "bg-muted-foreground"
                  )}>
                    ✓
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Lock-in confirmation message */}
      {selectedLevel && (
        <div className={cn(
          "text-center py-3 px-4 rounded-xl font-medium animate-in fade-in-0 zoom-in-95 duration-300",
          selectedLevel === 'very_high' && "bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-500",
          selectedLevel === 'high' && "bg-amber-500/20 text-amber-600",
          selectedLevel === 'medium' && "bg-primary/20 text-primary",
          selectedLevel === 'low' && "bg-muted text-muted-foreground"
        )}>
          🔒 Locked in with {CONFIDENCE_LEVELS.find(c => c.level === selectedLevel)?.emoji}{' '}
          <span className="font-bold">{CONFIDENCE_LEVELS.find(c => c.level === selectedLevel)?.label}</span>!
        </div>
      )}
    </div>
  );
}
