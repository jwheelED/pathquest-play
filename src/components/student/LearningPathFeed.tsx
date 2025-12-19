import { useLearningPath } from '@/hooks/useLearningPath';
import { PathActionCard } from './PathActionCard';
import { Loader2 } from 'lucide-react';

interface LearningPathFeedProps {
  userId: string;
  classId?: string;
  onNavigate: (path: string, state?: any) => void;
}

export function LearningPathFeed({ userId, classId, onNavigate }: LearningPathFeedProps) {
  const { items, loading } = useLearningPath(userId, classId, onNavigate);

  if (loading) {
    return (
      <div className="path-timeline">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="path-timeline">
        <div className="path-card text-center py-8">
          <p className="text-muted-foreground">
            🎉 You're all caught up! Check back later for new learning items.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="path-timeline space-y-4">
      {items.map((item, index) => (
        <div key={item.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
          <PathActionCard
            type={item.type}
            title={item.title}
            description={item.description}
            timeEstimate={item.timeEstimate}
            dueDate={item.dueDate}
            sourceContext={item.sourceContext}
            onClick={item.action}
            isFirst={index === 0}
          />
        </div>
      ))}
    </div>
  );
}
