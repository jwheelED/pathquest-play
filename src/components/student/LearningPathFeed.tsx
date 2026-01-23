import { useState, useCallback } from 'react';
import { useLearningPath } from '@/hooks/useLearningPath';
import { PathActionCard } from './PathActionCard';
import { PathEmptyState } from './PathEmptyState';
import { PracticeQuestionCard } from './PracticeQuestionCard';
import { Loader2 } from 'lucide-react';

interface LearningPathFeedProps {
  userId: string;
  classId?: string;
  onNavigate: (path: string, state?: any) => void;
  onUpload: () => void;
}

export function LearningPathFeed({ userId, classId, onNavigate, onUpload }: LearningPathFeedProps) {
  const [practiceQuestion, setPracticeQuestion] = useState<any>(null);

  const handlePractice = useCallback((question: any) => {
    setPracticeQuestion(question);
  }, []);

  const { items, loading, hasRealContent } = useLearningPath(
    userId, 
    classId, 
    onNavigate,
    handlePractice,
    onUpload
  );

  const handleQuestionComplete = (correct: boolean) => {
    setPracticeQuestion(null);
    // Could refresh the feed here if needed
  };

  if (loading) {
    return (
      <div className="path-timeline">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Show practice question card if active
  if (practiceQuestion) {
    return (
      <div className="path-timeline">
        <PracticeQuestionCard
          question={practiceQuestion}
          onComplete={handleQuestionComplete}
          onSkip={() => setPracticeQuestion(null)}
          onClose={() => setPracticeQuestion(null)}
        />
      </div>
    );
  }

  // Show empty state if no REAL content (student materials, assignments, etc.)
  // Daily challenges alone don't count as real content
  if (!hasRealContent) {
    return (
      <div className="path-timeline">
        <PathEmptyState
          onUpload={onUpload}
          onJoinClass={() => onNavigate('/onboarding')}
        />
      </div>
    );
  }

  // Show caught up message if has real content but no pending items
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
