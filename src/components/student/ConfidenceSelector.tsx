import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    description: 'Safe bet - Half rewards if correct, small penalty if wrong',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-border',
  },
  {
    level: 'medium',
    label: 'Maybe',
    emoji: '🎯',
    icon: Target,
    multiplier: 1.0,
    description: 'Normal rewards - Standard points, no gambling',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
  {
    level: 'high',
    label: 'Pretty Sure',
    emoji: '💪',
    icon: TrendingUp,
    multiplier: 2.0,
    description: 'Double or nothing - 2x rewards if correct, lose points if wrong',
    color: 'text-accent',
    bgColor: 'bg-accent/20',
    borderColor: 'border-accent/50',
  },
  {
    level: 'very_high',
    label: 'ALL IN! 🔥',
    emoji: '🔥',
    icon: Flame,
    multiplier: 3.0,
    description: 'HIGH RISK! 3x rewards if correct, BIG penalty if wrong',
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
  const [isLocked, setIsLocked] = useState(false);

  const handleSelect = (level: ConfidenceLevel, multiplier: number) => {
    if (isLocked || disabled) return;
    setSelectedLevel(level);
  };

  const handleConfirm = () => {
    if (!selectedLevel || isLocked || disabled) return;
    const config = CONFIDENCE_LEVELS.find(c => c.level === selectedLevel);
    if (config) {
      setIsLocked(true);
      onSelect(selectedLevel, config.multiplier);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in-0 zoom-in-95 duration-300">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-foreground">How Confident Are You?</h3>
        <p className="text-sm text-muted-foreground">
          Choose your confidence level to gamble your points
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CONFIDENCE_LEVELS.map((config) => {
          const Icon = config.icon;
          const isSelected = selectedLevel === config.level;
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
                isLocked && "opacity-60 cursor-not-allowed",
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

      <Button
        onClick={handleConfirm}
        disabled={!selectedLevel || isLocked || disabled}
        className="w-full h-12 text-lg font-bold"
        variant="default"
      >
        {isLocked ? '🔒 Locked In!' : selectedLevel ? `Lock In ${CONFIDENCE_LEVELS.find(c => c.level === selectedLevel)?.emoji}` : 'Select Your Confidence'}
      </Button>

      {selectedLevel && !isLocked && (
        <p className="text-xs text-center text-muted-foreground animate-pulse">
          ⚠️ Once you lock in, you can't change your mind!
        </p>
      )}
    </div>
  );
}
