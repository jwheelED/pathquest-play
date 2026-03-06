import { Radio, HelpCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InstructorQuickActionsProps {
  onNavigate: (tab: string) => void;
}

export function InstructorQuickActions({ onNavigate }: InstructorQuickActionsProps) {
  return (
    <Card className="headspace-card h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          className="w-full justify-start gap-3 rounded-xl bg-success text-success-foreground hover:bg-success/90 truncate"
          onClick={() => onNavigate("live")}
        >
          <Radio className="w-4 h-4 shrink-0" />
          <span className="truncate">Start Live Session</span>
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-3 rounded-xl truncate"
          onClick={() => onNavigate("question-bank")}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">Create Question</span>
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-3 rounded-xl truncate"
          onClick={() => onNavigate("materials")}
        >
          <Upload className="w-4 h-4 shrink-0" />
          <span className="truncate">Upload Slides</span>
        </Button>
      </CardContent>
    </Card>
  );
}
