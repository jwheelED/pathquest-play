import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, FileUp, Trash2 } from "lucide-react";
import { QuestionBankCard, type BankQuestion } from "./QuestionBankCard";

interface SourceMaterialCardProps {
  sourceTitle: string;
  sourceId: string;
  questions: BankQuestion[];
  onEdit: (q: BankQuestion) => void;
  onDelete: (q: BankQuestion) => void;
  onPush: (q: BankQuestion) => void;
  onDeleteAll: (sourceId: string) => void;
}

export function SourceMaterialCard({
  sourceTitle,
  sourceId,
  questions,
  onEdit,
  onDelete,
  onPush,
  onDeleteAll,
}: SourceMaterialCardProps) {
  const [open, setOpen] = useState(false);

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
              </div>
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
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-4 space-y-2">
            {questions.map((question) => (
              <QuestionBankCard
                key={question.id}
                question={question}
                onEdit={onEdit}
                onDelete={onDelete}
                onPush={onPush}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
