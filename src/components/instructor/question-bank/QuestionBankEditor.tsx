import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save, Plus, Code, ListChecks, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { 
  QuestionBankItem, QuestionType, Difficulty, QuestionFormData,
  CodingQuestionContent, MCQQuestionContent, ShortAnswerQuestionContent,
  isCodingContent, isMCQContent, isShortAnswerContent
} from "./types";
import { CodingQuestionForm } from "./CodingQuestionForm";
import { Json } from "@/integrations/supabase/types";

interface QuestionBankEditorProps {
  courseId?: string;
  editingQuestion: QuestionBankItem | null;
  onSave: () => void;
  onCancel: () => void;
}

const defaultCodingContent: CodingQuestionContent = {
  question: "",
  title: "",
  language: "python",
  difficulty: "medium",
  functionSignature: "",
  constraints: [],
  examples: [{ input: "", output: "", explanation: "" }],
  hints: [],
  starterCode: "# Write your solution here\n\ndef solution():\n    pass",
  testCases: [{ input: [], expected: null }],
};

const defaultMCQContent: MCQQuestionContent = {
  question: "",
  options: ["A. ", "B. ", "C. ", "D. "],
  correctAnswer: "A",
  explanation: "",
};

const defaultShortAnswerContent: ShortAnswerQuestionContent = {
  question: "",
  expectedAnswer: "",
  gradingNotes: "",
};

export function QuestionBankEditor({ 
  courseId, 
  editingQuestion, 
  onSave, 
  onCancel 
}: QuestionBankEditorProps) {
  const [title, setTitle] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("coding");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Content states for each type
  const [codingContent, setCodingContent] = useState<CodingQuestionContent>(defaultCodingContent);
  const [mcqContent, setMCQContent] = useState<MCQQuestionContent>(defaultMCQContent);
  const [shortAnswerContent, setShortAnswerContent] = useState<ShortAnswerQuestionContent>(defaultShortAnswerContent);

  useEffect(() => {
    if (editingQuestion) {
      setTitle(editingQuestion.title);
      setQuestionType(editingQuestion.question_type);
      setDifficulty(editingQuestion.difficulty || "medium");
      setTags(editingQuestion.tags || []);

      const content = editingQuestion.question_content;
      if (isCodingContent(content)) {
        setCodingContent(content);
      } else if (isMCQContent(content)) {
        setMCQContent(content);
      } else if (isShortAnswerContent(content)) {
        setShortAnswerContent(content);
      }
    } else {
      // Reset form for new question
      setTitle("");
      setQuestionType("coding");
      setDifficulty("medium");
      setTags([]);
      setCodingContent(defaultCodingContent);
      setMCQContent(defaultMCQContent);
      setShortAnswerContent(defaultShortAnswerContent);
    }
  }, [editingQuestion]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const getCurrentContent = () => {
    switch (questionType) {
      case "coding":
      case "coding_simple":
        return { ...codingContent, title, difficulty };
      case "multiple_choice":
        return mcqContent;
      case "short_answer":
        return shortAnswerContent;
      default:
        return codingContent;
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    const content = getCurrentContent();
    if ('question' in content && !content.question.trim()) {
      toast.error("Please enter the question/problem statement");
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in");
        return;
      }

      const questionData = {
        instructor_id: user.id,
        course_id: courseId || null,
        title: title.trim(),
        question_type: questionType,
        question_content: content as unknown as Json,
        difficulty,
        tags: tags.length > 0 ? tags : null,
        updated_at: new Date().toISOString(),
      };

      if (editingQuestion) {
        const { error } = await supabase
          .from("instructor_question_bank")
          .update(questionData)
          .eq("id", editingQuestion.id);

        if (error) throw error;
        toast.success("Question updated!");
      } else {
        const { error } = await supabase
          .from("instructor_question_bank")
          .insert(questionData);

        if (error) throw error;
        toast.success("Question saved to bank!");
      }

      onSave();
    } catch (error) {
      console.error("Error saving question:", error);
      toast.error("Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const renderContentForm = () => {
    switch (questionType) {
      case "coding":
      case "coding_simple":
        return (
          <CodingQuestionForm 
            content={codingContent} 
            onChange={setCodingContent}
            isSimple={questionType === "coding_simple"}
          />
        );

      case "multiple_choice":
        return (
          <div className="space-y-4">
            <div>
              <Label>Question</Label>
              <Textarea
                value={mcqContent.question}
                onChange={(e) => setMCQContent({ ...mcqContent, question: e.target.value })}
                placeholder="Enter the question..."
                rows={3}
              />
            </div>

            <div>
              <Label>Options</Label>
              <div className="space-y-2 mt-2">
                {mcqContent.options.map((option, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 text-sm font-medium text-muted-foreground">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    <Input
                      value={option.replace(/^[A-D]\.\s*/, "")}
                      onChange={(e) => {
                        const newOptions = [...mcqContent.options];
                        newOptions[idx] = `${String.fromCharCode(65 + idx)}. ${e.target.value}`;
                        setMCQContent({ ...mcqContent, options: newOptions });
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Correct Answer</Label>
              <Select 
                value={mcqContent.correctAnswer} 
                onValueChange={(v) => setMCQContent({ ...mcqContent, correctAnswer: v })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["A", "B", "C", "D"].map(letter => (
                    <SelectItem key={letter} value={letter}>{letter}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Explanation (optional)</Label>
              <Textarea
                value={mcqContent.explanation || ""}
                onChange={(e) => setMCQContent({ ...mcqContent, explanation: e.target.value })}
                placeholder="Explain why this is the correct answer..."
                rows={2}
              />
            </div>
          </div>
        );

      case "short_answer":
        return (
          <div className="space-y-4">
            <div>
              <Label>Question</Label>
              <Textarea
                value={shortAnswerContent.question}
                onChange={(e) => setShortAnswerContent({ ...shortAnswerContent, question: e.target.value })}
                placeholder="Enter the question..."
                rows={3}
              />
            </div>

            <div>
              <Label>Expected Answer</Label>
              <Textarea
                value={shortAnswerContent.expectedAnswer}
                onChange={(e) => setShortAnswerContent({ ...shortAnswerContent, expectedAnswer: e.target.value })}
                placeholder="Enter the expected answer for auto-grading..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                AI will use this to grade student responses
              </p>
            </div>

            <div>
              <Label>Grading Notes (optional)</Label>
              <Textarea
                value={shortAnswerContent.gradingNotes || ""}
                onChange={(e) => setShortAnswerContent({ ...shortAnswerContent, gradingNotes: e.target.value })}
                placeholder="Additional grading criteria or keywords to look for..."
                rows={2}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle>{editingQuestion ? "Edit Question" : "Create Question"}</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Basic Info Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Question Type</Label>
            <Select 
              value={questionType} 
              onValueChange={(v) => setQuestionType(v as QuestionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coding">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Coding Problem
                  </div>
                </SelectItem>
                <SelectItem value="multiple_choice">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4" />
                    Multiple Choice
                  </div>
                </SelectItem>
                <SelectItem value="short_answer">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Short Answer
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Difficulty</Label>
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Two Sum Problem"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <Label>Tags</Label>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button onClick={() => handleRemoveTag(tag)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                placeholder="Add tag..."
                className="w-32 h-8"
              />
              <Button variant="ghost" size="sm" onClick={handleAddTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Type-specific content form */}
        <div className="border-t pt-6">
          {renderContentForm()}
        </div>
      </CardContent>
    </Card>
  );
}
