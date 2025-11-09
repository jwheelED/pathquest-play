import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Clock, Unlock, Timer, X, Zap } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Assignment {
  id: string;
  title: string;
  assignment_type: string;
  created_at: string;
  completed_count: number;
  total_students: number;
  answers_released: boolean;
  auto_release_enabled: boolean;
  auto_release_minutes: number | null;
  auto_release_at: string | null;
  release_method: string | null;
  assignment_ids: string[];
}

interface TimeRemaining {
  total: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

export const AnswerReleaseCard = ({ instructorId }: { instructorId: string }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [releasingAll, setReleasingAll] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchAssignments();

    // Update current time every second for countdown timers
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Real-time updates
    const channel = supabase
      .channel('assignment-releases')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_assignments',
          filter: `instructor_id=eq.${instructorId}`
        },
        () => {
          fetchAssignments();
        }
      )
      .subscribe();

    return () => {
      clearInterval(timeInterval);
      supabase.removeChannel(channel);
    };
  }, [instructorId]);

  const fetchAssignments = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('student_assignments')
      .select('*')
      .eq('instructor_id', instructorId)
      .eq('completed', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching assignments:', error);
      setLoading(false);
      return;
    }

    // Group by assignment title and aggregate stats
    const grouped = data.reduce((acc: Record<string, any>, curr) => {
      const key = `${curr.title}_${curr.created_at}`;
      if (!acc[key]) {
        acc[key] = {
          id: curr.id,
          title: curr.title,
          assignment_type: curr.assignment_type,
          created_at: curr.created_at,
          answers_released: curr.answers_released,
          auto_release_enabled: curr.auto_release_enabled || false,
          auto_release_minutes: curr.auto_release_minutes,
          auto_release_at: curr.auto_release_at,
          release_method: curr.release_method,
          completed_count: 0,
          assignment_ids: []
        };
      }
      acc[key].completed_count++;
      acc[key].assignment_ids.push(curr.id);
      return acc;
    }, {});

    // Get total student count
    const { count: totalStudents } = await supabase
      .from('instructor_students')
      .select('*', { count: 'exact', head: true })
      .eq('instructor_id', instructorId);

    const assignmentList = Object.values(grouped).map((a: any) => ({
      ...a,
      total_students: totalStudents || 0
    }));

    setAssignments(assignmentList);
    setLoading(false);
  };

  const calculateTimeRemaining = (autoReleaseAt: string | null): TimeRemaining => {
    if (!autoReleaseAt) {
      return { total: 0, minutes: 0, seconds: 0, isExpired: true };
    }

    const releaseTime = new Date(autoReleaseAt).getTime();
    const now = currentTime.getTime();
    const diff = releaseTime - now;

    if (diff <= 0) {
      return { total: 0, minutes: 0, seconds: 0, isExpired: true };
    }

    const totalSeconds = Math.floor(diff / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return { total: totalSeconds, minutes, seconds, isExpired: false };
  };

  const getTimerStatus = (timeRemaining: TimeRemaining) => {
    if (timeRemaining.isExpired) return 'expired';
    const minutes = timeRemaining.minutes;
    if (minutes > 5) return 'safe';
    if (minutes > 2) return 'warning';
    return 'critical';
  };

  const getTimerColor = (status: string) => {
    switch (status) {
      case 'safe': return 'text-green-600 dark:text-green-400';
      case 'warning': return 'text-yellow-600 dark:text-yellow-400';
      case 'critical': return 'text-red-600 dark:text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const handleSetAutoRelease = async (assignmentIds: string[], minutes: number, title: string) => {
    const autoReleaseAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('student_assignments')
      .update({
        auto_release_enabled: true,
        auto_release_minutes: minutes,
        auto_release_at: autoReleaseAt
      })
      .in('id', assignmentIds);

    if (error) {
      toast.error('Failed to set auto-release timer');
      console.error('Error setting auto-release:', error);
    } else {
      toast.success(`Auto-release set for "${title}" in ${minutes} minutes`);
      fetchAssignments();
    }
  };

  const handleCancelAutoRelease = async (assignmentIds: string[], title: string) => {
    const { error } = await supabase
      .from('student_assignments')
      .update({
        auto_release_enabled: false,
        auto_release_minutes: null,
        auto_release_at: null
      })
      .in('id', assignmentIds);

    if (error) {
      toast.error('Failed to cancel auto-release');
      console.error('Error canceling auto-release:', error);
    } else {
      toast.success(`Auto-release canceled for "${title}"`);
      fetchAssignments();
    }
  };

  const handleReleaseNow = async (assignmentIds: string[], title: string) => {
    setReleasing(title);

    const { error } = await supabase
      .from('student_assignments')
      .update({
        answers_released: true,
        release_method: 'manual',
        auto_release_enabled: false,
        auto_release_at: null
      })
      .in('id', assignmentIds);

    if (error) {
      toast.error('Failed to release answers');
      console.error('Error releasing answers:', error);
    } else {
      toast.success(`Answers released for "${title}"`);
      fetchAssignments();
    }

    setReleasing(null);
  };

  const handleReleaseAll = async () => {
    setReleasingAll(true);

    const allAssignmentIds = pendingReleases.flatMap(a => a.assignment_ids);

    const { error } = await supabase
      .from('student_assignments')
      .update({
        answers_released: true,
        release_method: 'manual',
        auto_release_enabled: false,
        auto_release_at: null
      })
      .in('id', allAssignmentIds);

    if (error) {
      toast.error('Failed to release all answers');
      console.error('Error releasing all answers:', error);
    } else {
      toast.success(`Answers released for all ${pendingReleases.length} assignments`);
      fetchAssignments();
    }

    setReleasingAll(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Answer Release Control</CardTitle>
          <CardDescription>Loading assignments...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const pendingReleases = assignments.filter(a => !a.answers_released);
  const displayedAssignments = showAll ? pendingReleases : pendingReleases.slice(0, 3);
  const hasMore = pendingReleases.length > 3;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5" />
              Answer Release Control
            </CardTitle>
            <CardDescription>
              Control when students can see correct answers - manually or on a timer
              {pendingReleases.length > 0 && (
                <span className="ml-2 font-semibold text-primary">
                  ({pendingReleases.length} pending)
                </span>
              )}
            </CardDescription>
          </div>
          {pendingReleases.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="default"
                  disabled={releasingAll || releasing !== null}
                >
                  {releasingAll ? 'Releasing...' : 'Release All'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Release All Answers?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will release answers for <span className="font-semibold">{pendingReleases.length} assignments</span>, allowing 
                    all students who submitted to see their scores and correct answers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReleaseAll}>
                    Release All ({pendingReleases.length})
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {pendingReleases.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No assignments awaiting answer release</p>
            <p className="text-sm mt-1">All submitted assignments have answers released</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedAssignments.map((assignment) => {
              const timeRemaining = calculateTimeRemaining(assignment.auto_release_at);
              const timerStatus = getTimerStatus(timeRemaining);
              const timerColor = getTimerColor(timerStatus);
              const progress = assignment.auto_release_minutes
                ? Math.max(0, Math.min(100, ((assignment.auto_release_minutes * 60 - timeRemaining.total) / (assignment.auto_release_minutes * 60)) * 100))
                : 0;

              return (
                <div
                  key={assignment.id}
                  className="p-4 border rounded-lg space-y-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-semibold truncate">{assignment.title}</h4>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {assignment.assignment_type.replace('_', ' ')}
                        </Badge>
                        {assignment.auto_release_enabled && (
                          <Badge 
                            variant="secondary" 
                            className={`text-xs shrink-0 ${timerColor} flex items-center gap-1`}
                          >
                            <Timer className="h-3 w-3" />
                            Auto-Release: {assignment.auto_release_minutes}m
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {assignment.completed_count} / {assignment.total_students} submitted
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(assignment.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Timer Display */}
                  {assignment.auto_release_enabled && !timeRemaining.isExpired && (
                    <div className="space-y-2 p-3 bg-muted/50 rounded-md">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Releasing in:</span>
                        <span className={`font-mono font-bold text-lg ${timerColor}`}>
                          {timeRemaining.minutes}:{timeRemaining.seconds.toString().padStart(2, '0')}
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}

                  {/* Controls */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {assignment.auto_release_enabled ? (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleReleaseNow(assignment.assignment_ids, assignment.title)}
                          disabled={releasing === assignment.title}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          {releasing === assignment.title ? 'Releasing...' : 'Release Now'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelAutoRelease(assignment.assignment_ids, assignment.title)}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Cancel Timer
                        </Button>
                      </>
                    ) : (
                      <>
                        <TimerSetupDialog
                          assignment={assignment}
                          onSetTimer={handleSetAutoRelease}
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={releasing === assignment.title}
                            >
                              {releasing === assignment.title ? 'Releasing...' : 'Release Now'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Release Answers?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will allow all {assignment.completed_count} students who submitted 
                                "{assignment.title}" to see their scores and correct answers immediately.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleReleaseNow(assignment.assignment_ids, assignment.title)}
                              >
                                Release Answers
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? 'Show Less' : `Show ${pendingReleases.length - 3} More`}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Timer Setup Dialog Component
const TimerSetupDialog = ({
  assignment,
  onSetTimer,
}: {
  assignment: Assignment;
  onSetTimer: (assignmentIds: string[], minutes: number, title: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [timerMode, setTimerMode] = useState<string>("5");
  const [customMinutes, setCustomMinutes] = useState<string>("30");

  const handleSetTimer = () => {
    const minutes = timerMode === "custom" ? parseInt(customMinutes) : parseInt(timerMode);
    if (minutes > 0) {
      onSetTimer(assignment.assignment_ids, minutes, assignment.title);
      setOpen(false);
    } else {
      toast.error("Please enter a valid number of minutes");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Timer className="h-3 w-3 mr-1" />
          Set Timer
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Set Auto-Release Timer</AlertDialogTitle>
          <AlertDialogDescription>
            Choose when to automatically release answers for "{assignment.title}"
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Release Timer</Label>
            <Select value={timerMode} onValueChange={setTimerMode}>
              <SelectTrigger>
                <SelectValue placeholder="Select timer duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="10">10 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="20">20 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {timerMode === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom-minutes">Custom Minutes</Label>
              <Input
                id="custom-minutes"
                type="number"
                min="1"
                max="1440"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="Enter minutes"
              />
            </div>
          )}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              ⏱️ Answers will be automatically released {timerMode === "custom" ? customMinutes : timerMode} minutes from now.
              You can cancel or override this at any time.
            </p>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSetTimer}>
            Set Timer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
