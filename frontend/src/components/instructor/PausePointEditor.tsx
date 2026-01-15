import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Plus, Trash2, GripVertical, BookOpen, ArrowRightLeft, 
  ListChecks, Image, Sparkles, Clock, Target, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PausePoint {
  id: string;
  timestamp: number;
  reason: PausePointReason;
  isHighYield?: boolean;
  order_index: number;
}

export type PausePointReason = 
  | "topic_transition" 
  | "end_of_example" 
  | "summary_detected" 
  | "diagram_change"
  | "key_concept"
  | "complex_material"
  | "manual";

interface PausePointEditorProps {
  durationSeconds: number;
  pausePoints: PausePoint[];
  onPausePointsChange: (points: PausePoint[]) => void;
  flowLevel: number; // 1-5, where 1 = fewer pauses, 5 = more pauses
  onFlowLevelChange: (level: number) => void;
  highYieldOnly: boolean;
  onHighYieldOnlyChange: (value: boolean) => void;
  recommendedCount: number;
  disabled?: boolean;
}

const REASON_CONFIG: Record<PausePointReason, { label: string; icon: typeof BookOpen; color: string }> = {
  topic_transition: { label: "Topic transition", icon: ArrowRightLeft, color: "bg-blue-500" },
  end_of_example: { label: "End of example", icon: ListChecks, color: "bg-emerald-500" },
  summary_detected: { label: "Summary detected", icon: BookOpen, color: "bg-purple-500" },
  diagram_change: { label: "Diagram/slide change", icon: Image, color: "bg-amber-500" },
  key_concept: { label: "Key concept", icon: Sparkles, color: "bg-pink-500" },
  complex_material: { label: "Complex material", icon: Target, color: "bg-red-500" },
  manual: { label: "Manual", icon: Plus, color: "bg-muted-foreground" },
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const PausePointEditor = ({
  durationSeconds,
  pausePoints,
  onPausePointsChange,
  flowLevel,
  onFlowLevelChange,
  highYieldOnly,
  onHighYieldOnlyChange,
  recommendedCount,
  disabled = false,
}: PausePointEditorProps) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Filter points based on high-yield mode
  const visiblePoints = useMemo(() => {
    if (highYieldOnly) {
      return pausePoints.filter(p => p.isHighYield);
    }
    return pausePoints;
  }, [pausePoints, highYieldOnly]);

  const getPositionPercent = (timestamp: number) => {
    return Math.min(100, Math.max(0, (timestamp / durationSeconds) * 100));
  };

  const getTimestampFromPosition = (clientX: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // Enforce minimum 60 seconds from start, 30 seconds from end
    const minTimestamp = Math.min(60, durationSeconds * 0.1);
    const maxTimestamp = durationSeconds - 30;
    const timestamp = percent * durationSeconds;
    return Math.max(minTimestamp, Math.min(maxTimestamp, timestamp));
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (disabled || draggingId) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('[data-pause-point]')) return;

    const timestamp = getTimestampFromPosition(e.clientX);
    const newPoint: PausePoint = {
      id: `manual-${Date.now()}`,
      timestamp,
      reason: "manual",
      isHighYield: false,
      order_index: pausePoints.length,
    };
    onPausePointsChange([...pausePoints, newPoint].sort((a, b) => a.timestamp - b.timestamp));
  };

  const handleDragStart = (e: React.MouseEvent, id: string) => {
    if (disabled) return;
    e.stopPropagation();
    setDraggingId(id);
  };

  const handleDrag = (e: React.MouseEvent) => {
    if (!draggingId || disabled) return;
    const newTimestamp = getTimestampFromPosition(e.clientX);
    onPausePointsChange(
      pausePoints.map(p => 
        p.id === draggingId ? { ...p, timestamp: newTimestamp } : p
      ).sort((a, b) => a.timestamp - b.timestamp)
    );
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const removePoint = (id: string) => {
    if (disabled) return;
    onPausePointsChange(pausePoints.filter(p => p.id !== id));
  };

  const toggleHighYield = (id: string) => {
    if (disabled) return;
    onPausePointsChange(
      pausePoints.map(p => 
        p.id === id ? { ...p, isHighYield: !p.isHighYield } : p
      )
    );
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingId) {
        handleDrag(e as unknown as React.MouseEvent);
      }
    };
    const handleMouseUp = () => {
      if (draggingId) {
        handleDragEnd();
      }
    };

    if (draggingId) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingId]);

  const flowLabels = ["Minimal", "Fewer", "Balanced", "More", "Maximum"];

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" />
          Pause Point Configuration
        </CardTitle>
        <CardDescription className="text-xs">
          AI recommends {recommendedCount} pause points for this {formatTime(durationSeconds)} lecture
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Flow Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Interruption Frequency</Label>
            <Badge variant="outline" className="text-xs">
              {flowLabels[flowLevel - 1]} ({visiblePoints.length} points)
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Fewer</span>
            <Slider
              value={[flowLevel]}
              onValueChange={([val]) => onFlowLevelChange(val)}
              min={1}
              max={5}
              step={1}
              disabled={disabled}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-16 text-right">More</span>
          </div>
        </div>

        {/* High-yield only toggle */}
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <div>
              <Label className="text-sm font-medium">High-yield only mode</Label>
              <p className="text-xs text-muted-foreground">Show only the most important pause points</p>
            </div>
          </div>
          <Switch
            checked={highYieldOnly}
            onCheckedChange={onHighYieldOnlyChange}
            disabled={disabled}
          />
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>0:00</span>
            <span>Click timeline to add pause points</span>
            <span>{formatTime(durationSeconds)}</span>
          </div>
          
          <div
            ref={timelineRef}
            className={cn(
              "relative h-16 bg-muted/30 rounded-lg border-2 border-dashed cursor-crosshair",
              disabled && "opacity-50 cursor-not-allowed",
              draggingId && "cursor-grabbing"
            )}
            onClick={handleTimelineClick}
            onMouseMove={draggingId ? handleDrag : undefined}
          >
            {/* Progress track */}
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-2 bg-muted rounded-full" />
            
            {/* Pause point markers */}
            <TooltipProvider delayDuration={0}>
              {visiblePoints.map((point) => {
                const config = REASON_CONFIG[point.reason];
                const Icon = config.icon;
                const isActive = hoveredId === point.id || draggingId === point.id;
                
                return (
                  <Tooltip key={point.id}>
                    <TooltipTrigger asChild>
                      <div
                        data-pause-point
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-150",
                          "cursor-grab active:cursor-grabbing",
                          isActive && "z-10 scale-125"
                        )}
                        style={{ left: `${getPositionPercent(point.timestamp)}%` }}
                        onMouseDown={(e) => handleDragStart(e, point.id)}
                        onMouseEnter={() => setHoveredId(point.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <div 
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shadow-md",
                            config.color,
                            point.isHighYield && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background"
                          )}
                        >
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        {/* Vertical line */}
                        <div className={cn(
                          "absolute left-1/2 -translate-x-1/2 w-0.5 h-4 -bottom-4",
                          config.color.replace("bg-", "bg-")
                        )} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="p-0">
                      <div className="p-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {formatTime(point.timestamp)}
                          </Badge>
                          <span className="text-xs font-medium">{config.label}</span>
                          {point.isHighYield && (
                            <Zap className="h-3 w-3 text-amber-500" />
                          )}
                        </div>
                        <div className="flex gap-1 pt-1 border-t">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleHighYield(point.id);
                            }}
                          >
                            <Zap className={cn("h-3 w-3 mr-1", point.isHighYield ? "text-amber-500" : "text-muted-foreground")} />
                            {point.isHighYield ? "Unmark" : "Mark"} high-yield
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePoint(point.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(REASON_CONFIG).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={cn("w-2.5 h-2.5 rounded-full", config.color)} />
              <span>{config.label}</span>
            </div>
          ))}
        </div>

        {/* Point List */}
        {visiblePoints.length > 0 && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {visiblePoints.map((point, index) => {
              const config = REASON_CONFIG[point.reason];
              const Icon = config.icon;
              
              return (
                <div
                  key={point.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-md bg-muted/30 text-sm",
                    hoveredId === point.id && "bg-muted"
                  )}
                  onMouseEnter={() => setHoveredId(point.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <div className={cn("w-5 h-5 rounded-full flex items-center justify-center", config.color)}>
                    <Icon className="h-3 w-3 text-white" />
                  </div>
                  <span className="font-mono text-xs w-12">{formatTime(point.timestamp)}</span>
                  <span className="flex-1 text-xs text-muted-foreground truncate">{config.label}</span>
                  {point.isHighYield && <Zap className="h-3 w-3 text-amber-500" />}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => removePoint(point.id)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Helper function to calculate recommended pause point count based on video duration
export const calculateRecommendedPausePoints = (durationSeconds: number, flowLevel: number = 3): number => {
  // Base recommendation: 1 question per 3-5 minutes depending on flow level
  const minutesPerQuestion = 6 - flowLevel; // Flow 1 = 5min, Flow 5 = 1min
  const baseCount = Math.floor(durationSeconds / 60 / minutesPerQuestion);
  
  // Clamp between 3 and 20
  return Math.max(3, Math.min(20, baseCount));
};

// Helper function to generate auto-placed pause points
export const generateAutoPausePoints = (
  durationSeconds: number, 
  count: number,
  existingReasons?: { timestamp: number; reason: PausePointReason; isHighYield?: boolean }[]
): PausePoint[] => {
  const minTimestamp = Math.min(60, durationSeconds * 0.1);
  const maxTimestamp = durationSeconds - 30;
  const usableRange = maxTimestamp - minTimestamp;
  
  if (existingReasons && existingReasons.length > 0) {
    // Use existing AI-generated reasons if available
    return existingReasons.slice(0, count).map((r, i) => ({
      id: `auto-${i}`,
      timestamp: r.timestamp,
      reason: r.reason,
      isHighYield: r.isHighYield ?? (i < Math.ceil(count / 3)), // Top 1/3 are high-yield by default
      order_index: i,
    }));
  }
  
  // Generate evenly spaced points
  const spacing = usableRange / (count + 1);
  const points: PausePoint[] = [];
  
  const defaultReasons: PausePointReason[] = [
    "topic_transition", "key_concept", "end_of_example", 
    "summary_detected", "complex_material", "diagram_change"
  ];
  
  for (let i = 0; i < count; i++) {
    points.push({
      id: `auto-${i}`,
      timestamp: minTimestamp + spacing * (i + 1),
      reason: defaultReasons[i % defaultReasons.length],
      isHighYield: i < Math.ceil(count / 3), // Top 1/3 are high-yield
      order_index: i,
    });
  }
  
  return points;
};
