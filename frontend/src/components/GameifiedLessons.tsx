import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import LessonViewer from "./LessonViewer";
import { getOrgId } from "@/hooks/useOrgId";

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

interface LessonMastery {
  lesson_id: string;
  attempt_count: number;
  successful_attempts: number;
  mastery_threshold: number;
  is_mastered: boolean;
}

export default function GameifiedLessons({ userId, onProgressChange, onLessonComplete }: GameifiedLessonsProps) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [masteryData, setMasteryData] = useState<Map<string, LessonMastery>>(new Map());
  const [loading, setLoading] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

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

      // Fetch mastery data for this user
      const { data: masteryDataResult, error: masteryError } = await supabase
        .from("lesson_mastery")
        .select("*")
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

      if (!masteryError && masteryDataResult) {
        const masteryMap = new Map<string, LessonMastery>();
        masteryDataResult.forEach((mastery) => {
          masteryMap.set(mastery.lesson_id, mastery);
        });
        setMasteryData(masteryMap);
      }
    } catch (error) {
      console.error("Error fetching lessons:", error);
    }
    setLoading(false);
  };

  const handleLessonComplete = async () => {
    if (!userId || !selectedLesson) return;
    
    const lessonId = selectedLesson.id;
    const lessonTitle = selectedLesson.title;
    const mastery = masteryData.get(lessonId);
    
    setLoading(true);
    try {
      // Track mastery attempt
      const { data: threshold } = await supabase.rpc('calculate_mastery_threshold', {
        p_user_id: userId,
        p_lesson_id: lessonId
      });

      const currentAttempts = (mastery?.attempt_count || 0) + 1;
      const currentSuccessful = (mastery?.successful_attempts || 0) + 1;
      const masteryThreshold = threshold || 3;
      const isMastered = currentSuccessful >= masteryThreshold;

      // Update or insert mastery record
      const { error: masteryError } = await supabase
        .from("lesson_mastery")
        .upsert({
          user_id: userId,
          lesson_id: lessonId,
          attempt_count: currentAttempts,
          successful_attempts: currentSuccessful,
          mastery_threshold: masteryThreshold,
          is_mastered: isMastered,
          last_attempt_date: new Date().toISOString()
        }, {
          onConflict: 'user_id,lesson_id'
        });

      if (masteryError) {
        console.error("Error updating mastery:", masteryError);
      }

      // Update local mastery state
      const newMasteryData = new Map(masteryData);
      newMasteryData.set(lessonId, {
        lesson_id: lessonId,
        attempt_count: currentAttempts,
        successful_attempts: currentSuccessful,
        mastery_threshold: masteryThreshold,
        is_mastered: isMastered
      });
      setMasteryData(newMasteryData);

      if (isMastered) {
        // Mark as complete only when mastered
        const orgId = await getOrgId(userId);
        const { error } = await supabase
          .from("lesson_progress")
          .insert({ user_id: userId, lesson_id: lessonId, completed: true, org_id: orgId });

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
          
          setSelectedLesson(null);
          
          toast.success(`🎉 Lesson mastered!`, {
            description: `+${xpReward} XP, +${coinReward} coins. You can now advance!`,
          });
        }
      } else {
        setSelectedLesson(null);
        toast.info(`Practice makes perfect! ${currentSuccessful}/${masteryThreshold} attempts`, {
          description: `Keep practicing to master this lesson.`,
        });
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
              const mastery = masteryData.get(lesson.id);
              const masteryProgress = mastery ? (mastery.successful_attempts / mastery.mastery_threshold) * 100 : 0;

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
                    <div className="flex items-center gap-3 flex-1">
                      <div className="text-xl">
                        {getLessonIcon(lesson.type)}
                      </div>
                      <div className="space-y-1 flex-1">
                        <h4 className="font-semibold text-secondary-foreground">
                          {lesson.step_number}. {lesson.title}
                        </h4>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {lesson.type}
                          </Badge>
                          {isCompleted && (
                            <Badge variant="secondary" className="text-xs bg-achievement text-achievement-foreground">
                              ✓ Mastered
                            </Badge>
                          )}
                          {!isCompleted && mastery && mastery.attempt_count > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {mastery.successful_attempts}/{mastery.mastery_threshold} attempts
                            </Badge>
                          )}
                          {!isUnlocked && (
                            <Badge variant="outline" className="text-xs opacity-60">
                              🔒 Locked
                            </Badge>
                          )}
                        </div>
                        {/* Mastery Progress Bar */}
                        {isUnlocked && !isCompleted && mastery && mastery.attempt_count > 0 && (
                          <div className="mt-2">
                            <div className="w-full bg-secondary-foreground/20 rounded-full h-1.5">
                              <div 
                                className="bg-secondary h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${masteryProgress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {isUnlocked && (
                      <Button
                        onClick={() => setSelectedLesson(lesson)}
                        disabled={loading}
                        variant={isCompleted ? "achievement" : "retro"}
                        size="sm"
                      >
                        {isCompleted ? "Review" : "Start"}
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

        {/* Lesson Viewer Dialog */}
        <Dialog open={!!selectedLesson} onOpenChange={(open) => !open && setSelectedLesson(null)}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden">
            <DialogTitle className="sr-only">
              {selectedLesson?.title || "Lesson Viewer"}
            </DialogTitle>
            {selectedLesson && (
              <LessonViewer
                lesson={selectedLesson}
                onComplete={handleLessonComplete}
                onClose={() => setSelectedLesson(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}