import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { 
  Compass, BookOpen, Upload, Radio, Target, 
  CheckCircle2, ArrowRight, Sparkles, TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Recommendation {
  id: string;
  type: "join_class" | "upload_material" | "review_wrong" | "join_live" | "practice";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  action?: () => void;
  actionLabel?: string;
}

interface RecommendedNextStepsProps {
  userId: string;
  hasClasses: boolean;
  wrongAnswersCount: number;
  materialsCount: number;
}

export function RecommendedNextSteps({ 
  userId, 
  hasClasses, 
  wrongAnswersCount,
  materialsCount 
}: RecommendedNextStepsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [completedToday, setCompletedToday] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    generateRecommendations();
  }, [hasClasses, wrongAnswersCount, materialsCount]);

  const generateRecommendations = async () => {
    const recs: Recommendation[] = [];

    // Check for active live sessions
    if (hasClasses) {
      const { data: connections } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", userId);

      if (connections && connections.length > 0) {
        const instructorIds = connections.map(c => c.instructor_id);
        
        const { data: liveSessions } = await supabase
          .from("live_sessions")
          .select("id, session_code")
          .in("instructor_id", instructorIds)
          .eq("is_active", true)
          .limit(1);

        if (liveSessions && liveSessions.length > 0) {
          recs.push({
            id: "live_now",
            type: "join_live",
            title: "A lecture is happening now!",
            description: "Your instructor is live. Join to participate in check-ins.",
            priority: "high",
            action: () => navigate("/join"),
            actionLabel: "Join Now",
          });
        }
      }
    }

    // Recommend joining a class if none
    if (!hasClasses) {
      recs.push({
        id: "join_class",
        type: "join_class",
        title: "Join your first class",
        description: "Enter a class code from your instructor to get started.",
        priority: "high",
        actionLabel: "Add class code above",
      });
    }

    // Recommend reviewing wrong answers
    if (wrongAnswersCount > 0) {
      recs.push({
        id: "review_wrong",
        type: "review_wrong",
        title: `Review ${wrongAnswersCount} question${wrongAnswersCount > 1 ? "s" : ""}`,
        description: "Look at the AI feedback to understand what you missed.",
        priority: "high",
        actionLabel: "See questions below",
      });
    }

    // Recommend uploading materials
    if (materialsCount === 0) {
      recs.push({
        id: "upload_first",
        type: "upload_material",
        title: "Upload your first study material",
        description: "Add notes or PDFs to generate practice questions.",
        priority: "medium",
        action: () => {
          document.getElementById('study-materials-section')?.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
          });
        },
        actionLabel: "Upload Material",
      });
    } else if (materialsCount < 3) {
      recs.push({
        id: "upload_more",
        type: "upload_material",
        title: "Add more study materials",
        description: "Upload more content to get better practice questions.",
        priority: "low",
        action: () => {
          document.getElementById('study-materials-section')?.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
          });
        },
        actionLabel: "Upload More",
      });
    }

    // General practice recommendation
    if (hasClasses && wrongAnswersCount === 0 && materialsCount > 0) {
      recs.push({
        id: "keep_practicing",
        type: "practice",
        title: "You're doing great!",
        description: "Keep practicing with your study materials.",
        priority: "low",
      });
    }

    // Fetch today's completed count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { count } = await supabase
      .from("student_assignments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", userId)
      .eq("assignment_type", "lecture_checkin")
      .eq("completed", true)
      .gte("created_at", today.toISOString());

    setCompletedToday(count || 0);
    setRecommendations(recs.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "medium": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "join_class": return BookOpen;
      case "upload_material": return Upload;
      case "review_wrong": return Target;
      case "join_live": return Radio;
      case "practice": return Sparkles;
      default: return Compass;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Compass className="w-5 h-5 text-primary" />
            Recommended Next Steps
          </CardTitle>
          {completedToday > 0 && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {completedToday} today
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.length === 0 ? (
          <div className="text-center py-6">
            <TrendingUp className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
            <p className="font-medium text-emerald-600">All caught up!</p>
            <p className="text-sm text-muted-foreground">You're on track. Keep it up!</p>
          </div>
        ) : (
          recommendations.slice(0, 3).map((rec) => {
            const Icon = getIcon(rec.type);
            return (
              <div
                key={rec.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  rec.priority === "high" && "bg-amber-500/5 border-amber-500/20"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                  rec.priority === "high" ? "bg-amber-500/20" : "bg-primary/10"
                )}>
                  <Icon className={cn(
                    "w-5 h-5",
                    rec.priority === "high" ? "text-amber-600" : "text-primary"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-sm">{rec.title}</p>
                    {rec.priority === "high" && (
                      <Badge className={getPriorityColor(rec.priority)} variant="outline">
                        Priority
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{rec.description}</p>
                  {rec.action && rec.actionLabel && (
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="h-auto p-0 mt-1 text-primary"
                      onClick={rec.action}
                    >
                      {rec.actionLabel} <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
