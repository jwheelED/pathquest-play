import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface Activity {
  id: number;
  name: string;
  action: string;
  time: string;
}

const activities: Activity[] = [
  { id: 1, name: 'Sarah M.', action: 'completed Lesson 5', time: 'just now' },
  { id: 2, name: 'Dr. Johnson', action: 'started live lecture', time: '2 min ago' },
  { id: 3, name: 'Alex K.', action: 'achieved 10-day streak', time: '5 min ago' },
  { id: 4, name: 'Prof. Williams', action: 'joined Edvana', time: '10 min ago' },
  { id: 5, name: 'Emma L.', action: 'earned Achievement badge', time: '15 min ago' }
];

export const ActivityFeed = () => {
  const [currentActivity, setCurrentActivity] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentActivity((prev) => (prev + 1) % activities.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const activity = activities[currentActivity];

  return (
    <div className="inline-flex items-center gap-3 px-4 py-3 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-lg animate-fade-in">
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-white" />
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary animate-pulse" />
      </div>
      <div className="text-sm">
        <span className="font-semibold text-foreground">{activity.name}</span>{' '}
        <span className="text-muted-foreground">{activity.action}</span>
      </div>
      <span className="text-xs text-muted-foreground">{activity.time}</span>
    </div>
  );
};
