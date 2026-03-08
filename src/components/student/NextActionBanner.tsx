import { Button } from "@/components/ui/button";
import { Radio, Target, BookOpen, Upload, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface NextActionBannerProps {
  userId: string;
  hasClasses: boolean;
  wrongAnswersCount: number;
  materialsCount: number;
  hasLiveSession: boolean;
}

export function NextActionBanner({
  hasClasses,
  wrongAnswersCount,
  materialsCount,
  hasLiveSession,
}: NextActionBannerProps) {
  const navigate = useNavigate();

  // Priority 1: Live session
  if (hasLiveSession) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
        <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
          <Radio className="w-5 h-5 text-green-600 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">Your instructor is live!</p>
          <p className="text-sm text-muted-foreground">Join now to participate in check-ins</p>
        </div>
        <Button onClick={() => navigate("/join")} className="bg-green-600 hover:bg-green-700 flex-shrink-0">
          Join Now
        </Button>
      </div>
    );
  }

  // Priority 2: Wrong answers to review
  if (wrongAnswersCount > 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Target className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">
            Review {wrongAnswersCount} missed question{wrongAnswersCount > 1 ? "s" : ""}
          </p>
          <p className="text-sm text-muted-foreground">Check the AI feedback to understand what you missed</p>
        </div>
        <Button
          variant="outline"
          className="border-amber-500/30 text-amber-700 hover:bg-amber-500/10 flex-shrink-0"
          onClick={() => document.getElementById("review-section")?.scrollIntoView({ behavior: "smooth" })}
        >
          Review
        </Button>
      </div>
    );
  }

  // Priority 3: No classes
  if (!hasClasses) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">Join your first class</p>
          <p className="text-sm text-muted-foreground">Enter the class code from your instructor to get started</p>
        </div>
      </div>
    );
  }

  // Priority 4: No materials
  if (materialsCount === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-border">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Upload className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">Upload study notes to generate practice questions</p>
          <p className="text-sm text-muted-foreground">Add notes or PDFs to build your study library</p>
        </div>
        <Button
          variant="outline"
          className="flex-shrink-0"
          onClick={() => document.getElementById("study-materials-section")?.scrollIntoView({ behavior: "smooth" })}
        >
          Upload
        </Button>
      </div>
    );
  }

  // Priority 5: All caught up
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
      <p className="text-sm text-muted-foreground">You're all caught up — keep it going!</p>
    </div>
  );
}
