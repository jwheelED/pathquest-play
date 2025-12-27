import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Save, 
  X, 
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface SolutionStep {
  step: number;
  explanation: string;
  latex?: string;
}

interface Problem {
  id?: string;
  answer_key_id: string;
  problem_number: string;
  problem_text: string;
  problem_latex?: string;
  solution_text: string;
  solution_latex?: string;
  solution_steps: SolutionStep[];
  final_answer: string;
  final_answer_latex?: string;
  units?: string;
  topic_tags: string[];
  keywords: string[];
  difficulty: string;
  verified_by_instructor: boolean;
  verification_notes?: string;
}

interface ProblemEditorProps {
  answerKeyId: string;
  problem?: Problem;
  onSave?: () => void;
  onCancel?: () => void;
}

export function ProblemEditor({ answerKeyId, problem, onSave, onCancel }: ProblemEditorProps) {
  const queryClient = useQueryClient();
  const isEditing = !!problem?.id;

  const [formData, setFormData] = useState<Problem>({
    answer_key_id: answerKeyId,
    problem_number: "",
    problem_text: "",
    problem_latex: "",
    solution_text: "",
    solution_latex: "",
    solution_steps: [],
    final_answer: "",
    final_answer_latex: "",
    units: "",
    topic_tags: [],
    keywords: [],
    difficulty: "intermediate",
    verified_by_instructor: false,
    verification_notes: "",
    ...problem,
  });

  const [tagInput, setTagInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Cast solution_steps to JSON-compatible format
      const solutionStepsJson = formData.solution_steps.map((step) => ({
        step: step.step,
        explanation: step.explanation,
        latex: step.latex || "",
      }));

      const payload = {
        answer_key_id: formData.answer_key_id,
        problem_number: formData.problem_number || null,
        problem_text: formData.problem_text,
        problem_latex: formData.problem_latex || null,
        solution_text: formData.solution_text,
        solution_latex: formData.solution_latex || null,
        solution_steps: solutionStepsJson as any,
        final_answer: formData.final_answer,
        final_answer_latex: formData.final_answer_latex || null,
        units: formData.units || null,
        topic_tags: formData.topic_tags,
        keywords: formData.keywords,
        difficulty: formData.difficulty,
        verified_by_instructor: formData.verified_by_instructor,
        verification_notes: formData.verification_notes || null,
      };

      if (isEditing && problem?.id) {
        const { error } = await supabase
          .from("answer_key_problems")
          .update(payload)
          .eq("id", problem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("answer_key_problems")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Problem updated" : "Problem added");
      queryClient.invalidateQueries({ queryKey: ["answer-key-problems", answerKeyId] });
      queryClient.invalidateQueries({ queryKey: ["answer-keys"] });
      onSave?.();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save problem");
    },
  });

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.topic_tags.includes(tag)) {
      setFormData((prev) => ({
        ...prev,
        topic_tags: [...prev.topic_tags, tag],
      }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      topic_tags: prev.topic_tags.filter((t) => t !== tag),
    }));
  };

  const addKeyword = () => {
    const keyword = keywordInput.trim().toLowerCase();
    if (keyword && !formData.keywords.includes(keyword)) {
      setFormData((prev) => ({
        ...prev,
        keywords: [...prev.keywords, keyword],
      }));
      setKeywordInput("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((k) => k !== keyword),
    }));
  };

  const addSolutionStep = () => {
    setFormData((prev) => ({
      ...prev,
      solution_steps: [
        ...prev.solution_steps,
        { step: prev.solution_steps.length + 1, explanation: "", latex: "" },
      ],
    }));
  };

  const updateSolutionStep = (index: number, field: keyof SolutionStep, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      solution_steps: prev.solution_steps.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      ),
    }));
  };

  const removeSolutionStep = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      solution_steps: prev.solution_steps
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step: i + 1 })),
    }));
  };

  const isValid = formData.problem_text.trim() && formData.solution_text.trim() && formData.final_answer.trim();

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {isEditing ? "Edit Problem" : "Add New Problem"}
          </CardTitle>
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!isValid || saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Problem Number</Label>
            <Input
              value={formData.problem_number}
              onChange={(e) => setFormData((prev) => ({ ...prev, problem_number: e.target.value }))}
              placeholder="e.g., 1a, 2.3"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Difficulty</Label>
            <Select
              value={formData.difficulty}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, difficulty: value }))}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
                <SelectItem value="expert">Expert</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Units (if applicable)</Label>
            <Input
              value={formData.units || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, units: e.target.value }))}
              placeholder="e.g., m/s, J, N"
              className="mt-1.5"
            />
          </div>
        </div>

        {/* Problem Statement */}
        <div>
          <Label>Problem Statement *</Label>
          <Textarea
            value={formData.problem_text}
            onChange={(e) => setFormData((prev) => ({ ...prev, problem_text: e.target.value }))}
            placeholder="Enter the full problem statement..."
            className="mt-1.5 min-h-[100px]"
          />
        </div>

        <div>
          <Label>Problem LaTeX (optional)</Label>
          <Textarea
            value={formData.problem_latex || ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, problem_latex: e.target.value }))}
            placeholder="LaTeX equations for the problem..."
            className="mt-1.5 font-mono text-sm"
            rows={2}
          />
        </div>

        {/* Solution */}
        <div>
          <Label>Solution Explanation *</Label>
          <Textarea
            value={formData.solution_text}
            onChange={(e) => setFormData((prev) => ({ ...prev, solution_text: e.target.value }))}
            placeholder="Explain the solution approach..."
            className="mt-1.5 min-h-[100px]"
          />
        </div>

        {/* Solution Steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Solution Steps (optional)</Label>
            <Button variant="outline" size="sm" onClick={addSolutionStep}>
              <Plus className="h-3 w-3 mr-1" />
              Add Step
            </Button>
          </div>
          {formData.solution_steps.length > 0 && (
            <div className="space-y-3">
              {formData.solution_steps.map((step, index) => (
                <div key={index} className="flex gap-2 items-start p-3 border rounded-lg bg-accent/20">
                  <Badge variant="outline" className="mt-1">
                    {step.step}
                  </Badge>
                  <div className="flex-1 space-y-2">
                    <Input
                      value={step.explanation}
                      onChange={(e) => updateSolutionStep(index, "explanation", e.target.value)}
                      placeholder="Step explanation..."
                    />
                    <Input
                      value={step.latex || ""}
                      onChange={(e) => updateSolutionStep(index, "latex", e.target.value)}
                      placeholder="LaTeX (optional)..."
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSolutionStep(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Final Answer */}
        <div className="p-4 border-2 border-primary/20 rounded-xl bg-primary/5">
          <Label className="text-primary font-semibold">Final Answer *</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <Input
              value={formData.final_answer}
              onChange={(e) => setFormData((prev) => ({ ...prev, final_answer: e.target.value }))}
              placeholder="The definitive answer..."
              className="font-medium"
            />
            <Input
              value={formData.final_answer_latex || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, final_answer_latex: e.target.value }))}
              placeholder="LaTeX version..."
              className="font-mono text-sm"
            />
          </div>
        </div>

        {/* Topic Tags */}
        <div>
          <Label>Topic Tags</Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add topic tag..."
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            />
            <Button variant="outline" onClick={addTag}>
              Add
            </Button>
          </div>
          {formData.topic_tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.topic_tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                  {tag}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Keywords for Matching */}
        <div>
          <Label>Keywords (for transcript matching)</Label>
          <p className="text-xs text-muted-foreground mb-1.5">
            Words that will trigger this problem when spoken during live lecture
          </p>
          <div className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="Add keyword..."
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
            />
            <Button variant="outline" onClick={addKeyword}>
              Add
            </Button>
          </div>
          {formData.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.keywords.map((keyword) => (
                <Badge key={keyword} variant="outline" className="cursor-pointer" onClick={() => removeKeyword(keyword)}>
                  {keyword}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Verification */}
        <div className="flex items-center justify-between p-4 border rounded-xl bg-accent/20">
          <div className="flex items-center gap-3">
            {formData.verified_by_instructor ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">
                {formData.verified_by_instructor ? "Verified" : "Not Verified"}
              </p>
              <p className="text-sm text-muted-foreground">
                Mark as verified when you've confirmed the solution is correct
              </p>
            </div>
          </div>
          <Button
            variant={formData.verified_by_instructor ? "outline" : "default"}
            onClick={() =>
              setFormData((prev) => ({
                ...prev,
                verified_by_instructor: !prev.verified_by_instructor,
              }))
            }
          >
            {formData.verified_by_instructor ? "Unverify" : "Mark Verified"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
