import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, TrendingUp, BookOpen, Loader2, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ShareQuestionsDialog } from "./ShareQuestionsDialog";

interface MaterialStats {
  materialId: string;
  materialTitle: string;
  materialType: string;
  questionsGenerated: number;
  questionsAttempted: number;
  questionsCorrect: number;
  successRate: number;
  instructorId: string | null;
  courseTitle?: string;
}

interface MaterialQuestionStatsProps {
  userId: string;
  instructorId?: string;
  onGenerateQuestions?: (materialId: string) => void;
  adaptiveDifficulty?: string;
}

export function MaterialQuestionStats({ userId, instructorId, onGenerateQuestions, adaptiveDifficulty = 'intermediate' }: MaterialQuestionStatsProps) {
  const [stats, setStats] = useState<MaterialStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<{ id: string; title: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchStats();
  }, [userId, instructorId]);

  const fetchStats = async () => {
    try {
      setLoading(true);

      // Fetch materials with their question counts
      let query = supabase
        .from('student_study_materials')
        .select('id, title, material_type, questions_generated, instructor_id')
        .eq('user_id', userId);
      
      // Filter by instructor if specified
      if (instructorId) {
        query = query.eq('instructor_id', instructorId);
      }
      
      const { data: materials, error: materialsError } = await query
        .order('questions_generated', { ascending: false });

      if (materialsError) throw materialsError;

      // Fetch instructor info for materials
      const instructorIds = [...new Set(materials?.filter(m => m.instructor_id).map(m => m.instructor_id))] as string[];
      let instructorMap: Record<string, string> = {};
      
      if (instructorIds.length > 0) {
        const { data: instructors } = await supabase
          .from('profiles')
          .select('id, course_title')
          .in('id', instructorIds);
        
        instructors?.forEach(instructor => {
          instructorMap[instructor.id] = instructor.course_title || 'Unknown Course';
        });
      }

      // Fetch question performance for each material
      const statsPromises = materials?.map(async (material) => {
        const { data: questions } = await supabase
          .from('personalized_questions')
          .select('times_attempted, times_correct')
          .eq('source_material_id', material.id);

        const totalAttempted = questions?.reduce((sum, q) => sum + q.times_attempted, 0) || 0;
        const totalCorrect = questions?.reduce((sum, q) => sum + q.times_correct, 0) || 0;
        const successRate = totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;

        return {
          materialId: material.id,
          materialTitle: material.title,
          materialType: material.material_type,
          questionsGenerated: material.questions_generated || 0,
          questionsAttempted: totalAttempted,
          questionsCorrect: totalCorrect,
          successRate,
          instructorId: material.instructor_id,
          courseTitle: material.instructor_id ? instructorMap[material.instructor_id] : undefined,
        };
      }) || [];

      const resolvedStats = await Promise.all(statsPromises);
      setStats(resolvedStats);
    } catch (error: any) {
      toast({
        title: "Error loading stats",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestions = async (materialId: string) => {
    setGeneratingFor(materialId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-personalized-questions', {
        body: {
          materialId,
          userId,
          difficulty: adaptiveDifficulty,
          questionCount: 5,
        }
      });

      if (error) throw error;

      toast({
        title: "Questions generated!",
        description: `Created ${data.count} new ${adaptiveDifficulty} level questions`,
      });

      fetchStats();
      onGenerateQuestions?.(materialId);
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingFor(null);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card className="p-6 text-center">
        <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p className="text-muted-foreground">
          Upload study materials to generate personalized questions!
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Material-Based Questions
            </h3>
            <p className="text-sm text-muted-foreground">
              AI-generated from your study materials
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {stats.map((stat) => (
            <Card key={stat.materialId} className="p-4 hover:shadow-md transition-shadow">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-foreground truncate">
                      {stat.materialTitle}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {stat.materialType}
                      </Badge>
                      {stat.courseTitle && (
                        <Badge variant="outline" className="text-xs bg-primary/10">
                          {stat.courseTitle}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs gap-1">
                        <Sparkles className="w-3 h-3" />
                        {stat.questionsGenerated} questions
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleGenerateQuestions(stat.materialId)}
                      disabled={generatingFor === stat.materialId}
                    >
                      {generatingFor === stat.materialId ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 mr-1" />
                          Generate More
                        </>
                      )}
                    </Button>
                    
                    {stat.questionsGenerated > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedMaterial({ id: stat.materialId, title: stat.materialTitle });
                          setShareDialogOpen(true);
                        }}
                      >
                        <Share2 className="w-3 h-3 mr-1" />
                        Share
                      </Button>
                    )}
                  </div>
                </div>

                {stat.questionsAttempted > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Success Rate</span>
                      <span className={`font-semibold ${
                        stat.successRate >= 70 ? 'text-primary' :
                        stat.successRate >= 50 ? 'text-accent' :
                        'text-destructive'
                      }`}>
                        {Math.round(stat.successRate)}%
                      </span>
                    </div>
                    <Progress value={stat.successRate} className="h-2" />
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{stat.questionsCorrect} correct</span>
                      <span>{stat.questionsAttempted} attempted</span>
                    </div>
                  </div>
                )}

                {stat.questionsGenerated > 0 && stat.questionsAttempted === 0 && (
                  <div className="p-2 bg-primary/10 rounded text-xs text-primary flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    Try these personalized questions in practice mode!
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            💡 <strong>Tip:</strong> Questions are generated from your uploaded materials using AI. 
            The more detailed your notes, the better the questions!
          </p>
        </div>
      </div>

      {/* Share Questions Dialog */}
      <ShareQuestionsDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        userId={userId}
        materialId={selectedMaterial?.id}
        materialTitle={selectedMaterial?.title}
      />
    </Card>
  );
}
