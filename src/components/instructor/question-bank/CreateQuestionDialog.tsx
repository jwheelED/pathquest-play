import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import type { BankQuestion } from "./QuestionBankCard";

interface CreateQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editQuestion?: BankQuestion | null;
  professorType: string | null;
}

type QuestionType = "multiple_choice" | "short_answer" | "coding";

export function CreateQuestionDialog({
  open,
  onOpenChange,
  onSuccess,
  editQuestion,
  professorType,
}: CreateQuestionDialogProps) {
  const { selectedCourseId } = useCourseContext();
  const [saving, setSaving] = useState(false);
  const [generatingMcq, setGeneratingMcq] = useState(false);
  const [generatingExpected, setGeneratingExpected] = useState(false);

  const handleAiGenerateMcqOptions = async () => {
    if (!mcqQuestion.trim()) {
      toast.error("Enter a question first");
      return;
    }
    setGeneratingMcq(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-mcq-options", {
        body: { question_text: mcqQuestion },
      });
      if (error) throw error;
      if (data?.options?.length === 4) {
        setMcqOptions(data.options.map((o: string) => o.replace(/^[A-D][\).\s]+/, "")));
        setMcqCorrectAnswer(data.correct_answer || "A");
        if (data.explanation) setMcqExplanation(data.explanation);
        toast.success("AI options generated — review & adjust as needed");
      }
    } catch (e: unknown) {
      console.error(e);
      toast.error("Failed to generate options");
    } finally {
      setGeneratingMcq(false);
    }
  };

  const handleAiGenerateExpectedAnswer = async () => {
    if (!shortQuestion.trim()) {
      toast.error("Enter a question first");
      return;
    }
    setGeneratingExpected(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-expected-answer", {
        body: { question_text: shortQuestion },
      });
      if (error) throw error;
      if (data?.expected_answer) {
        setShortExpectedAnswer(data.expected_answer);
        toast.success("AI answer generated — review & adjust as needed");
      }
    } catch (e: unknown) {
      console.error(e);
      toast.error("Failed to generate expected answer");
    } finally {
      setGeneratingExpected(false);
    }
  };
  
  // Common fields
  const [title, setTitle] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("multiple_choice");
  const [difficulty, setDifficulty] = useState("medium");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  
  // MCQ fields
  const [mcqQuestion, setMcqQuestion] = useState("");
  const [mcqOptions, setMcqOptions] = useState(["", "", "", ""]);
  const [mcqCorrectAnswer, setMcqCorrectAnswer] = useState("A");
  const [mcqExplanation, setMcqExplanation] = useState("");
  
  // Short answer fields
  const [shortQuestion, setShortQuestion] = useState("");
  const [shortExpectedAnswer, setShortExpectedAnswer] = useState("");
  
  // Coding fields
  const [codingProblem, setCodingProblem] = useState("");
  const [codingStarterCode, setCodingStarterCode] = useState("");
  const [codingExpectedSolution, setCodingExpectedSolution] = useState("");
  const [codingLanguage, setCodingLanguage] = useState("python");
  
  // Available types based on professor type
  const availableTypes = professorType === "humanities" 
    ? ["multiple_choice", "short_answer"] 
    : ["multiple_choice", "short_answer", "coding"];
  
  // Reset form when dialog opens/closes or editQuestion changes
  useEffect(() => {
    if (open) {
      if (editQuestion) {
        // Populate form with existing question data
        setTitle(editQuestion.title);
        setQuestionType(editQuestion.question_type as QuestionType);
        setDifficulty(editQuestion.difficulty || "medium");
        setTags(editQuestion.tags || []);
        
        const content = editQuestion.question_content;
        if (editQuestion.question_type === "multiple_choice") {
          setMcqQuestion(content.question || "");
          setMcqOptions(content.options?.map((o: string) => o.replace(/^[A-D][\).\s]+/, "")) || ["", "", "", ""]);
          setMcqCorrectAnswer(content.correctAnswer || "A");
          setMcqExplanation(content.explanation || "");
        } else if (editQuestion.question_type === "short_answer") {
          setShortQuestion(content.question || "");
          setShortExpectedAnswer(content.expectedAnswer || "");
        } else if (editQuestion.question_type === "coding" || editQuestion.question_type === "coding_simple") {
          setCodingProblem(content.problemText || "");
          setCodingStarterCode(content.starterCode || "");
          setCodingExpectedSolution(content.expectedSolution || "");
          setCodingLanguage(content.language || "python");
        }
      } else {
        // Reset to defaults for new question
        setTitle("");
        setQuestionType("multiple_choice");
        setDifficulty("medium");
        setTags([]);
        setMcqQuestion("");
        setMcqOptions(["", "", "", ""]);
        setMcqCorrectAnswer("A");
        setMcqExplanation("");
        setShortQuestion("");
        setShortExpectedAnswer("");
        setCodingProblem("");
        setCodingStarterCode("");
        setCodingExpectedSolution("");
        setCodingLanguage("python");
      }
    }
  }, [open, editQuestion]);
  
  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };
  
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };
  
  const buildQuestionContent = () => {
    switch (questionType) {
      case "multiple_choice":
        return {
          type: "multiple_choice",
          question: mcqQuestion,
          options: mcqOptions.map((opt, i) => `${["A", "B", "C", "D"][i]}. ${opt}`),
          correctAnswer: mcqCorrectAnswer,
          explanation: mcqExplanation || undefined,
        };
      case "short_answer":
        return {
          type: "short_answer",
          question: shortQuestion,
          expectedAnswer: shortExpectedAnswer || undefined,
        };
      case "coding":
        return {
          type: "coding_simple",
          problemText: codingProblem,
          starterCode: codingStarterCode || undefined,
          expectedSolution: codingExpectedSolution || undefined,
          language: codingLanguage,
          difficulty: difficulty,
        };
      default:
        return {};
    }
  };
  
  const validateForm = () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return false;
    }
    
    switch (questionType) {
      case "multiple_choice":
        if (!mcqQuestion.trim()) {
          toast.error("Please enter the question text");
          return false;
        }
        if (mcqOptions.some(opt => !opt.trim())) {
          toast.error("Please fill in all 4 options");
          return false;
        }
        break;
      case "short_answer":
        if (!shortQuestion.trim()) {
          toast.error("Please enter the question text");
          return false;
        }
        break;
      case "coding":
        if (!codingProblem.trim()) {
          toast.error("Please enter the problem description");
          return false;
        }
        break;
    }
    
    return true;
  };
  
  const handleSave = async () => {
    if (!validateForm()) return;
    
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const questionData = {
        instructor_id: user.id,
        course_id: selectedCourseId || null,
        title: title.trim(),
        question_type: questionType === "coding" ? "coding_simple" : questionType,
        difficulty,
        tags: tags.length > 0 ? tags : null,
        question_content: buildQuestionContent(),
        updated_at: new Date().toISOString(),
      };
      
      if (editQuestion) {
        // Update existing
        const { error } = await supabase
          .from("instructor_question_bank")
          .update(questionData)
          .eq("id", editQuestion.id);
        
        if (error) throw error;
        toast.success("Question updated!");
      } else {
        // Create new
        const { error } = await supabase
          .from("instructor_question_bank")
          .insert(questionData);
        
        if (error) throw error;
        toast.success("Question saved to bank!");
      }
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving question:", error);
      toast.error(error.message || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editQuestion ? "Edit Question" : "Create New Question"}
          </DialogTitle>
          <DialogDescription>
            {editQuestion 
              ? "Update your saved question" 
              : "Add a new question to your bank for later use"
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Derivative of x² or Cell Biology Basics"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A descriptive name to help you identify this question
            </p>
          </div>
          
          {/* Question Type */}
          <div className="space-y-2">
            <Label>Question Type *</Label>
            <RadioGroup
              value={questionType}
              onValueChange={(v) => setQuestionType(v as QuestionType)}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="multiple_choice" id="type-mcq" />
                <Label htmlFor="type-mcq" className="cursor-pointer">Multiple Choice</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="short_answer" id="type-short" />
                <Label htmlFor="type-short" className="cursor-pointer">Short Answer</Label>
              </div>
              {availableTypes.includes("coding") && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="coding" id="type-coding" />
                  <Label htmlFor="type-coding" className="cursor-pointer">Coding</Label>
                </div>
              )}
            </RadioGroup>
          </div>
          
          {/* Difficulty */}
          <div className="space-y-2">
            <Label>Difficulty</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Type-specific fields */}
          {questionType === "multiple_choice" && (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
              <div className="space-y-2">
                <Label>Question Text *</Label>
                <Textarea
                  placeholder="Enter your question..."
                  value={mcqQuestion}
                  onChange={(e) => setMcqQuestion(e.target.value)}
                  rows={3}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={generatingMcq || !mcqQuestion.trim()}
                  onClick={handleAiGenerateMcqOptions}
                >
                  {generatingMcq ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {generatingMcq ? "Generating..." : "AI Suggest Options"}
                </Button>
                  <div key={letter} className="flex items-center gap-2">
                    <span className="w-6 text-sm font-medium">{letter}.</span>
                    <Input
                      placeholder={`Option ${letter}`}
                      value={mcqOptions[i]}
                      onChange={(e) => {
                        const newOptions = [...mcqOptions];
                        newOptions[i] = e.target.value;
                        setMcqOptions(newOptions);
                      }}
                    />
                  </div>
                ))}
              </div>
              
              <div className="space-y-2">
                <Label>Correct Answer *</Label>
                <Select value={mcqCorrectAnswer} onValueChange={setMcqCorrectAnswer}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["A", "B", "C", "D"].map(letter => (
                      <SelectItem key={letter} value={letter}>{letter}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Explanation (optional)</Label>
                <Textarea
                  placeholder="Why is this the correct answer?"
                  value={mcqExplanation}
                  onChange={(e) => setMcqExplanation(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
          
          {questionType === "short_answer" && (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
              <div className="space-y-2">
                <Label>Question Text *</Label>
                <Textarea
                  placeholder="Enter your question..."
                  value={shortQuestion}
                  onChange={(e) => setShortQuestion(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Expected Answer (optional)</Label>
                <Textarea
                  placeholder="Model answer for grading reference..."
                  value={shortExpectedAnswer}
                  onChange={(e) => setShortExpectedAnswer(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Used as a reference for AI grading
                </p>
              </div>
            </div>
          )}
          
          {questionType === "coding" && (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
              <div className="space-y-2">
                <Label>Programming Language</Label>
                <Select value={codingLanguage} onValueChange={setCodingLanguage}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                    <SelectItem value="java">Java</SelectItem>
                    <SelectItem value="cpp">C++</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Problem Description *</Label>
                <Textarea
                  placeholder="Describe the coding problem..."
                  value={codingProblem}
                  onChange={(e) => setCodingProblem(e.target.value)}
                  rows={4}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Starter Code (optional)</Label>
                <Textarea
                  placeholder="def solution():\n    # Your code here\n    pass"
                  value={codingStarterCode}
                  onChange={(e) => setCodingStarterCode(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Expected Solution (optional)</Label>
                <Textarea
                  placeholder="Model solution for reference..."
                  value={codingExpectedSolution}
                  onChange={(e) => setCodingExpectedSolution(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}
          
          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddTag}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editQuestion ? "Update Question" : "Save Question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
