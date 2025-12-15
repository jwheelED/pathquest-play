import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Play, Pause, Volume2, VolumeX, RotateCcw, Lock, CheckCircle2, 
  XCircle, ChevronRight, Brain, Sparkles, Shield, Target, TrendingUp, Flame,
  RefreshCw, Rewind, BookOpen, Maximize2, Minimize2
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PausePoint {
  id: string;
  pause_timestamp: number;
  cognitive_load_score: number;
  reason: string;
  question_content: {
    question: string;
    options?: string[];
    correctAnswer?: string;
    expectedAnswer?: string;
    explanation?: string;
  };
  question_type: string;
  order_index: number;
}

interface RemediationState {
  active: boolean;
  explanation: string;
  jumpToTimestamp: number;
  endTimestamp: number;
  followUpQuestion: {
    type: string;
    question: string;
    options?: string[];
    correctAnswer?: string;
    explanation?: string;
  } | null;
  originalQuestionId: string;
  misconception: string;
  loading: boolean;
}

interface InteractiveLecturePlayerProps {
  lectureId: string;
  videoUrl: string;
  title: string;
  pausePoints: PausePoint[];
  onComplete?: () => void;
}

// Inline confidence selector for interactive lectures
const CONFIDENCE_OPTIONS = [
  { key: 'not_sure', label: 'Not Sure', icon: Shield, multiplier: 0.5, color: 'text-muted-foreground', bg: 'bg-muted/50' },
  { key: 'maybe', label: 'Fairly Confident', icon: Target, multiplier: 1.0, color: 'text-primary', bg: 'bg-primary/10' },
  { key: 'pretty_sure', label: 'Confident', icon: TrendingUp, multiplier: 2.0, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { key: 'absolutely_sure', label: 'Absolutely Sure', icon: Flame, multiplier: 3.0, color: 'text-red-500', bg: 'bg-red-500/10' },
];

const InlineConfidenceSelector = ({ selected, onSelect }: { selected: string; onSelect: (val: string) => void }) => (
  <div className="space-y-2">
    <Label className="text-sm font-medium">How confident are you?</Label>
    <div className="grid grid-cols-2 gap-2">
      {CONFIDENCE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onSelect(opt.key)}
            className={cn(
              "flex items-center gap-2 p-3 rounded-lg border transition-all text-left",
              selected === opt.key 
                ? `${opt.bg} border-current ${opt.color}` 
                : "border-border hover:border-primary/30"
            )}
          >
            <Icon className={cn("h-4 w-4", selected === opt.key ? opt.color : "text-muted-foreground")} />
            <div>
              <div className="font-medium text-sm">{opt.label}</div>
              <div className="text-xs text-muted-foreground">{opt.multiplier}x</div>
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

export const InteractiveLecturePlayer = ({
  lectureId,
  videoUrl,
  title,
  pausePoints,
  onComplete
}: InteractiveLecturePlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [maxAllowedTime, setMaxAllowedTime] = useState(0);
  
  // Question overlay state
  const [currentQuestion, setCurrentQuestion] = useState<PausePoint | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [shortAnswer, setShortAnswer] = useState('');
  const [confidenceLevel, setConfidenceLevel] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [totalPoints, setTotalPoints] = useState(0);

  // Remediation loop state
  const [remediation, setRemediation] = useState<RemediationState>({
    active: false,
    explanation: '',
    jumpToTimestamp: 0,
    endTimestamp: 0,
    followUpQuestion: null,
    originalQuestionId: '',
    misconception: '',
    loading: false
  });
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpAnswer, setFollowUpAnswer] = useState('');

  // Sort and filter pause points by timestamp (safety: clamp to video duration)
  const sortedPausePoints = [...pausePoints]
    .filter(p => duration === 0 || p.pause_timestamp <= duration)
    .sort((a, b) => a.pause_timestamp - b.pause_timestamp);

  // Load saved progress
  useEffect(() => {
    const loadProgress = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: progress } = await supabase
        .from('student_lecture_progress')
        .select('*')
        .eq('lecture_video_id', lectureId)
        .eq('student_id', user.id)
        .single();

      if (progress) {
        setMaxAllowedTime(progress.video_position || 0);
        setAnsweredQuestions(new Set(progress.completed_pause_points || []));
        setTotalPoints(progress.total_points_earned || 0);
        
        if (videoRef.current) {
          videoRef.current.currentTime = progress.video_position || 0;
        }
      } else {
        // Create initial progress record
        await supabase
          .from('student_lecture_progress')
          .insert({
            lecture_video_id: lectureId,
            student_id: user.id,
            video_position: 0
          });
      }
    };

    loadProgress();
  }, [lectureId]);

  // Save progress periodically
  const saveProgress = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('student_lecture_progress')
      .upsert({
        lecture_video_id: lectureId,
        student_id: user.id,
        video_position: maxAllowedTime,
        completed_pause_points: Array.from(answeredQuestions),
        total_points_earned: totalPoints
      }, {
        onConflict: 'student_id,lecture_video_id'
      });
  }, [lectureId, maxAllowedTime, answeredQuestions, totalPoints]);

  useEffect(() => {
    const interval = setInterval(saveProgress, 10000); // Save every 10 seconds
    return () => clearInterval(interval);
  }, [saveProgress]);

  // Handle time update and pause point detection
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // Update max allowed time (no skipping forward)
    if (time > maxAllowedTime) {
      setMaxAllowedTime(time);
    }

    // Check for pause points
    for (const point of sortedPausePoints) {
      if (
        time >= point.pause_timestamp && 
        time < point.pause_timestamp + 0.5 &&
        !answeredQuestions.has(point.id) &&
        !currentQuestion
      ) {
        videoRef.current.pause();
        setIsPlaying(false);
        setCurrentQuestion(point);
        break;
      }
    }
  };

  // Prevent seeking forward
  const handleSeeking = () => {
    if (!videoRef.current) return;
    
    if (videoRef.current.currentTime > maxAllowedTime) {
      videoRef.current.currentTime = maxAllowedTime;
      toast.info("You can't skip ahead. Answer questions to progress.");
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current || currentQuestion) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleVolumeToggle = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleRewind = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
  };

  const handleVolumeChange = (value: number[]) => {
    if (!videoRef.current) return;
    const newVolume = value[0];
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleFullscreenToggle = async () => {
    if (!containerRef.current) return;
    
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const [isGrading, setIsGrading] = useState(false);
  const [shortAnswerGrade, setShortAnswerGrade] = useState<number | null>(null);
  const [shortAnswerFeedback, setShortAnswerFeedback] = useState<string | null>(null);

  const handleSubmitAnswer = async () => {
    if (!currentQuestion || !confidenceLevel) {
      toast.error('Please select your confidence level');
      return;
    }

    const answer = currentQuestion.question_type === 'multiple_choice' ? selectedAnswer : shortAnswer;
    if (!answer.trim()) {
      toast.error('Please provide an answer');
      return;
    }

    let correct = false;
    let grade: number | null = null;
    let feedback: string | null = null;

    if (currentQuestion.question_type === 'multiple_choice') {
      // Extract letter from answer (e.g., "A. Option" -> "A")
      const letterMatch = answer.match(/^([A-D])/i);
      const answerLetter = letterMatch ? letterMatch[1].toUpperCase() : answer;
      correct = answerLetter === currentQuestion.question_content.correctAnswer;
      grade = correct ? 100 : 0;
    } else {
      // Use AI grading for short answer questions
      setIsGrading(true);
      try {
        const expectedAnswer = currentQuestion.question_content.expectedAnswer || 
                               currentQuestion.question_content.correctAnswer || '';
        
        const { data, error } = await supabase.functions.invoke('auto-grade-short-answer', {
          body: {
            studentAnswer: answer,
            expectedAnswer: expectedAnswer,
            question: currentQuestion.question_content.question
          }
        });

        if (error) throw error;

        grade = data.grade;
        feedback = data.feedback;
        // Consider >= 70% as "correct" for point calculation and remediation
        correct = grade >= 70;
        
        setShortAnswerGrade(grade);
        setShortAnswerFeedback(feedback);
      } catch (error) {
        console.error('Auto-grading failed:', error);
        toast.error('Grading failed. Defaulting to manual review.');
        // Fallback: mark as needs review but don't penalize
        grade = null;
        correct = true; // Don't trigger remediation on grading failure
      } finally {
        setIsGrading(false);
      }
    }

    // Calculate points based on confidence and grade
    const multipliers: Record<string, number> = {
      'not_sure': 0.5,
      'maybe': 1.0,
      'pretty_sure': 2.0,
      'absolutely_sure': 3.0
    };
    
    const basePoints = 100;
    const multiplier = multipliers[confidenceLevel] || 1;
    
    // For short answers, scale points by grade percentage
    let points: number;
    if (currentQuestion.question_type === 'multiple_choice') {
      points = correct ? Math.round(basePoints * multiplier) : -Math.round(basePoints * multiplier * 0.5);
    } else {
      // Partial credit for short answers based on AI grade
      const gradePercent = (grade ?? 100) / 100;
      if (gradePercent >= 0.7) {
        // Good answer: full points scaled by grade
        points = Math.round(basePoints * multiplier * gradePercent);
      } else if (gradePercent >= 0.4) {
        // Partial credit: reduced points, no penalty
        points = Math.round(basePoints * gradePercent * 0.5);
      } else {
        // Poor answer: penalty scaled by confidence
        points = -Math.round(basePoints * multiplier * 0.3);
      }
    }
    
    setIsCorrect(correct);
    setShowResult(true);
    setTotalPoints(prev => Math.max(0, prev + points));
    setAnsweredQuestions(prev => new Set([...prev, currentQuestion.id]));

    // Save response
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: progress } = await supabase
        .from('student_lecture_progress')
        .select('responses')
        .eq('lecture_video_id', lectureId)
        .eq('student_id', user.id)
        .single();

      const responses = (progress?.responses as Record<string, any>) || {};
      responses[currentQuestion.id] = {
        answer,
        correct,
        grade,
        feedback,
        confidence: confidenceLevel,
        points,
        timestamp: new Date().toISOString()
      };

      await supabase
        .from('student_lecture_progress')
        .update({ 
          responses,
          total_points_earned: Math.max(0, totalPoints + points),
          completed_pause_points: Array.from([...answeredQuestions, currentQuestion.id])
        })
        .eq('lecture_video_id', lectureId)
        .eq('student_id', user.id);
    }

    // If incorrect (or low grade for short answer), trigger remediation loop
    if (!correct) {
      triggerRemediation(currentQuestion, answer);
    }
  };

  // Trigger remediation loop for incorrect answers
  const triggerRemediation = async (question: PausePoint, studentAnswer: string) => {
    setRemediation(prev => ({ ...prev, loading: true }));

    try {
      // Step 1: Detect misconception
      const { data: misconceptionData, error: miscError } = await supabase.functions.invoke('detect-misconception', {
        body: {
          lectureVideoId: lectureId,
          pausePointId: question.id,
          questionText: question.question_content.question,
          correctAnswer: question.question_content.correctAnswer || question.question_content.expectedAnswer,
          studentAnswer,
          questionType: question.question_type
        }
      });

      if (miscError) throw miscError;

      // Step 2: Generate remediation content
      const { data: remediationData, error: remError } = await supabase.functions.invoke('generate-remediation', {
        body: {
          lectureVideoId: lectureId,
          pausePointId: question.id,
          misconception: misconceptionData.misconception,
          missingConcept: misconceptionData.missingConcept,
          rootCause: misconceptionData.rootCause,
          originalQuestion: question.question_content.question,
          correctAnswer: question.question_content.correctAnswer || question.question_content.expectedAnswer,
          studentAnswer
        }
      });

      if (remError) throw remError;

      // Step 3: Save to remediation history
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('remediation_history').insert({
          student_id: user.id,
          lecture_video_id: lectureId,
          pause_point_id: question.id,
          misconception_detected: misconceptionData.misconception,
          missing_concept: misconceptionData.missingConcept,
          remediation_timestamp: misconceptionData.recommendedTimestamp,
          remediation_end_timestamp: misconceptionData.endTimestamp,
          ai_explanation: remediationData.explanation,
          follow_up_question: remediationData.followUpQuestion
        });
      }

      setRemediation({
        active: true,
        explanation: remediationData.explanation,
        jumpToTimestamp: misconceptionData.recommendedTimestamp,
        endTimestamp: misconceptionData.endTimestamp,
        followUpQuestion: remediationData.followUpQuestion,
        originalQuestionId: question.id,
        misconception: misconceptionData.misconception,
        loading: false
      });
    } catch (error) {
      console.error('Remediation failed:', error);
      setRemediation(prev => ({ ...prev, loading: false }));
      // Continue without remediation if it fails
    }
  };

  // Handle jumping to remediation timestamp
  const handleWatchRemediation = () => {
    if (!videoRef.current) return;
    
    // Allow seeking to remediation point (override no-skip for this)
    videoRef.current.currentTime = remediation.jumpToTimestamp;
    setCurrentQuestion(null);
    setShowResult(false);
    setRemediation(prev => ({ ...prev, active: false }));
    setShowFollowUp(false);
    
    videoRef.current.play();
    setIsPlaying(true);

    // Set up listener to pause at end of remediation segment and show follow-up
    const handleRemediationEnd = () => {
      if (videoRef.current && videoRef.current.currentTime >= remediation.endTimestamp) {
        videoRef.current.pause();
        setIsPlaying(false);
        if (remediation.followUpQuestion) {
          setShowFollowUp(true);
        }
        videoRef.current.removeEventListener('timeupdate', handleRemediationEnd);
      }
    };
    
    videoRef.current.addEventListener('timeupdate', handleRemediationEnd);
  };

  // Handle follow-up question submission
  const handleFollowUpSubmit = async () => {
    if (!remediation.followUpQuestion || !followUpAnswer) return;

    const correct = followUpAnswer.charAt(0).toUpperCase() === remediation.followUpQuestion.correctAnswer;
    
    // Update remediation history
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('remediation_history')
        .update({
          follow_up_answered: true,
          follow_up_correct: correct,
          resolved: correct,
          resolved_at: correct ? new Date().toISOString() : null
        })
        .eq('student_id', user.id)
        .eq('pause_point_id', remediation.originalQuestionId)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    if (correct) {
      toast.success('Great! You got it this time!');
      setTotalPoints(prev => prev + 50); // Bonus for completing remediation
    } else {
      toast.info('Keep practicing! You\'ll get it.');
    }

    // Reset states and continue
    setShowFollowUp(false);
    setFollowUpAnswer('');
    setRemediation({
      active: false,
      explanation: '',
      jumpToTimestamp: 0,
      endTimestamp: 0,
      followUpQuestion: null,
      originalQuestionId: '',
      misconception: '',
      loading: false
    });

    // Resume video
    videoRef.current?.play();
    setIsPlaying(true);
  };

  const handleContinue = () => {
    setCurrentQuestion(null);
    setSelectedAnswer('');
    setShortAnswer('');
    setConfidenceLevel('');
    setShowResult(false);
    setShortAnswerGrade(null);
    setShortAnswerFeedback(null);

    // If remediation is active, don't auto-continue - wait for user action
    if (remediation.active) return;

    // Check if lecture is complete
    if (answeredQuestions.size === sortedPausePoints.length) {
      // Mark as complete
      saveProgress().then(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            supabase
              .from('student_lecture_progress')
              .update({ completed_at: new Date().toISOString() })
              .eq('lecture_video_id', lectureId)
              .eq('student_id', user.id);
          }
        });
      });
      toast.success('🎉 Lecture Complete! Great job!');
      onComplete?.();
    } else {
      // Resume video
      videoRef.current?.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const questionsAnswered = answeredQuestions.size;
  const totalQuestions = sortedPausePoints.length;

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Video Player */}
      <div className={cn("relative bg-black rounded-lg overflow-hidden", isFullscreen ? "h-full" : "aspect-video")}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full"
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Question Overlay */}
        {currentQuestion && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center p-4 z-20">
            <Card className="w-full max-w-2xl max-h-[90%] overflow-y-auto">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    Cognitive Load: {currentQuestion.cognitive_load_score}/10
                  </Badge>
                  <Badge variant="outline">
                    Question {currentQuestion.order_index + 1}/{totalQuestions}
                  </Badge>
                </div>
                <CardTitle className="mt-4">{currentQuestion.question_content.question}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {!showResult ? (
                  <>
                    {/* Answer Input */}
                    {currentQuestion.question_type === 'multiple_choice' ? (
                      <RadioGroup
                        value={selectedAnswer}
                        onValueChange={setSelectedAnswer}
                        className="space-y-3"
                      >
                        {currentQuestion.question_content.options?.map((option, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                              selectedAnswer === option ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                            }`}
                          >
                            <RadioGroupItem value={option} id={`option-${idx}`} />
                            <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer">
                              {option}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    ) : (
                      <Textarea
                        placeholder="Type your answer..."
                        value={shortAnswer}
                        onChange={(e) => setShortAnswer(e.target.value)}
                        rows={4}
                      />
                    )}

                    {/* Confidence Selector */}
                    <div className="pt-4 border-t">
                      <InlineConfidenceSelector
                        selected={confidenceLevel}
                        onSelect={setConfidenceLevel}
                      />
                    </div>

                    <Button
                      onClick={handleSubmitAnswer}
                      className="w-full"
                      size="lg"
                      disabled={isGrading || !confidenceLevel || (currentQuestion.question_type === 'multiple_choice' ? !selectedAnswer : !shortAnswer.trim())}
                    >
                      {isGrading ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Grading...
                        </>
                      ) : (
                        'Submit Answer'
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Result Display */}
                    <div className={`p-4 rounded-lg ${isCorrect ? 'bg-emerald-500/10 border-emerald-500' : shortAnswerGrade !== null && shortAnswerGrade >= 40 ? 'bg-amber-500/10 border-amber-500' : 'bg-red-500/10 border-red-500'} border`}>
                      <div className="flex items-center gap-2 mb-2">
                        {isCorrect ? (
                          <>
                            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            <span className="font-semibold text-emerald-500">
                              {shortAnswerGrade !== null ? `Great! Score: ${shortAnswerGrade}%` : 'Correct!'}
                            </span>
                          </>
                        ) : shortAnswerGrade !== null && shortAnswerGrade >= 40 ? (
                          <>
                            <Target className="h-6 w-6 text-amber-500" />
                            <span className="font-semibold text-amber-500">Partial Credit: {shortAnswerGrade}%</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-6 w-6 text-red-500" />
                            <span className="font-semibold text-red-500">
                              {shortAnswerGrade !== null ? `Needs improvement: ${shortAnswerGrade}%` : 'Not quite'}
                            </span>
                          </>
                        )}
                      </div>
                      
                      {/* Short answer AI feedback */}
                      {shortAnswerFeedback && (
                        <div className="mt-3 p-3 rounded bg-background/50">
                          <p className="text-sm font-medium mb-1 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> AI Feedback:
                          </p>
                          <p className="text-sm text-muted-foreground">{shortAnswerFeedback}</p>
                        </div>
                      )}
                      
                      {currentQuestion.question_content.explanation && !shortAnswerFeedback && (
                        <p className="text-sm text-muted-foreground">
                          {currentQuestion.question_content.explanation}
                        </p>
                      )}
                      {!isCorrect && currentQuestion.question_content.correctAnswer && currentQuestion.question_type === 'multiple_choice' && (
                        <p className="text-sm mt-2">
                          <span className="font-medium">Correct answer:</span>{' '}
                          {currentQuestion.question_content.correctAnswer}
                        </p>
                      )}
                      {!isCorrect && currentQuestion.question_content.expectedAnswer && currentQuestion.question_type !== 'multiple_choice' && (
                        <p className="text-sm mt-2">
                          <span className="font-medium">Expected answer:</span>{' '}
                          {currentQuestion.question_content.expectedAnswer}
                        </p>
                      )}
                    </div>

                    {/* Remediation UI for incorrect answers */}
                    {!isCorrect && remediation.loading && (
                      <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-sm">Analyzing your answer to create a personalized review...</span>
                        </div>
                      </div>
                    )}

                    {!isCorrect && remediation.active && (
                      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-4">
                        <div className="flex items-center gap-2 text-amber-600">
                          <BookOpen className="h-5 w-5" />
                          <span className="font-semibold">Personalized Review Available</span>
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          {remediation.explanation}
                        </p>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Rewind className="h-4 w-4" />
                          <span>
                            We'll take you back to {formatTime(remediation.jumpToTimestamp)} where this concept was explained.
                          </span>
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            onClick={handleWatchRemediation}
                            className="flex-1 bg-amber-500 hover:bg-amber-600"
                          >
                            <Rewind className="h-4 w-4 mr-2" />
                            Watch Review Clip
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => {
                              setRemediation(prev => ({ ...prev, active: false }));
                              handleContinue();
                            }}
                          >
                            Skip
                          </Button>
                        </div>
                      </div>
                    )}

                    {isCorrect && (
                      <Button onClick={handleContinue} className="w-full" size="lg">
                        <ChevronRight className="h-4 w-4 mr-2" />
                        Continue Lecture
                      </Button>
                    )}

                    {!isCorrect && !remediation.active && !remediation.loading && (
                      <Button onClick={handleContinue} className="w-full" size="lg">
                        <ChevronRight className="h-4 w-4 mr-2" />
                        Continue Lecture
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Video Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress bar with pause point markers */}
          <div className="relative mb-3">
            <Progress value={progressPercentage} className="h-2" />
            {/* Pause point markers */}
            {sortedPausePoints.map((point) => (
              <div
                key={point.id}
                className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 ${
                  answeredQuestions.has(point.id)
                    ? 'bg-emerald-500 border-emerald-400'
                    : 'bg-amber-500 border-amber-400'
                }`}
                style={{ left: `${(point.pause_timestamp / duration) * 100}%` }}
                title={`Question ${point.order_index + 1}`}
              />
            ))}
            {/* No-skip indicator */}
            {maxAllowedTime < duration && (
              <div
                className="absolute top-0 bottom-0 bg-red-500/20"
                style={{ 
                  left: `${(maxAllowedTime / duration) * 100}%`,
                  right: 0
                }}
              />
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePlayPause}
                disabled={!!currentQuestion}
                className="text-white hover:bg-white/20"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRewind}
                className="text-white hover:bg-white/20"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <div 
                className="relative flex items-center gap-1"
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleVolumeToggle}
                  className="text-white hover:bg-white/20"
                >
                  {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
                {showVolumeSlider && (
                  <div className="w-20 px-2">
                    <Slider
                      value={[isMuted ? 0 : volume]}
                      max={1}
                      step={0.1}
                      onValueChange={handleVolumeChange}
                      className="cursor-pointer"
                    />
                  </div>
                )}
              </div>
              <span className="text-sm text-white/80">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleFullscreenToggle}
                className="text-white hover:bg-white/20"
              >
                {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </Button>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                No Skip
              </Badge>
              <Badge className="bg-emerald-500 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {totalPoints} pts
              </Badge>
              <Badge variant="outline" className="text-white border-white/30">
                {questionsAnswered}/{totalQuestions} Questions
              </Badge>
            </div>
          </div>
        </div>

        {/* Follow-up Question Overlay after Remediation */}
        {showFollowUp && remediation.followUpQuestion && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center p-4 z-20">
            <Card className="w-full max-w-2xl">
              <CardHeader>
                <Badge className="w-fit bg-amber-500 mb-2">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Follow-up Question
                </Badge>
                <CardTitle>{remediation.followUpQuestion.question}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup
                  value={followUpAnswer}
                  onValueChange={setFollowUpAnswer}
                  className="space-y-2"
                >
                  {remediation.followUpQuestion.options?.map((option, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center space-x-3 p-3 rounded-lg border transition-colors",
                        followUpAnswer === option ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <RadioGroupItem value={option} id={`followup-${idx}`} />
                      <Label htmlFor={`followup-${idx}`} className="flex-1 cursor-pointer">
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>

                <Button 
                  onClick={handleFollowUpSubmit} 
                  className="w-full" 
                  size="lg"
                  disabled={!followUpAnswer}
                >
                  Submit Answer
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};