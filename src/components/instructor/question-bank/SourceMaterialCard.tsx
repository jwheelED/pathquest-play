import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, FileUp, Trash2 } from "lucide-react";
import { QuestionBankCard, type BankQuestion } from "./QuestionBankCard";

function naturalSort(a: BankQuestion, b: BankQuestion): number {
  const numA = parseInt(a.title.match(/Slide\s*(\d+)/i)?.[1] || "0");
  const numB = parseInt(b.title.match(/Slide\s*(\d+)/i)?.[1] || "0");
  if (numA !== numB) return numA - numB;
  return a.title.localeCompare(b.title);
}

interface SourceMaterialCardProps {
  sourceTitle: string;
  sourceId: string;
  questions: BankQuestion[];
  mode?: "prep" | "live";
  selectedQuestionId?: string | null;
  onSelect?: (q: BankQuestion) => void;
  onEdit: (q: BankQuestion) => void;
  onDelete: (q: BankQuestion) => void;
  onPush: (q: BankQuestion) => void;
  onDeleteAll: (sourceId: string) => void;
}

export function SourceMaterialCard({
  sourceTitle,
  sourceId,
  questions,
  mode = "prep",
  selectedQuestionId,
  onSelect,
  onEdit,
  onDelete,
  onPush,
  onDeleteAll,
}: SourceMaterialCardProps) {
  const isLive = mode === "live";
  const [open, setOpen] = useState(isLive);

  const sortedQuestions = [...questions].sort(naturalSort);

  const readyCount = questions.filter(q => !q.times_used || q.times_used === 0).length;
  const pushedCount = questions.filter(q => q.times_used && q.times_used > 0).length;

  return (
    <Card className="headspace-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 px-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <FileUp className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium text-sm truncate">{sourceTitle}</span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {questions.length} question{questions.length !== 1 ? "s" : ""}
                </Badge>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {readyCount} ready · {pushedCount} pushed
                </span>
              </div>
              {!isLive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAll(sourceId);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-4 space-y-2">
            {sortedQuestions.map((question, idx) => (
              <div key={question.id} className="flex items-start gap-2">
                {isLive && (
                  <span className="text-xs text-muted-foreground font-mono mt-4 w-5 text-right shrink-0">
                    {idx + 1}.
                  </span>
                )}
                <div className="flex-1">
                  <QuestionBankCard
                    question={question}
                    mode={mode}
                    selected={selectedQuestionId === question.id}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onPush={onPush}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
