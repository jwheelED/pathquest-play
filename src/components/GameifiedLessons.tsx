import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface GameifiedLessonsProps {
  userId?: string;
  onProgressChange?: (progress: number) => void;
  onLessonComplete?: (points: number) => void;
}

interface Lesson {
  id: string;
  title: string;
  step_number: number;
  type: string;
  content: string | null;
}

export default function GameifiedLessons({ userId, onProgressChange, onLessonComplete }: GameifiedLessonsProps) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchLessonsAndProgress();
    }
  }, [userId]);

  const fetchLessonsAndProgress = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      // Fetch all lessons for this user
      const { data: lessonData, error: lessonError } = await supabase
        .from("lessons")
        .select("*")
        .eq("user_id", userId)
        .order("step_number");

      // Fetch progress for this user
      const { data: progressData, error: progressError } = await supabase
        .from("lesson_progress")
        .select("lesson_id")
        .eq("user_id", userId);

      if (!lessonError && lessonData) {
        setLessons(lessonData);
      }

      if (!progressError && progressData) {
        const ids = progressData.map((entry) => entry.lesson_id);
        setCompletedLessons(ids);
        if (onProgressChange && lessonData) {
          onProgressChange((ids.length / lessonData.length) * 100);
        }
      }
    } catch (error) {
      console.error("Error fetching lessons:", error);
    }
    setLoading(false);
  };

  const toggleLesson = async (lessonId: string, lessonTitle: string) => {
    if (!userId) return;
    
    const alreadyCompleted = completedLessons.includes(lessonId);
    
    setLoading(true);
    try {
      if (alreadyCompleted) {
        // Mark as incomplete
        const { error } = await supabase
          .from("lesson_progress")
          .delete()
          .eq("user_id", userId)
          .eq("lesson_id", lessonId);

        if (!error) {
          const updated = completedLessons.filter((id) => id !== lessonId);
          setCompletedLessons(updated);
          if (onProgressChange) {
            onProgressChange((updated.length / lessons.length) * 100);
          }
          toast.info(`${lessonTitle} marked as incomplete`);
        }
      } else {
        // Mark as complete
        const { error } = await supabase
          .from("lesson_progress")
          .insert({ user_id: userId, lesson_id: lessonId, completed: true });

        if (!error) {
          const updated = [...completedLessons, lessonId];
          setCompletedLessons(updated);
          
          // Award XP and coins for completing lesson
          const xpReward = 25;
          const coinReward = 10;
          
          await updateUserStats(xpReward, coinReward);
          
          if (onProgressChange) {
            onProgressChange((updated.length / lessons.length) * 100);
          }
          
          onLessonComplete?.(xpReward);
          
          toast.success(`🎉 Lesson completed!`, {
            description: `+${xpReward} XP, +${coinReward} coins`,
          });
        }
      }
    } catch (error) {
      console.error("Error updating lesson progress:", error);
      toast.error("Failed to update lesson progress");
    }
    setLoading(false);
  };

  const updateUserStats = async (xp: number, coins: number) => {
    if (!userId) return;

    const { data: stats } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (stats) {
      const newXP = stats.experience_points + xp;
      const newLevel = Math.floor(newXP / 100) + 1;
      const leveledUp = newLevel > stats.level;

      await supabase
        .from("user_stats")
        .update({
          experience_points: newXP,
          level: newLevel,
          coins: stats.coins + coins,
        })
        .eq("user_id", userId);

      if (leveledUp) {
        toast.success(`🚀 Level Up!`, {
          description: `Welcome to Level ${newLevel}!`,
          duration: 5000,
        });
      }
    }
  };

  const getLessonIcon = (type: string) => {
    switch (type) {
      case 'video': return '🎬';
      case 'reading': return '📖';
      case 'quiz': return '🧠';
      case 'exercise': return '💪';
      default: return '📚';
    }
  };

  if (loading && lessons.length === 0) {
    return (
      <Card className="p-6 animate-pulse">
        <div className="space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-secondary border-2 border-secondary-glow">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-secondary-foreground flex items-center gap-2">
            📚 Your Learning Path
          </h3>
          <Badge variant="outline" className="bg-secondary-foreground/10">
            {completedLessons.length} / {lessons.length} Complete
          </Badge>
        </div>

        {lessons.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-secondary-foreground/70 mb-4">No lessons found yet.</p>
            <p className="text-sm text-secondary-foreground/60">
              Complete your onboarding or generate a learning path to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {lessons.map((lesson, index) => {
              const isCompleted = completedLessons.includes(lesson.id);
              const isUnlocked = index === 0 || completedLessons.includes(lessons[index - 1]?.id);

              return (
                <div
                  key={lesson.id}
                  className={`
                    relative p-4 rounded-lg border-2 transition-all duration-200
                    ${isCompleted 
                      ? 'border-achievement bg-achievement/20 shadow-achievement' 
                      : isUnlocked
                        ? 'border-secondary bg-secondary/10 hover:shadow-glow cursor-pointer'
                        : 'border-muted bg-muted/5 opacity-50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-xl">
                        {getLessonIcon(lesson.type)}
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-semibold text-secondary-foreground">
                          {lesson.step_number}. {lesson.title}
                        </h4>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {lesson.type}
                          </Badge>
                          {isCompleted && (
                            <Badge variant="secondary" className="text-xs bg-achievement text-achievement-foreground">
                              ✓ Complete
                            </Badge>
                          )}
                          {!isUnlocked && (
                            <Badge variant="outline" className="text-xs opacity-60">
                              🔒 Locked
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {isUnlocked && (
                      <Button
                        onClick={() => toggleLesson(lesson.id, lesson.title)}
                        disabled={loading}
                        variant={isCompleted ? "achievement" : "retro"}
                        size="sm"
                      >
                        {isCompleted ? "✓ Done" : "Start"}
                      </Button>
                    )}
                  </div>

                  {/* Progress Connector */}
                  {index < lessons.length - 1 && (
                    <div className={`
                      absolute left-8 top-full w-0.5 h-4 -mt-2
                      ${isCompleted ? 'bg-achievement' : 'bg-muted'}
                    `} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Progress Bar */}
        {lessons.length > 0 && (
          <div className="pt-4 border-t border-secondary-glow/30">
            <div className="flex justify-between text-sm text-secondary-foreground/80 mb-2">
              <span>Learning Progress</span>
              <span>{Math.round((completedLessons.length / lessons.length) * 100)}%</span>
            </div>
            <div className="w-full bg-secondary-foreground/20 rounded-full h-3">
              <div 
                className="bg-gradient-achievement h-3 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(completedLessons.length / lessons.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}