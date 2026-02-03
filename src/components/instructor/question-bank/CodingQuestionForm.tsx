import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { CodeEditor } from "@/components/ui/code-editor";
import { CodingQuestionContent, CodingExample, TestCase } from "./types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface CodingQuestionFormProps {
  content: CodingQuestionContent;
  onChange: (content: CodingQuestionContent) => void;
  isSimple?: boolean;
}

const languages = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
];

export function CodingQuestionForm({ content, onChange, isSimple = false }: CodingQuestionFormProps) {
  const [expandedSections, setExpandedSections] = useState({
    examples: true,
    constraints: false,
    hints: false,
    testCases: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateContent = (updates: Partial<CodingQuestionContent>) => {
    onChange({ ...content, ...updates });
  };

  const addExample = () => {
    updateContent({
      examples: [...content.examples, { input: "", output: "", explanation: "" }],
    });
  };

  const updateExample = (index: number, updates: Partial<CodingExample>) => {
    const newExamples = [...content.examples];
    newExamples[index] = { ...newExamples[index], ...updates };
    updateContent({ examples: newExamples });
  };

  const removeExample = (index: number) => {
    updateContent({ examples: content.examples.filter((_, i) => i !== index) });
  };

  const addConstraint = () => {
    updateContent({ constraints: [...content.constraints, ""] });
  };

  const updateConstraint = (index: number, value: string) => {
    const newConstraints = [...content.constraints];
    newConstraints[index] = value;
    updateContent({ constraints: newConstraints });
  };

  const removeConstraint = (index: number) => {
    updateContent({ constraints: content.constraints.filter((_, i) => i !== index) });
  };

  const addHint = () => {
    updateContent({ hints: [...content.hints, ""] });
  };

  const updateHint = (index: number, value: string) => {
    const newHints = [...content.hints];
    newHints[index] = value;
    updateContent({ hints: newHints });
  };

  const removeHint = (index: number) => {
    updateContent({ hints: content.hints.filter((_, i) => i !== index) });
  };

  const addTestCase = () => {
    updateContent({
      testCases: [...content.testCases, { input: [], expected: null }],
    });
  };

  const updateTestCase = (index: number, updates: Partial<TestCase>) => {
    const newTestCases = [...content.testCases];
    newTestCases[index] = { ...newTestCases[index], ...updates };
    updateContent({ testCases: newTestCases });
  };

  const removeTestCase = (index: number) => {
    updateContent({ testCases: content.testCases.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      {/* Language Selector */}
      <div className="flex gap-4">
        <div className="w-48">
          <Label>Language</Label>
          <Select value={content.language} onValueChange={(v) => updateContent({ language: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map(lang => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <Label>Function Signature (optional)</Label>
          <Input
            value={content.functionSignature || ""}
            onChange={(e) => updateContent({ functionSignature: e.target.value })}
            placeholder="e.g., def twoSum(nums: List[int], target: int) -> List[int]:"
            className="font-mono text-sm"
          />
        </div>
      </div>

      {/* Problem Statement */}
      <div>
        <Label>Problem Statement</Label>
        <Textarea
          value={content.question}
          onChange={(e) => updateContent({ question: e.target.value })}
          placeholder="Describe the problem clearly. Include what the function should do, what inputs it receives, and what it should return."
          rows={5}
        />
      </div>

      {/* Examples Section */}
      <Collapsible open={expandedSections.examples} onOpenChange={() => toggleSection("examples")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Examples ({content.examples.length})</CardTitle>
                {expandedSections.examples ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              {content.examples.map((example, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Example {idx + 1}</span>
                    {content.examples.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeExample(idx)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Input</Label>
                      <Input
                        value={example.input}
                        onChange={(e) => updateExample(idx, { input: e.target.value })}
                        placeholder="nums = [2,7,11,15], target = 9"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Output</Label>
                      <Input
                        value={example.output}
                        onChange={(e) => updateExample(idx, { output: e.target.value })}
                        placeholder="[0, 1]"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Explanation (optional)</Label>
                    <Input
                      value={example.explanation || ""}
                      onChange={(e) => updateExample(idx, { explanation: e.target.value })}
                      placeholder="Because nums[0] + nums[1] == 9, we return [0, 1]"
                    />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addExample} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Example
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Constraints Section */}
      <Collapsible open={expandedSections.constraints} onOpenChange={() => toggleSection("constraints")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Constraints ({content.constraints.length})</CardTitle>
                {expandedSections.constraints ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-2 pt-0">
              {content.constraints.map((constraint, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-muted-foreground">•</span>
                  <Input
                    value={constraint}
                    onChange={(e) => updateConstraint(idx, e.target.value)}
                    placeholder="e.g., 2 <= nums.length <= 10^4"
                    className="font-mono text-sm"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeConstraint(idx)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addConstraint}>
                <Plus className="h-4 w-4 mr-2" />
                Add Constraint
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Starter Code */}
      <div>
        <Label>Starter Code</Label>
        <p className="text-xs text-muted-foreground mb-2">
          The initial code students see when they start the problem
        </p>
        <CodeEditor
          value={content.starterCode}
          onChange={(value) => updateContent({ starterCode: value })}
          language={content.language}
          height="200px"
        />
      </div>

      {/* Hints Section */}
      <Collapsible open={expandedSections.hints} onOpenChange={() => toggleSection("hints")}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Hints ({content.hints.length})
                </CardTitle>
                {expandedSections.hints ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-2 pt-0">
              {content.hints.map((hint, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">{idx + 1}.</span>
                  <Input
                    value={hint}
                    onChange={(e) => updateHint(idx, e.target.value)}
                    placeholder="Add a helpful hint..."
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeHint(idx)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addHint}>
                <Plus className="h-4 w-4 mr-2" />
                Add Hint
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Test Cases Section (Advanced) */}
      {!isSimple && (
        <Collapsible open={expandedSections.testCases} onOpenChange={() => toggleSection("testCases")}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Test Cases ({content.testCases.length})</CardTitle>
                  {expandedSections.testCases ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <p className="text-xs text-muted-foreground">
                  Define test cases for automated grading (JSON format)
                </p>
                {content.testCases.map((testCase, idx) => (
                  <div key={idx} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Test Case {idx + 1}</span>
                      {content.testCases.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeTestCase(idx)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Input (JSON array)</Label>
                        <Input
                          value={JSON.stringify(testCase.input)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              updateTestCase(idx, { input: parsed });
                            } catch {
                              // Allow invalid JSON while typing
                            }
                          }}
                          placeholder='[[2,7,11,15], 9]'
                          className="font-mono text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Expected Output (JSON)</Label>
                        <Input
                          value={JSON.stringify(testCase.expected)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              updateTestCase(idx, { expected: parsed });
                            } catch {
                              // Allow invalid JSON while typing
                            }
                          }}
                          placeholder='[0, 1]'
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addTestCase}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Test Case
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
