import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Code, Save, Send, Plus, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCourseContext } from "@/hooks/useCourseContext";

interface CodingQuestionCreatorProps {
  onSave?: (question: CodingQuestionData) => void;
  onSend?: (question: CodingQuestionData) => void;
  initialData?: Partial<CodingQuestionData>;
}

export interface CodingQuestionData {
  id?: string;
  title: string;
  question_type: "coding" | "coding_simple";
  language: string;
  problem: string;
  starterCode: string;
  expectedBehavior: string;
  examples: string[];
  conceptsTested: string[];
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
}

const LANGUAGES = [
  { value: "java", label: "Java" },
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "cpp", label: "C++" },
];

const STARTER_TEMPLATES: Record<string, string> = {
  java: `public class Book {
    // Your code here
}

public class Library {
    // Your code here
}`,
  python: `class Book:
    # Your code here
    pass

class Library:
    # Your code here
    pass`,
  javascript: `class Book {
  // Your code here
}

class Library {
  // Your code here
}`,
  cpp: `class Book {
    // Your code here
};

class Library {
    // Your code here
};`,
};

export function CodingQuestionCreator({ onSave, onSend, initialData }: CodingQuestionCreatorProps) {
  const { selectedCourseId } = useCourseContext();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CodingQuestionData>({
    title: initialData?.title || "",
    question_type: initialData?.question_type || "coding",
    language: initialData?.language || "java",
    problem: initialData?.problem || "",
    starterCode: initialData?.starterCode || STARTER_TEMPLATES.java,
    expectedBehavior: initialData?.expectedBehavior || "",
    examples: initialData?.examples || [""],
    conceptsTested: initialData?.conceptsTested || [],
    difficulty: initialData?.difficulty || "medium",
    tags: initialData?.tags || [],
  });

  const [newTag, setNewTag] = useState("");
  const [newConcept, setNewConcept] = useState("");

  const handleLanguageChange = (lang: string) => {
    setFormData(prev => ({
      ...prev,
      language: lang,
      starterCode: prev.starterCode === STARTER_TEMPLATES[prev.language] 
        ? STARTER_TEMPLATES[lang] 
        : prev.starterCode,
    }));
  };

  const addExample = () => {
    setFormData(prev => ({ ...prev, examples: [...prev.examples, ""] }));
  };

  const updateExample = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      examples: prev.examples.map((ex, i) => i === index ? value : ex),
    }));
  };

  const removeExample = (index: number) => {
    setFormData(prev => ({
      ...prev,
      examples: prev.examples.filter((_, i) => i !== index),
    }));
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }));
  };

  const addConcept = () => {
    if (newConcept.trim() && !formData.conceptsTested.includes(newConcept.trim())) {
      setFormData(prev => ({ ...prev, conceptsTested: [...prev.conceptsTested, newConcept.trim()] }));
      setNewConcept("");
    }
  };

  const removeConcept = (concept: string) => {
    setFormData(prev => ({
      ...prev,
      conceptsTested: prev.conceptsTested.filter(c => c !== concept),
    }));
  };

  const handleSaveToBank = async () => {
    if (!formData.title.trim() || !formData.problem.trim()) {
      toast.error("Please enter a title and problem description");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const questionContent = {
        problem: formData.problem,
        language: formData.language,
        starter_code: formData.starterCode,
        expected_behavior: formData.expectedBehavior,
        examples: formData.examples.filter(e => e.trim()),
        concepts_tested: formData.conceptsTested,
      };

      const { error } = await supabase.from("instructor_question_bank").insert({
        instructor_id: user.id,
        course_id: selectedCourseId || null,
        title: formData.title,
        question_type: formData.question_type,
        question_content: questionContent,
        tags: formData.tags,
        difficulty: formData.difficulty,
      });

      if (error) throw error;

      toast.success("Question saved to bank!");
      onSave?.(formData);

      // Reset form
      setFormData({
        title: "",
        question_type: "coding",
        language: "java",
        problem: "",
        starterCode: STARTER_TEMPLATES.java,
        expectedBehavior: "",
        examples: [""],
        conceptsTested: [],
        difficulty: "medium",
        tags: [],
      });
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(err.message || "Failed to save question");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendNow = () => {
    if (!formData.title.trim() || !formData.problem.trim()) {
      toast.error("Please enter a title and problem description");
      return;
    }
    onSend?.(formData);
  };

  const isValid = formData.title.trim() && formData.problem.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5 text-primary" />
          Create Coding Problem
        </CardTitle>
        <CardDescription>
          Create OOP exercises, algorithm problems, or code review questions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title and Type */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="title">Question Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Library-Book Composition"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Question Type</Label>
            <Select
              value={formData.question_type}
              onValueChange={(v) => setFormData(prev => ({ ...prev, question_type: v as "coding" | "coding_simple" }))}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coding">Full Coding Problem</SelectItem>
                <SelectItem value="coding_simple">Quick Code Check-in</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Language and Difficulty */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="language">Programming Language</Label>
            <Select value={formData.language} onValueChange={handleLanguageChange}>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(lang => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="difficulty">Difficulty</Label>
            <Select
              value={formData.difficulty}
              onValueChange={(v) => setFormData(prev => ({ ...prev, difficulty: v as "easy" | "medium" | "hard" }))}
            >
              <SelectTrigger id="difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Problem Description */}
        <div className="space-y-2">
          <Label htmlFor="problem">Problem Description *</Label>
          <Textarea
            id="problem"
            value={formData.problem}
            onChange={(e) => setFormData(prev => ({ ...prev, problem: e.target.value }))}
            placeholder="Create a Library class that has a composition relationship with a Book class. The Library should be able to add books and list all book titles."
            className="min-h-[100px]"
          />
        </div>

        {/* Starter Code */}
        <div className="space-y-2">
          <Label htmlFor="starterCode">Starter Code Template</Label>
          <Textarea
            id="starterCode"
            value={formData.starterCode}
            onChange={(e) => setFormData(prev => ({ ...prev, starterCode: e.target.value }))}
            className="min-h-[150px] font-mono text-sm"
          />
        </div>

        {/* Expected Behavior */}
        <div className="space-y-2">
          <Label htmlFor="expectedBehavior">Expected Behavior (for AI grading)</Label>
          <Textarea
            id="expectedBehavior"
            value={formData.expectedBehavior}
            onChange={(e) => setFormData(prev => ({ ...prev, expectedBehavior: e.target.value }))}
            placeholder="Library class contains Book objects. addBook() adds a book. listTitles() returns all book titles."
            className="min-h-[80px]"
          />
        </div>

        {/* Examples */}
        <div className="space-y-2">
          <Label>Usage Examples</Label>
          <div className="space-y-2">
            {formData.examples.map((example, idx) => (
              <div key={idx} className="flex gap-2">
                <Textarea
                  value={example}
                  onChange={(e) => updateExample(idx, e.target.value)}
                  placeholder={`Library lib = new Library();\nlib.addBook(new Book("1984"));\nlib.listTitles(); // Returns ["1984"]`}
                  className="flex-1 font-mono text-sm min-h-[60px]"
                />
                {formData.examples.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeExample(idx)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addExample}>
              <Plus className="h-4 w-4 mr-1" />
              Add Example
            </Button>
          </div>
        </div>

        {/* Concepts Tested */}
        <div className="space-y-2">
          <Label>Concepts Tested</Label>
          <div className="flex gap-2">
            <Input
              value={newConcept}
              onChange={(e) => setNewConcept(e.target.value)}
              placeholder="e.g., composition"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addConcept())}
            />
            <Button variant="outline" onClick={addConcept}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {formData.conceptsTested.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.conceptsTested.map(concept => (
                <Badge key={concept} variant="secondary" className="flex items-center gap-1">
                  {concept}
                  <button onClick={() => removeConcept(concept)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="e.g., OOP"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            />
            <Button variant="outline" onClick={addTag}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.tags.map(tag => (
                <Badge key={tag} variant="outline" className="flex items-center gap-1">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <Button onClick={handleSaveToBank} disabled={!isValid || isSaving} className="flex-1">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save to Question Bank
              </>
            )}
          </Button>
          {onSend && (
            <Button onClick={handleSendNow} disabled={!isValid} variant="secondary" className="flex-1">
              <Send className="h-4 w-4 mr-2" />
              Send Now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
