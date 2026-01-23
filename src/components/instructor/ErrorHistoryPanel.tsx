import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, XCircle, AlertTriangle, Info, X, RotateCcw } from "lucide-react";

export interface ErrorRecord {
  id: string;
  timestamp: Date;
  severity: 'critical' | 'warning' | 'info';
  category: 'transcription' | 'question_send' | 'extraction' | 'quota' | 'network' | 'system';
  message: string;
  details?: string;
  retryable?: boolean;
}

interface ErrorHistoryPanelProps {
  errors: ErrorRecord[];
  onRetry?: (errorId: string) => void;
  onDismiss?: (errorId: string) => void;
  onClearAll?: () => void;
}

const severityConfig = {
  critical: {
    icon: XCircle,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/20"
  },
  warning: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20"
  },
  info: {
    icon: Info,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20"
  }
};

export function ErrorHistoryPanel({ errors, onRetry, onDismiss, onClearAll }: ErrorHistoryPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (errors.length === 0) return null;

  const criticalCount = errors.filter(e => e.severity === 'critical').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleTimeString();
  };

  return (
    <Card className="border-destructive/20 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-base">Error History</CardTitle>
            <div className="flex gap-2">
              {criticalCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {criticalCount} critical
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="outline" className="text-xs border-orange-500/20 text-orange-500">
                  {warningCount} warnings
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? 'Show' : 'Hide'}
            </Button>
            {onClearAll && errors.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAll}
              >
                Clear All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      {!collapsed && (
        <CardContent className="pt-0">
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {errors.slice(0, 10).map((error) => {
                const config = severityConfig[error.severity];
                const Icon = config.icon;
                
                return (
                  <div
                    key={error.id}
                    className={`p-3 rounded-lg border ${config.borderColor} ${config.bgColor}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${config.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {error.category}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(error.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm font-medium break-words">{error.message}</p>
                          {error.details && (
                            <p className="text-xs text-muted-foreground mt-1 break-words">
                              {error.details}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {error.retryable && onRetry && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => onRetry(error.id)}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                        {onDismiss && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => onDismiss(error.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          
          {errors.length > 10 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Showing 10 most recent errors ({errors.length} total)
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
