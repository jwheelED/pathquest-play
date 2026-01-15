import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, BookOpen, AlertTriangle, Sparkles, ChevronRight, FileText } from 'lucide-react';
import { PathItemType } from '@/hooks/useLearningPath';

interface PathActionCardProps {
  type: PathItemType;
  title: string;
  description: string;
  timeEstimate?: string;
  dueDate?: string;
  sourceContext?: string;
  onClick: () => void;
  isFirst?: boolean;
}

const typeConfig: Record<string, {
  label: string;
  icon: typeof Sparkles;
  accentClass: string;
  badgeVariant: 'default';
  badgeClass: string;
  dotClass: string;
}> = {
  prime: {
    label: 'Prep for Tomorrow',
    icon: Sparkles,
    accentClass: 'path-card-prime',
    badgeVariant: 'default' as const,
    badgeClass: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    dotClass: 'bg-violet-500 border-violet-400',
  },
  core: {
    label: 'Due Soon',
    icon: BookOpen,
    accentClass: 'path-card-core',
    badgeVariant: 'default' as const,
    badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    dotClass: 'bg-amber-500 border-amber-400',
  },
  review: {
    label: 'Weakness Detected',
    icon: AlertTriangle,
    accentClass: 'path-card-review',
    badgeVariant: 'default' as const,
    badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    dotClass: 'bg-rose-500 border-rose-400',
  },
  'study-plan': {
    label: 'Study Plan',
    icon: BookOpen,
    accentClass: 'path-card-core',
    badgeVariant: 'default' as const,
    badgeClass: 'bg-primary/20 text-primary border-primary/30',
    dotClass: 'bg-primary border-primary/80',
  },
};

export function PathActionCard({
  type,
  title,
  description,
  timeEstimate,
  dueDate,
  sourceContext,
  onClick,
  isFirst,
}: PathActionCardProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className={`path-card ${config.accentClass} ${isFirst ? 'ring-2 ring-primary/30' : ''}`}>
      {/* Timeline dot */}
      <div className={`path-dot ${config.dotClass}`} />
      
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Type Badge */}
          <Badge variant="outline" className={`text-xs mb-2 ${config.badgeClass}`}>
            {config.label}
          </Badge>

          <h3 className="font-semibold text-foreground mb-1 line-clamp-2">{title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{description}</p>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-3">
            {timeEstimate && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {timeEstimate}
              </span>
            )}
            {dueDate && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                <Clock className="w-3 h-3" />
                Due: {dueDate}
              </span>
            )}
            {sourceContext && (
              <Badge 
                variant="outline" 
                className="text-xs bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <FileText className="w-3 h-3 mr-1" />
                {sourceContext}
              </Badge>
            )}
          </div>
        </div>

        {/* Action Button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onClick}
          className="flex-shrink-0 rounded-full w-10 h-10 p-0 hover:bg-primary/10"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
