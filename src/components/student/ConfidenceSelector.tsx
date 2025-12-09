import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Flame, Target, Shield, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very_high';

interface ConfidenceLevelConfig {
  level: ConfidenceLevel;
  label: string;
  emoji: string;
  icon: React.ComponentType<{ className?: string }>;
  multiplier: number;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const CONFIDENCE_LEVELS: ConfidenceLevelConfig[] = [
  {
    level: 'low',
    label: 'Not Sure',
    emoji: '🤔',
    icon: Shield,
    multiplier: 0.5,
    description: 'Play it safe - Half points if correct, minimal penalty if wrong',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-border',
  },
  {
    level: 'medium',
    label: 'Fairly Confident',
    emoji: '🎯',
    icon: Target,
    multiplier: 1.0,
    description: 'Standard points - No bonus, no penalty',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
  {
    level: 'high',
    label: 'Confident',
    emoji: '💪',
    icon: TrendingUp,
    multiplier: 2.0,
    description: 'High confidence - 2x points if correct, penalty if wrong',
    color: 'text-accent',
    bgColor: 'bg-accent/20',
    borderColor: 'border-accent/50',
  },
  {
    level: 'very_high',
    label: 'Absolutely Sure',
    emoji: '🔥',
    icon: Flame,
    multiplier: 3.0,
    description: 'Maximum confidence - 3x points if correct, larger penalty if wrong',
    color: 'text-destructive',
    bgColor: 'bg-destructive/20',
    borderColor: 'border-destructive/50',
  },
];

interface ConfidenceSelectorProps {
  baseReward: number;
  onSelect: (level: ConfidenceLevel, multiplier: number) => void;
  disabled?: boolean;
}

export function ConfidenceSelector({ baseReward, onSelect, disabled }: ConfidenceSelectorProps) {
  const [selectedLevel, setSelectedLevel] = useState<ConfidenceLevel | null>(null);

  const handleSelect = (level: ConfidenceLevel, multiplier: number) => {
    if (selectedLevel || disabled) return; // Prevent re-selection after choosing
    setSelectedLevel(level);
    // Auto-submit immediately on selection
    onSelect(level, multiplier);
  };

  return (
    <div className="space-y-4 animate-in fade-in-0 zoom-in-95 duration-300">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-foreground">How Confident Are You?</h3>
        <p className="text-sm text-muted-foreground">
          Tap your confidence level to submit
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CONFIDENCE_LEVELS.map((config) => {
          const Icon = config.icon;
          const isSelected = selectedLevel === config.level;
          const isLocked = selectedLevel !== null;
          const potentialReward = Math.round(baseReward * config.multiplier);
          const potentialLoss = config.level === 'low' ? Math.round(baseReward * 0.25) : 
                               config.level === 'medium' ? 0 :
                               Math.round(baseReward * config.multiplier * 0.5);

          return (
            <Card
              key={config.level}
              className={cn(
                "relative p-4 cursor-pointer transition-all duration-200 border-2",
                isSelected ? `${config.borderColor} ${config.bgColor} scale-105 shadow-lg` : "border-border hover:border-primary/30",
                isLocked && !isSelected && "opacity-40 cursor-not-allowed",
                disabled && "opacity-40 cursor-not-allowed"
              )}
              onClick={() => handleSelect(config.level, config.multiplier)}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-2 rounded-lg transition-colors",
                  isSelected ? config.bgColor : "bg-muted"
                )}>
                  <Icon className={cn(
                    "w-5 h-5",
                    isSelected ? config.color : "text-muted-foreground"
                  )} />
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{config.emoji}</span>
                    <h4 className="font-bold text-foreground">{config.label}</h4>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    {config.description}
                  </p>
                  
                  <div className="flex items-center gap-3 pt-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Win:</span>
                      <span className={cn("text-sm font-bold", config.color)}>
                        +{potentialReward} XP
                      </span>
                    </div>
                    {potentialLoss > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Lose:</span>
                        <span className="text-sm font-bold text-destructive">
                          -{potentialLoss} XP
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold",
                      config.bgColor
                    )}>
                      ✓
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {selectedLevel && (
        <p className="text-sm text-center text-primary font-medium animate-in fade-in-0">
          🔒 Locked in with {CONFIDENCE_LEVELS.find(c => c.level === selectedLevel)?.emoji} {CONFIDENCE_LEVELS.find(c => c.level === selectedLevel)?.label}!
        </p>
      )}
    </div>
  );
}
