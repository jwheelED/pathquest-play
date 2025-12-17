import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Check, Pencil, RefreshCw, Trash2, ChevronDown, Loader2, X, Save } from "lucide-react";

export interface StudioQuestion {
  id: string;
  question_text: string;
  question_type: "multiple_choice" | "short_answer";
  options: string[];
  correct_answer: string;
  explanation: string;
  status: "pending" | "approved" | "edited" | "regenerating";
}

interface StudioQuestionCardProps {
  question: StudioQuestion;
  index: number;
  onApprove: () => void;
  onEdit: (updates: Partial<StudioQuestion>) => void;
  onRegenerate: () => void;
  onDelete: () => void;
}

export function StudioQuestionCard({
  question,
  index,
  onApprove,
  onEdit,
  onRegenerate,
  onDelete,
}: StudioQuestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    question_text: question.question_text,
    options: [...question.options],
    correct_answer: question.correct_answer,
    explanation: question.explanation,
  });

  const handleSaveEdit = () => {
    onEdit(editData);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditData({
      question_text: question.question_text,
      options: [...question.options],
      correct_answer: question.correct_answer,
      explanation: question.explanation,
    });
    setIsEditing(false);
  };

  const updateOption = (idx: number, value: string) => {
    const newOptions = [...editData.options];
    newOptions[idx] = value;
    setEditData({ ...editData, options: newOptions });
  };

  const statusBadge = {
    pending: <Badge variant="outline">Pending</Badge>,
    approved: <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">Approved</Badge>,
    edited: <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">Edited</Badge>,
    regenerating: <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin mr-1" />Regenerating</Badge>,
  };

  if (question.status === "regenerating") {
    return (
      <Card className="border-muted animate-pulse">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
              {index}
            </div>
            <div className="flex-1">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`transition-colors ${
      question.status === "approved" ? "border-emerald-500/30 bg-emerald-500/5" :
      question.status === "edited" ? "border-amber-500/30 bg-amber-500/5" :
      "border-border"
    }`}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">
              {index}
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <Textarea
                  value={editData.question_text}
                  onChange={(e) => setEditData({ ...editData, question_text: e.target.value })}
                  className="text-sm mb-2"
                  rows={3}
                />
              ) : (
                <p className="text-sm font-medium leading-relaxed">{question.question_text}</p>
              )}
              
              <div className="flex items-center gap-2 mt-2">
                {statusBadge[question.status]}
                <Badge variant="outline" className="text-xs">
                  {question.question_type === "multiple_choice" ? "MCQ" : "Short Answer"}
                </Badge>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    {isExpanded ? "Less" : "More"}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </div>

          <CollapsibleContent className="mt-4 space-y-3">
            {/* Options */}
            {question.question_type === "multiple_choice" && (
              <div className="space-y-2 pl-11">
                <label className="text-xs font-medium text-muted-foreground">Options</label>
                {isEditing ? (
                  <div className="space-y-2">
                    {editData.options.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs font-medium w-5">{String.fromCharCode(65 + idx)})</span>
                        <Input
                          value={opt}
                          onChange={(e) => updateOption(idx, e.target.value)}
                          className="text-sm h-8"
                        />
                        {opt === editData.correct_answer && (
                          <Badge className="bg-emerald-500 text-white text-xs">Correct</Badge>
                        )}
                      </div>
                    ))}
                    <div className="mt-2">
                      <label className="text-xs text-muted-foreground">Correct Answer</label>
                      <select
                        value={editData.correct_answer}
                        onChange={(e) => setEditData({ ...editData, correct_answer: e.target.value })}
                        className="w-full mt-1 text-sm border rounded px-2 py-1"
                      >
                        {editData.options.map((opt, idx) => (
                          <option key={idx} value={opt}>
                            {String.fromCharCode(65 + idx)}) {opt.slice(0, 50)}...
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {question.options.map((opt, idx) => (
                      <div
                        key={idx}
                        className={`text-sm py-1 px-2 rounded flex items-center gap-2 ${
                          opt === question.correct_answer
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span className="font-medium">{String.fromCharCode(65 + idx)})</span>
                        <span>{opt}</span>
                        {opt === question.correct_answer && (
                          <Check className="h-3 w-3 text-emerald-600 ml-auto" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Explanation */}
            <div className="pl-11 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Explanation</label>
              {isEditing ? (
                <Textarea
                  value={editData.explanation}
                  onChange={(e) => setEditData({ ...editData, explanation: e.target.value })}
                  className="text-sm"
                  rows={2}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{question.explanation || "No explanation provided"}</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pl-11 pt-2 border-t">
              {isEditing ? (
                <>
                  <Button size="sm" onClick={handleSaveEdit} className="h-8">
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-8">
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant={question.status === "approved" ? "secondary" : "default"}
                    onClick={onApprove}
                    className="h-8"
                    disabled={question.status === "approved"}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    {question.status === "approved" ? "Approved" : "Approve"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="h-8">
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={onRegenerate} className="h-8">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Regenerate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
