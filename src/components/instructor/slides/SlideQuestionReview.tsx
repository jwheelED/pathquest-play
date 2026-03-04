import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Pencil, Trash2, Plus, Check, X, ListChecks, FileText, Presentation,
  Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExtractedQuestionData, MCQData, ShortAnswerData } from './SlideQuestionPreviewDialog';

interface SlidePresetQuestion {
  id: string;
  material_id: string;
  slide_number: number;
  question_type: string;
  question_content: ExtractedQuestionData;
  question_name: string | null;
  is_enabled: boolean;
  order_index: number;
  generation_source: string;
}

interface SlideQuestionReviewProps {
  materialId: string;
  materialTitle: string;
  totalSlides: number;
  onStartPresenting: () => void;
  onBack: () => void;
}

export function SlideQuestionReview({
  materialId,
  materialTitle,
  totalSlides,
  onStartPresenting,
  onBack,
}: SlideQuestionReviewProps) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedSlide, setExpandedSlide] = useState<number | null>(null);

  // Inline edit state
  const [editQuestion, setEditQuestion] = useState('');
  const [editQuestionName, setEditQuestionName] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>(['', '', '', '']);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState('A');
  const [editExpectedAnswer, setEditExpectedAnswer] = useState('');

  // Fetch questions
  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['slide-preset-questions', materialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slide_preset_questions')
        .select('*')
        .eq('material_id', materialId)
        .order('slide_number', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) throw error;
      return (data || []) as SlidePresetQuestion[];
    },
  });

  // Use the larger of totalSlides prop or max slide_number from questions
  const maxSlideFromQuestions = questions.length > 0 
    ? Math.max(...questions.map(q => q.slide_number)) 
    : 0;
  const effectiveTotalSlides = Math.max(totalSlides, maxSlideFromQuestions);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('slide_preset_questions')
        .update({ is_enabled: enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['slide-preset-questions', materialId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('slide_preset_questions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slide-preset-questions', materialId] });
      toast.success('Question deleted');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content, questionName }: { id: string; content: ExtractedQuestionData; questionName: string }) => {
      const { error } = await supabase
        .from('slide_preset_questions')
        .update({ question_content: content as any, question_name: questionName || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slide-preset-questions', materialId] });
      setEditingId(null);
      toast.success('Question updated');
    },
  });

  const addMutation = useMutation({
    mutationFn: async (slideNumber: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();

      const { error } = await supabase
        .from('slide_preset_questions')
        .insert({
          material_id: materialId,
          instructor_id: user.id,
          slide_number: slideNumber,
          question_type: 'mcq',
          question_content: {
            mcq: {
              question: 'New question — edit me',
              options: ['A. Option 1', 'B. Option 2', 'C. Option 3', 'D. Option 4'],
              correct_answer: 'A',
              explanation: '',
            },
          },
          is_enabled: true,
          generation_source: 'manual',
          org_id: profile?.org_id || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slide-preset-questions', materialId] });
      toast.success('Question added');
    },
  });

  const startEdit = useCallback((q: SlidePresetQuestion) => {
    setEditingId(q.id);
    setEditQuestionName(q.question_name || '');
    const content = q.question_content;
    if (q.question_type === 'mcq' && content.mcq) {
      setEditQuestion(content.mcq.question || '');
      setEditOptions(content.mcq.options || ['', '', '', '']);
      setEditCorrectAnswer(content.mcq.correct_answer || 'A');
    } else if (q.question_type === 'short_answer' && content.short_answer) {
      setEditQuestion(content.short_answer.question || '');
      setEditExpectedAnswer(content.short_answer.expected_answer || '');
    }
  }, []);

  const saveEdit = useCallback((q: SlidePresetQuestion) => {
    let content: ExtractedQuestionData = {};
    if (q.question_type === 'mcq') {
      content = {
        mcq: {
          question: editQuestion,
          options: editOptions,
          correct_answer: editCorrectAnswer,
          explanation: q.question_content.mcq?.explanation || '',
        },
      };
    } else if (q.question_type === 'short_answer') {
      content = {
        short_answer: {
          question: editQuestion,
          expected_answer: editExpectedAnswer,
          explanation: q.question_content.short_answer?.explanation || '',
        },
      };
    }
    updateMutation.mutate({ id: q.id, content, questionName: editQuestionName });
  }, [editQuestion, editQuestionName, editOptions, editCorrectAnswer, editExpectedAnswer, updateMutation]);

  // Group questions by slide number
  const slideMap = new Map<number, SlidePresetQuestion[]>();
  questions.forEach(q => {
    const existing = slideMap.get(q.slide_number) || [];
    existing.push(q);
    slideMap.set(q.slide_number, existing);
  });

  // Build list of all slides (1..totalSlides) with their questions
  const slideEntries: Array<{ slideNumber: number; questions: SlidePresetQuestion[] }> = [];
  for (let i = 1; i <= effectiveTotalSlides; i++) {
    slideEntries.push({ slideNumber: i, questions: slideMap.get(i) || [] });
  }

  const enabledCount = questions.filter(q => q.is_enabled).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Presentation className="h-5 w-5 text-primary" />
              {materialTitle}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {enabledCount} question{enabledCount !== 1 ? 's' : ''} ready across {effectiveTotalSlides} slides
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={onStartPresenting}>
              <Presentation className="h-4 w-4 mr-2" />
              Start Presenting
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {slideEntries.map(({ slideNumber, questions: slideQuestions }) => {
            const hasQuestions = slideQuestions.length > 0;
            const isExpanded = expandedSlide === slideNumber;

            return (
              <div key={slideNumber} className="border rounded-lg">
                {/* Slide row header */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors text-left"
                  onClick={() => setExpandedSlide(isExpanded ? null : slideNumber)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-16">
                      Slide {slideNumber}
                    </span>
                    {hasQuestions ? (
                      <div className="flex gap-1">
                        {slideQuestions.map(q => (
                          <Badge
                            key={q.id}
                            variant={q.is_enabled ? 'default' : 'secondary'}
                            className="text-xs gap-1"
                          >
                            {q.question_type === 'mcq' ? (
                              <ListChecks className="h-3 w-3" />
                            ) : (
                              <FileText className="h-3 w-3" />
                            )}
                            {q.question_type.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No question</span>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3 bg-accent/5">
                    {slideQuestions.map(q => {
                      const isEditing = editingId === q.id;
                      const mcq = q.question_content?.mcq;
                      const sa = q.question_content?.short_answer;

                      return (
                        <div key={q.id} className="border rounded-md p-3 space-y-2 bg-background">
                          {/* Question display or edit */}
                          {isEditing ? (
                            <div className="space-y-3">
                              <Input
                                value={editQuestionName}
                                onChange={e => setEditQuestionName(e.target.value)}
                                placeholder="Question name (e.g. 'Mitosis recap')"
                                className="h-8 text-sm"
                              />
                              <Textarea
                                value={editQuestion}
                                onChange={e => setEditQuestion(e.target.value)}
                                placeholder="Question text"
                                className="min-h-[60px]"
                              />
                              {q.question_type === 'mcq' && (
                                <div className="space-y-2">
                                  {['A', 'B', 'C', 'D'].map((letter, idx) => (
                                    <div key={letter} className="flex items-center gap-2">
                                      <span className="text-xs font-medium w-4">{letter}:</span>
                                      <Input
                                        value={editOptions[idx]}
                                        onChange={e => {
                                          const newOpts = [...editOptions];
                                          newOpts[idx] = e.target.value;
                                          setEditOptions(newOpts);
                                        }}
                                        className="flex-1 h-8 text-sm"
                                      />
                                    </div>
                                  ))}
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Correct:</span>
                                    {['A', 'B', 'C', 'D'].map(l => (
                                      <Button
                                        key={l}
                                        size="sm"
                                        variant={editCorrectAnswer === l ? 'default' : 'outline'}
                                        className="h-7 w-7 p-0"
                                        onClick={() => setEditCorrectAnswer(l)}
                                      >
                                        {l}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {q.question_type === 'short_answer' && (
                                <Input
                                  value={editExpectedAnswer}
                                  onChange={e => setEditExpectedAnswer(e.target.value)}
                                  placeholder="Expected answer"
                                  className="h-8 text-sm"
                                />
                              )}
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                                </Button>
                                <Button size="sm" onClick={() => saveEdit(q)} disabled={updateMutation.isPending}>
                                  <Check className="h-3.5 w-3.5 mr-1" /> Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {(q as SlidePresetQuestion).question_name && (
                                <p className="text-xs font-semibold text-primary mb-1">
                                  {(q as SlidePresetQuestion).question_name}
                                </p>
                              )}
                              <p className="text-sm font-medium">
                                {mcq?.question || sa?.question || 'No question text'}
                              </p>
                              {mcq && (
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  {mcq.options?.map((opt, i) => (
                                    <p key={i} className={opt.startsWith(mcq.correct_answer) ? 'text-emerald-600 font-medium' : ''}>
                                      {opt}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {sa && (
                                <p className="text-xs text-muted-foreground">
                                  Expected: {sa.expected_answer}
                                </p>
                              )}
                            </>
                          )}

                          {/* Actions row */}
                          {!isEditing && (
                            <div className="flex items-center justify-between pt-1 border-t">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={q.is_enabled}
                                  onCheckedChange={(checked) => toggleMutation.mutate({ id: q.id, enabled: checked })}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {q.is_enabled ? 'Enabled' : 'Disabled'}
                                </span>
                                <Badge variant="outline" className="text-[10px]">
                                  {q.generation_source}
                                </Badge>
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(q)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-destructive"
                                  onClick={() => deleteMutation.mutate(q.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add question button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => addMutation.mutate(slideNumber)}
                      disabled={addMutation.isPending}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Question to Slide {slideNumber}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
