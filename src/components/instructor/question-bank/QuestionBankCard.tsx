import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  MoreVertical, 
  Edit, 
  Trash2, 
  Send, 
  Code, 
  FileText, 
  CheckSquare,
  Star,
  Circle,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface BankQuestion {
  id: string;
  title: string;
  question_type: string;
  difficulty: string | null;
  tags: string[] | null;
  times_used: number | null;
  last_used_at: string | null;
  question_content: Record<string, unknown>;
  created_at: string;
  source_material_id?: string | null;
  source_material_title?: string | null;
}

interface QuestionBankCardProps {
  question: BankQuestion;
  mode?: "prep" | "live";
  selected?: boolean;
  onSelect?: (question: BankQuestion) => void;
  onEdit: (question: BankQuestion) => void;
  onDelete: (question: BankQuestion) => void;
  onPush: (question: BankQuestion) => void;
}

const typeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  multiple_choice: { 
    icon: CheckSquare, 
    label: "MCQ", 
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20" 
  },
  short_answer: { 
    icon: FileText, 
    label: "Short Answer", 
    color: "bg-purple-500/10 text-purple-600 border-purple-500/20" 
  },
  coding: { 
    icon: Code, 
    label: "Coding", 
    color: "bg-green-500/10 text-green-600 border-green-500/20" 
  },
  coding_simple: { 
    icon: Code, 
    label: "Coding", 
    color: "bg-green-500/10 text-green-600 border-green-500/20" 
  },
};

const difficultyConfig: Record<string, string> = {
  easy: "text-green-600",
  medium: "text-yellow-600",
  hard: "text-red-600",
};

export function QuestionBankCard({ 
  question, 
  mode = "prep", 
  selected = false, 
  onSelect, 
  onEdit, 
  onDelete, 
  onPush 
}: QuestionBankCardProps) {
  const config = typeConfig[question.question_type] || typeConfig.short_answer;
  const Icon = config.icon;
  const isPushed = question.times_used != null && question.times_used > 0;
  const isLive = mode === "live";
  const maxPreview = isLive ? 300 : 200;

  const getPreviewText = () => {
    const content = question.question_content;
    if (content.question) return content.question as string;
    if (content.problemText) return content.problemText as string;
    return "No preview available";
  };

  const previewText = getPreviewText();
  const truncatedPreview = previewText.length > maxPreview 
    ? previewText.substring(0, maxPreview) + "..." 
    : previewText;

  return (
    <Card 
      className={cn(
        "headspace-card transition-all cursor-pointer",
        selected 
          ? "ring-2 ring-primary shadow-md" 
          : "hover:shadow-sm",
      )}
      onClick={() => onSelect?.(question)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Row 1: Type + Status + Difficulty */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge variant="outline" className={cn("text-xs", config.color)}>
                <Icon className="w-3 h-3 mr-1" />
                {config.label}
              </Badge>
              {isPushed ? (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-secondary/15 text-secondary border-secondary/20">
                  <CheckCircle2 className="w-3 h-3" />
                  Pushed{question.times_used! > 1 ? ` ×${question.times_used}` : ""}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20">
                  <Circle className="w-3 h-3" />
                  Ready
                </Badge>
              )}
              {question.difficulty && (
                <span className={cn("text-xs font-medium flex items-center gap-1", difficultyConfig[question.difficulty] || "text-muted-foreground")}>
                  <Star className="w-3 h-3" />
                  {question.difficulty}
                </span>
              )}
            </div>
            
            {/* Title */}
            <h3 className="font-semibold text-sm mb-1 truncate">{question.title}</h3>
            
            {/* Preview — more generous */}
            <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
              {truncatedPreview}
            </p>
            
            {/* Tags */}
            {question.tags && question.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {question.tags.slice(0, 3).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
                {question.tags.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{question.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button 
              size={isLive ? "default" : "sm"}
              onClick={() => onPush(question)}
              className={cn("text-xs", isLive && "h-10 px-4")}
            >
              <Send className={cn("mr-1", isLive ? "w-4 h-4" : "w-3 h-3")} />
              Push
            </Button>
            
            {!isLive && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(question)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onDelete(question)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
