import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileText, X, Sparkles, Loader2, Send, Plus, Wand2, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StudioQuestionCard, StudioQuestion } from "./StudioQuestionCard";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  parsedContent?: string;
  parsing: boolean;
}

interface LectureVideo {
  id: string;
  title: string;
}

interface TranscriptSegment {
  text: string;
  start: number;
  end?: number;
}

interface QuestionStudioProps {
  lectureId?: string;
}

export function QuestionStudio({ lectureId }: QuestionStudioProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [questions, setQuestions] = useState<StudioQuestion[]>([]);
  const [lectures, setLectures] = useState<LectureVideo[]>([]);
  const [selectedLectureId, setSelectedLectureId] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Lecture context for calibration mode
  const [lectureTitle, setLectureTitle] = useState<string>("");
  const [lectureTranscript, setLectureTranscript] = useState<TranscriptSegment[]>([]);
  const [isLoadingLecture, setIsLoadingLecture] = useState(false);

  // Fetch lecture data if lectureId is provided (calibration mode)
  useEffect(() => {
    if (!lectureId) return;
    
    const fetchLectureData = async () => {
      setIsLoadingLecture(true);
      try {
        // Fetch lecture details and existing pause points
        const [lectureResult, pausePointsResult] = await Promise.all([
          supabase
            .from("lecture_videos")
            .select("id, title, transcript, duration_seconds")
            .eq("id", lectureId)
            .single(),
          supabase
            .from("lecture_pause_points")
            .select("*")
            .eq("lecture_video_id", lectureId)
            .order("pause_timestamp", { ascending: true })
        ]);

        if (lectureResult.error) throw lectureResult.error;
        
        const lecture = lectureResult.data;
        setLectureTitle(lecture.title);
        
        // Parse transcript
        const transcript = Array.isArray(lecture.transcript) 
          ? (lecture.transcript as unknown as TranscriptSegment[])
          : [];
        setLectureTranscript(transcript);
        
        // Convert existing pause points to studio questions
        if (pausePointsResult.data && pausePointsResult.data.length > 0) {
          const existingQuestions: StudioQuestion[] = pausePointsResult.data.map((pp, idx) => {
            const content = pp.question_content as any;
            return {
              id: pp.id,
              question_text: content?.question || "",
              question_type: pp.question_type === "short_answer" ? "short_answer" : "multiple_choice",
              options: content?.options || [],
              correct_answer: content?.correctAnswer || "",
              explanation: content?.explanation || "",
              status: "pending" as const,
              timestamp: pp.pause_timestamp,
            };
          });
          setQuestions(existingQuestions);
        }
      } catch (err: any) {
        console.error("Error fetching lecture:", err);
        toast.error("Failed to load lecture data");
      } finally {
        setIsLoadingLecture(false);
      }
    };
    
    fetchLectureData();
  }, [lectureId]);

  // Fetch lectures on mount (for assignment dropdown)
  useEffect(() => {
    const fetchLectures = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("lecture_videos")
        .select("id, title")
        .eq("instructor_id", user.id)
        .eq("status", "ready")
        .order("created_at", { ascending: false });

      if (data) setLectures(data);
    };
    fetchLectures();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processFiles = async (files: File[]) => {
    const validTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    for (const file of files) {
      if (!validTypes.includes(file.type) && !file.name.endsWith('.txt')) {
        toast.error(`${file.name}: Only PDF, DOCX, and TXT files are supported`);
        continue;
      }
      if (file.size > maxSize) {
        toast.error(`${file.name}: File exceeds 10MB limit`);
        continue;
      }

      const fileId = crypto.randomUUID();
      const newFile: UploadedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        parsing: true,
      };
      
      setUploadedFiles(prev => [...prev, newFile]);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const filePath = `studio/${session.user.id}/${fileId}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("lecture-materials")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data, error } = await supabase.functions.invoke("parse-lecture-material", {
          body: { filePath },
        });

        if (error) throw error;

        setUploadedFiles(prev => 
          prev.map(f => f.id === fileId 
            ? { ...f, parsedContent: data?.text || "", parsing: false }
            : f
          )
        );
        toast.success(`${file.name} processed successfully`);
      } catch (err: any) {
        console.error("File parse error:", err);
        toast.error(`Failed to process ${file.name}`);
        setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
      }
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Get transcript text up to a specific timestamp
  const getTranscriptUpToTimestamp = (timestamp: number): string => {
    return lectureTranscript
      .filter(segment => segment.start <= timestamp)
      .map(s => s.text)
      .join(" ");
  };

  // Transform existing questions with new style (calibration mode)
  const handleTransform = async () => {
    if (!prompt.trim()) {
      toast.error("Please describe how you want to transform the questions");
      return;
    }

    if (questions.length === 0) {
      toast.error("No questions to transform");
      return;
    }

    setIsTransforming(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("question_difficulty_preference, professor_type, question_format_preference")
        .eq("id", session.user.id)
        .single();

      // Prepare questions with their transcript context
      const questionsWithContext = questions.map(q => ({
        ...q,
        transcriptContext: q.timestamp ? getTranscriptUpToTimestamp(q.timestamp) : "",
      }));

      const { data, error } = await supabase.functions.invoke("generate-studio-questions", {
        body: {
          mode: "transform",
          prompt: prompt.trim(),
          existingQuestions: questionsWithContext,
          lectureTranscript: lectureTranscript.map(s => s.text).join(" "),
          instructorPreferences: {
            difficulty: profile?.question_difficulty_preference || "medium",
            professorType: profile?.professor_type || "stem",
            questionFormat: profile?.question_format_preference || "multiple_choice",
          },
        },
      });

      if (error) throw error;

      if (data?.questions) {
        const transformedQuestions: StudioQuestion[] = data.questions.map((q: any, idx: number) => ({
          id: questions[idx]?.id || `studio-${Date.now()}-${idx}`,
          question_text: q.question_text,
          question_type: q.question_type || "multiple_choice",
          options: q.options || [],
          correct_answer: q.correct_answer,
          explanation: q.explanation || "",
          status: "pending" as const,
          timestamp: questions[idx]?.timestamp,
        }));
        setQuestions(transformedQuestions);
        toast.success(`Transformed ${transformedQuestions.length} questions`);
      }
    } catch (err: any) {
      console.error("Transform error:", err);
      toast.error(err.message || "Failed to transform questions");
    } finally {
      setIsTransforming(false);
    }
  };

  // Generate new questions (standalone mode)
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter instructions for question generation");
      return;
    }

    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("question_difficulty_preference, professor_type, question_format_preference")
        .eq("id", session.user.id)
        .single();

      const parsedMaterials = uploadedFiles
        .filter(f => f.parsedContent)
        .map(f => ({ filename: f.name, content: f.parsedContent || "" }));

      const { data, error } = await supabase.functions.invoke("generate-studio-questions", {
        body: {
          prompt: prompt.trim(),
          parsedMaterials,
          instructorPreferences: {
            difficulty: profile?.question_difficulty_preference || "medium",
            professorType: profile?.professor_type || "stem",
            questionFormat: profile?.question_format_preference || "multiple_choice",
          },
        },
      });

      if (error) throw error;

      if (data?.questions) {
        const newQuestions: StudioQuestion[] = data.questions.map((q: any, idx: number) => ({
          id: `studio-${Date.now()}-${idx}`,
          question_text: q.question_text,
          question_type: q.question_type || "multiple_choice",
          options: q.options || [],
          correct_answer: q.correct_answer,
          explanation: q.explanation || "",
          status: "pending" as const,
        }));
        setQuestions(prev => [...prev, ...newQuestions]);
        toast.success(`Generated ${newQuestions.length} questions`);
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      toast.error(err.message || "Failed to generate questions");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async (questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    setQuestions(prev => prev.map(q => 
      q.id === questionId ? { ...q, status: "regenerating" as const } : q
    ));

    try {
      const transcriptContext = question.timestamp 
        ? getTranscriptUpToTimestamp(question.timestamp) 
        : "";

      const { data, error } = await supabase.functions.invoke("generate-studio-questions", {
        body: {
          mode: lectureId ? "transform" : "generate",
          prompt: `Regenerate this question with similar content but different phrasing: "${question.question_text}"`,
          existingQuestions: [{ ...question, transcriptContext }],
          lectureTranscript: lectureTranscript.map(s => s.text).join(" "),
          count: 1,
        },
      });

      if (error) throw error;

      if (data?.questions?.[0]) {
        const newQ = data.questions[0];
        setQuestions(prev => prev.map(q => 
          q.id === questionId ? {
            ...q,
            question_text: newQ.question_text,
            options: newQ.options || q.options,
            correct_answer: newQ.correct_answer,
            explanation: newQ.explanation || "",
            status: "pending" as const,
          } : q
        ));
        toast.success("Question regenerated");
      }
    } catch (err: any) {
      console.error("Regenerate error:", err);
      toast.error("Failed to regenerate question");
      setQuestions(prev => prev.map(q => 
        q.id === questionId ? { ...q, status: "pending" as const } : q
      ));
    }
  };

  const handleApprove = (questionId: string) => {
    setQuestions(prev => prev.map(q => 
      q.id === questionId ? { ...q, status: "approved" as const } : q
    ));
  };

  const handleEdit = (questionId: string, updates: Partial<StudioQuestion>) => {
    setQuestions(prev => prev.map(q => 
      q.id === questionId ? { ...q, ...updates, status: "edited" as const } : q
    ));
  };

  const handleDelete = (questionId: string) => {
    setQuestions(prev => prev.filter(q => q.id !== questionId));
  };

  const approvedQuestions = questions.filter(q => q.status === "approved" || q.status === "edited");

  const handleAssignToLecture = async () => {
    const targetLectureId = lectureId || selectedLectureId;
    
    if (!targetLectureId) {
      toast.error("Please select a lecture");
      return;
    }

    if (approvedQuestions.length === 0) {
      toast.error("No approved questions to assign");
      return;
    }

    try {
      const { data: lecture } = await supabase
        .from("lecture_videos")
        .select("duration_seconds")
        .eq("id", targetLectureId)
        .single();

      const duration = lecture?.duration_seconds || 600;
      const minTimestamp = Math.max(60, duration * 0.1);
      const maxTimestamp = duration - 30;
      const availableRange = maxTimestamp - minTimestamp;
      const interval = availableRange / (approvedQuestions.length + 1);

      // Delete existing pause points for this lecture
      await supabase
        .from("lecture_pause_points")
        .delete()
        .eq("lecture_video_id", targetLectureId);

      // Insert new pause points
      const pausePoints = approvedQuestions.map((q, idx) => ({
        lecture_video_id: targetLectureId,
        pause_timestamp: q.timestamp || Math.floor(minTimestamp + interval * (idx + 1)),
        order_index: idx,
        question_type: q.question_type,
        question_content: {
          question: q.question_text,
          options: q.options,
          correctAnswer: q.correct_answer,
          explanation: q.explanation,
        },
        reason: "Studio calibrated",
      }));

      const { error } = await supabase
        .from("lecture_pause_points")
        .insert(pausePoints);

      if (error) throw error;

      await supabase
        .from("lecture_videos")
        .update({ question_count: approvedQuestions.length })
        .eq("id", targetLectureId);

      toast.success(`Assigned ${approvedQuestions.length} questions to lecture`);
      
      setQuestions(prev => prev.filter(q => q.status !== "approved" && q.status !== "edited"));
      setSelectedLectureId("");
    } catch (err: any) {
      console.error("Assign error:", err);
      toast.error("Failed to assign questions to lecture");
    }
  };

  // Format timestamp for display
  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Calibration mode UI
  if (lectureId) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Calibrate Questions
          </CardTitle>
          <CardDescription>
            {lectureTitle ? (
              <span className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                {lectureTitle}
              </span>
            ) : (
              "Transform auto-generated questions to match your teaching style"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingLecture ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading lecture questions...</span>
            </div>
          ) : (
            <>
              {/* Transform Instructions */}
              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Wand2 className="h-4 w-4" />
                  How should questions be transformed?
                </label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., Make these USMLE Step 1 style clinical vignettes, or Convert to Socratic questions that test deeper understanding..."
                  className="min-h-[80px]"
                />
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Examples:</span>
                  <button
                    className="hover:text-primary underline"
                    onClick={() => setPrompt("Transform into USMLE Step 1 style clinical vignettes with patient presentations")}
                  >
                    USMLE vignettes
                  </button>
                  <span>•</span>
                  <button
                    className="hover:text-primary underline"
                    onClick={() => setPrompt("Make questions more challenging with deeper conceptual reasoning required")}
                  >
                    Harder
                  </button>
                  <span>•</span>
                  <button
                    className="hover:text-primary underline"
                    onClick={() => setPrompt("Convert to short answer questions that test understanding not just recall")}
                  >
                    Short answer
                  </button>
                </div>
                <Button
                  onClick={handleTransform}
                  disabled={isTransforming || !prompt.trim() || questions.length === 0}
                  className="w-full"
                >
                  {isTransforming ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Transforming...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Transform {questions.length} Questions
                    </>
                  )}
                </Button>
              </div>

              {/* Questions List */}
              {questions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      Questions ({questions.length})
                    </label>
                    <Badge variant="outline">
                      {approvedQuestions.length} approved
                    </Badge>
                  </div>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {questions.map((question, idx) => (
                        <div key={question.id} className="relative">
                          {question.timestamp && (
                            <Badge variant="secondary" className="absolute -top-2 -left-2 text-xs z-10">
                              {formatTimestamp(question.timestamp)}
                            </Badge>
                          )}
                          <StudioQuestionCard
                            question={question}
                            index={idx + 1}
                            onApprove={() => handleApprove(question.id)}
                            onEdit={(updates) => handleEdit(question.id, updates)}
                            onRegenerate={() => handleRegenerate(question.id)}
                            onDelete={() => handleDelete(question.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Save to Lecture */}
                  {approvedQuestions.length > 0 && (
                    <div className="pt-4 border-t">
                      <Button onClick={handleAssignToLecture} className="w-full">
                        Save {approvedQuestions.length} Calibrated Questions
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // Standalone mode UI (original behavior)
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Question Studio
        </CardTitle>
        <CardDescription>
          Upload materials and use natural language to generate custom questions for your lectures
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Section 1: Context Materials Upload */}
        <div className="space-y-3">
          <label className="text-sm font-medium flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Context Materials
          </label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center transition-colors
              ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag & drop PDFs, DOCX, or TXT files here
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="h-4 w-4 mr-1" />
              Browse Files
            </Button>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map(file => (
                <Badge
                  key={file.id}
                  variant="secondary"
                  className="flex items-center gap-2 py-1.5 px-3"
                >
                  <FileText className="h-3 w-3" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  {file.parsing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <button
                      onClick={() => removeFile(file.id)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Natural Language Prompt */}
        <div className="space-y-3">
          <label className="text-sm font-medium flex items-center gap-2">
            <Send className="h-4 w-4" />
            Instructions
          </label>
          <div className="flex gap-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Create 5 USMLE-style clinical vignettes about diabetes management based on the uploaded PDF..."
              className="min-h-[80px] flex-1"
            />
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Examples:</span>
            <button
              className="hover:text-primary underline"
              onClick={() => setPrompt("Create 5 complex MCQs focusing on clinical diagnosis")}
            >
              Clinical MCQs
            </button>
            <span>•</span>
            <button
              className="hover:text-primary underline"
              onClick={() => setPrompt("Generate 3 short answer questions about key concepts")}
            >
              Short answer
            </button>
            <span>•</span>
            <button
              className="hover:text-primary underline"
              onClick={() => setPrompt("Create 5 recall-level questions for exam prep")}
            >
              Exam prep
            </button>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Questions
              </>
            )}
          </Button>
        </div>

        {/* Section 3: Generated Questions Queue */}
        {questions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Generated Questions ({questions.length})
              </label>
              <Badge variant="outline">
                {approvedQuestions.length} approved
              </Badge>
            </div>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {questions.map((question, idx) => (
                  <StudioQuestionCard
                    key={question.id}
                    question={question}
                    index={idx + 1}
                    onApprove={() => handleApprove(question.id)}
                    onEdit={(updates) => handleEdit(question.id, updates)}
                    onRegenerate={() => handleRegenerate(question.id)}
                    onDelete={() => handleDelete(question.id)}
                  />
                ))}
              </div>
            </ScrollArea>

            {/* Assign to Lecture */}
            {approvedQuestions.length > 0 && (
              <div className="flex gap-2 pt-4 border-t">
                <Select value={selectedLectureId} onValueChange={setSelectedLectureId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a lecture to assign questions" />
                  </SelectTrigger>
                  <SelectContent>
                    {lectures.map(lecture => (
                      <SelectItem key={lecture.id} value={lecture.id}>
                        {lecture.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAssignToLecture} disabled={!selectedLectureId}>
                  Assign {approvedQuestions.length} Questions
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
