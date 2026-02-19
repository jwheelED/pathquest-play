import { useState } from "react";
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
  Star
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
  question_content: Record<string, any>;
  created_at: string;
}

interface QuestionBankCardProps {
  question: BankQuestion;
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

export function QuestionBankCard({ question, onEdit, onDelete, onPush }: QuestionBankCardProps) {
  const config = typeConfig[question.question_type] || typeConfig.short_answer;
  const Icon = config.icon;

  // Extract preview text from question content
  const getPreviewText = () => {
    const content = question.question_content;
    if (content.question) return content.question;
    if (content.problemText) return content.problemText;
    return "No preview available";
  };

  const previewText = getPreviewText();
  const truncatedPreview = previewText.length > 120 
    ? previewText.substring(0, 120) + "..." 
    : previewText;

  return (
    <Card className="headspace-card hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Type badge and title */}
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={cn("text-xs", config.color)}>
                <Icon className="w-3 h-3 mr-1" />
                {config.label}
              </Badge>
              {question.difficulty && (
                <span className={cn("text-xs font-medium flex items-center gap-1", difficultyConfig[question.difficulty] || "text-muted-foreground")}>
                  <Star className="w-3 h-3" />
                  {question.difficulty}
                </span>
              )}
            </div>
            
            {/* Title */}
            <h3 className="font-semibold text-sm mb-1 truncate">{question.title}</h3>
            
            {/* Preview */}
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {truncatedPreview}
            </p>
            
            {/* Meta info */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {question.times_used !== null && question.times_used > 0 && (
                <span>📊 Used {question.times_used} time{question.times_used !== 1 ? 's' : ''}</span>
              )}
              {question.tags && question.tags.length > 0 && (
                <div className="flex gap-1">
                  {question.tags.slice(0, 2).map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {tag}
                    </Badge>
                  ))}
                  {question.tags.length > 2 && (
                    <span className="text-muted-foreground">+{question.tags.length - 2}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button 
              size="sm" 
              onClick={() => onPush(question)}
              className="text-xs h-8"
            >
              <Send className="w-3 h-3 mr-1" />
              Push
            </Button>
            
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
