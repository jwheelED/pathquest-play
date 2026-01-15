import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInDays } from 'date-fns';
import { CalendarDays, Target, Flame } from 'lucide-react';

interface StudyPlanHeaderProps {
  userId: string;
}

interface ActivePlan {
  id: string;
  title: string;
  exam_date: string;
  concepts_mastered: number;
  total_concepts: number;
}

export function StudyPlanHeader({ userId }: StudyPlanHeaderProps) {
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);
  const [todayTaskCount, setTodayTaskCount] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);

  useEffect(() => {
    if (userId) {
      fetchActivePlan();
    }
  }, [userId]);

  const fetchActivePlan = async () => {
    try {
      // Get active study plan
      const { data: plans } = await supabase
        .from('study_plans')
        .select('id, title, exam_date, concepts_mastered, total_concepts')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (plans && plans.length > 0) {
        setActivePlan(plans[0]);

        // Get today's tasks count
        const today = new Date().toISOString().split('T')[0];
        const { data: tasks, count } = await supabase
          .from('study_plan_daily_tasks')
          .select('id, completed', { count: 'exact' })
          .eq('plan_id', plans[0].id)
          .eq('scheduled_date', today);

        if (tasks) {
          setTodayTaskCount(tasks.length);
          setCompletedToday(tasks.filter(t => t.completed).length);
        }
      }
    } catch (error) {
      console.error('Error fetching study plan:', error);
    }
  };

  const today = new Date();
  const formattedDate = format(today, 'EEEE, MMMM d');
  
  const daysUntilExam = activePlan 
    ? differenceInDays(new Date(activePlan.exam_date), today)
    : null;

  const readinessPercent = activePlan && activePlan.total_concepts > 0
    ? Math.round((activePlan.concepts_mastered / activePlan.total_concepts) * 100)
    : 0;

  return (
    <div className="mb-6 space-y-3">
      {/* Today's Date */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="w-4 h-4" />
          <span className="text-sm font-medium">{formattedDate}</span>
        </div>
        
        {todayTaskCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">
              {completedToday}/{todayTaskCount} tasks
            </span>
            {completedToday === todayTaskCount && todayTaskCount > 0 && (
              <span className="text-primary">✓</span>
            )}
          </div>
        )}
      </div>

      {/* Active Study Plan Banner */}
      {activePlan && daysUntilExam !== null && daysUntilExam >= 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{activePlan.title}</span>
              </div>
              
              {/* Progress bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${readinessPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {readinessPercent}% prepared
              </p>
            </div>

            <div className="text-center shrink-0">
              <div className="flex items-center gap-1">
                <Flame className={daysUntilExam <= 3 ? "w-4 h-4 text-orange-500" : "w-4 h-4 text-muted-foreground"} />
                <span className={`text-2xl font-bold ${daysUntilExam <= 3 ? 'text-orange-500' : 'text-foreground'}`}>
                  {daysUntilExam}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {daysUntilExam === 1 ? 'day left' : 'days left'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
