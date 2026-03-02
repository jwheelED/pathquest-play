import { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Video,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Brain,
  Play,
  ChevronDown,
  Settings2,
  X,
  Sparkles,
  Link,
} from "lucide-react";
import { QuestionStudioDialog } from "./QuestionStudioDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  PausePointEditor,
  PausePoint,
  calculateRecommendedPausePoints,
  generateAutoPausePoints,
} from "./PausePointEditor";

interface PreRecordedLectureUploadProps {
  onUploadComplete?: (lectureId: string) => void;
}

type UploadMode = "file" | "url";

export const PreRecordedLectureUpload = ({ onUploadComplete }: PreRecordedLectureUploadProps) => {
  const [uploadMode, setUploadMode] = useState<UploadMode>("file");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");

  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "transcribing" | "analyzing" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [professorType, setProfessorType] = useState<string | null>(null);
  const [examStyle, setExamStyle] = useState("usmle_step1");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [createdLectureId, setCreatedLectureId] = useState<string | null>(null);

  // New state for pause point configuration
  const [estimatedDuration, setEstimatedDuration] = useState<number>(600); // Default 10 min
  const [flowLevel, setFlowLevel] = useState(3); // 1-5 scale
  const [highYieldOnly, setHighYieldOnly] = useState(true); // Default to high-yield for smarter questions
  const [pausePoints, setPausePoints] = useState<PausePoint[]>([]);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // Calculate recommended count based on duration and flow level
  const recommendedCount = useMemo(() => {
    return calculateRecommendedPausePoints(estimatedDuration, flowLevel);
  }, [estimatedDuration, flowLevel]);

  // Actual question count to use (filtered by high-yield if enabled)
  const effectiveQuestionCount = useMemo(() => {
    if (highYieldOnly && pausePoints.length > 0) {
      return pausePoints.filter((p) => p.isHighYield).length;
    }
    return pausePoints.length || recommendedCount;
  }, [pausePoints, highYieldOnly, recommendedCount]);

  // Fetch professor type on mount
  useEffect(() => {
    const fetchProfessorType = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("professor_type").eq("id", user.id).single();
        setProfessorType(profile?.professor_type || null);
      }
    };
    fetchProfessorType();
  }, []);

  // Detect video duration from file
  const detectVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(Math.floor(video.duration));
      };
      video.onerror = () => {
        resolve(600); // Default 10 min if detection fails
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.type.startsWith("video/")) {
        toast.error("Please select a video file");
        return;
      }
      // Check file size (500MB limit)
      if (file.size > 500 * 1024 * 1024) {
        toast.error("File size must be less than 500MB");
        return;
      }
      setSelectedFile(file);
      setStatus("idle");
      setErrorMessage("");

      // Detect duration and generate initial pause points
      const duration = await detectVideoDuration(file);
      setEstimatedDuration(duration);
      const count = calculateRecommendedPausePoints(duration, flowLevel);
      setPausePoints(generateAutoPausePoints(duration, count));
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === "idle") setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (status !== "idle") return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.type.startsWith("video/")) {
        toast.error("Please drop a video file");
        return;
      }
      if (file.size > 500 * 1024 * 1024) {
        toast.error("File size must be less than 500MB");
        return;
      }
      setSelectedFile(file);
      setStatus("idle");
      setErrorMessage("");

      const duration = await detectVideoDuration(file);
      setEstimatedDuration(duration);
      const count = calculateRecommendedPausePoints(duration, flowLevel);
      setPausePoints(generateAutoPausePoints(duration, count));
    }
  };

  const isValidVideoUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      // Accept YouTube, Vimeo, Kaltura, or direct video links
      const validHosts = ["youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"];
      const isKnownHost = validHosts.some((host) => parsed.hostname.includes(host));
      const isKaltura =
        /kaltura\.com|mediaspace\./i.test(parsed.hostname) || /\/media\/[^/]+\/[01]_/.test(parsed.pathname);
      const isDirectVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(parsed.pathname);
      return isKnownHost || isKaltura || isDirectVideo || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a video file");
      return;
    }
    if (!title.trim()) {
      toast.error("Please provide a title");
      return;
    }

    try {
      setStatus("uploading");
      setUploadProgress(0);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let filePath = "";

      // Upload video to storage
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      filePath = `${user.id}/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const { error: uploadError } = await supabase.storage.from("lecture-videos").upload(filePath, selectedFile);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Create lecture video record (question_count set later by AI in smart mode)
      const { data: lectureVideo, error: insertError } = await supabase
        .from("lecture_videos")
        .insert([
          {
            title: title.trim(),
            description: description.trim() || null,
            video_path: filePath,
            video_url: null,
            question_count: highYieldOnly ? null : effectiveQuestionCount,
            status: "processing",
            instructor_id: user.id,
          },
        ])
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create lecture: ${insertError.message}`);
      }

      setStatus("transcribing");

      // Start transcription
      const { error: transcribeError } = await supabase.functions.invoke("transcribe-video", {
        body: {
          lectureVideoId: lectureVideo.id,
          videoPath: filePath,
        },
      });

      if (transcribeError) {
        throw new Error(`Transcription failed: ${transcribeError.message}`);
      }

      setStatus("analyzing");

      // Poll for status updates with timeout
      let pollAttempts = 0;
      const MAX_POLL_ATTEMPTS = 24; // ~2 minutes

      const pollStatus = async () => {
        pollAttempts++;
        if (pollAttempts > MAX_POLL_ATTEMPTS) {
          setStatus("error");
          setErrorMessage("Processing timed out. Please try again.");
          return;
        }

        const { data: updated } = await supabase
          .from("lecture_videos")
          .select("status, transcript, error_message, duration_seconds")
          .eq("id", lectureVideo.id)
          .single();

        if (updated?.status === "analyzing" && updated.transcript) {
          // Update duration from backend if available
          if (updated.duration_seconds) {
            setEstimatedDuration(updated.duration_seconds);
          }

          // Check for placeholder transcript
          const transcriptText =
            typeof updated.transcript === "object" && updated.transcript !== null
              ? ((updated.transcript as Record<string, unknown>).text as string) || ""
              : String(updated.transcript);

          if (transcriptText.startsWith("[Transcript unavailable")) {
            toast.warning("Captions not available for this video. AI will generate general comprehension questions.");
          }

          // Get user profile for professor type
          const { data: profile } = await supabase.from("profiles").select("professor_type").eq("id", user.id).single();

          // Trigger cognitive load analysis
          await supabase.functions.invoke("analyze-lecture-cognitive-load", {
            body: {
              lectureVideoId: lectureVideo.id,
              transcript: transcriptText,
              smartMode: highYieldOnly,
              questionCount: highYieldOnly ? undefined : effectiveQuestionCount,
              professorType: professorType || "stem",
              examStyle: professorType === "medical" ? examStyle : undefined,
            },
          });

          // Poll again for final status
          setTimeout(async () => {
            const { data: final } = await supabase
              .from("lecture_videos")
              .select("status, error_message, duration_seconds")
              .eq("id", lectureVideo.id)
              .single();

            if (final?.duration_seconds) {
              setEstimatedDuration(final.duration_seconds);
            }

            if (final?.status === "ready") {
              setStatus("ready");
              setCreatedLectureId(lectureVideo.id);
              toast.success("Lecture processed successfully!");
              onUploadComplete?.(lectureVideo.id);
            } else if (final?.status === "error") {
              setStatus("error");
              setErrorMessage(final.error_message || "Processing failed");
            } else {
              setTimeout(pollStatus, 5000);
            }
          }, 5000);
        } else if (updated?.status === "ready") {
          if (updated.duration_seconds) {
            setEstimatedDuration(updated.duration_seconds);
          }
          setStatus("ready");
          setCreatedLectureId(lectureVideo.id);

          // Check if questions were generated
          const { data: questionCount } = await supabase
            .from("lecture_pause_points")
            .select("id", { count: "exact", head: true })
            .eq("lecture_video_id", lectureVideo.id);

          const count = questionCount?.length ?? 0;
          if (count === 0) {
            toast.warning(
              "Video processed but no questions were generated. Captions may not be available for this video. Try uploading a video file instead for best results.",
            );
          } else {
            toast.success(`Lecture processed with ${count} questions!`);
          }
          onUploadComplete?.(lectureVideo.id);
        } else if (updated?.status === "error") {
          setStatus("error");
          setErrorMessage(updated.error_message || "Processing failed");
        } else {
          setTimeout(pollStatus, 5000);
        }
      };

      setTimeout(pollStatus, 5000);
    } catch (error: any) {
      console.error("Upload error:", error);
      setStatus("error");
      setErrorMessage(error.message);
      toast.error(error.message);
    }
  };

  const handleUrlUpload = async () => {
    if (!videoUrl.trim() || !isValidVideoUrl(videoUrl.trim())) {
      toast.error("Please enter a valid URL");
      return;
    }
    if (!title.trim()) {
      toast.error("Please provide a title");
      return;
    }

    try {
      setStatus("uploading");
      setUploadProgress(50);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const externalPath = `external-${Date.now()}`;
      setUploadProgress(100);

      // Create lecture video record with URL
      const { data: lectureVideo, error: insertError } = await supabase
        .from("lecture_videos")
        .insert([
          {
            title: title.trim(),
            description: description.trim() || null,
            video_path: externalPath,
            video_url: videoUrl.trim(),
            question_count: highYieldOnly ? null : effectiveQuestionCount,
            status: "processing",
            instructor_id: user.id,
          },
        ])
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create lecture: ${insertError.message}`);
      }

      setStatus("transcribing");

      // Start transcription — the edge function detects external- prefix and fetches YouTube captions
      const { error: transcribeError } = await supabase.functions.invoke("transcribe-video", {
        body: {
          lectureVideoId: lectureVideo.id,
          videoPath: externalPath,
        },
      });

      if (transcribeError) {
        throw new Error(`Transcription failed: ${transcribeError.message}`);
      }

      setStatus("analyzing");

      // Reuse the same polling logic as file upload
      let pollAttempts = 0;
      const MAX_POLL_ATTEMPTS = 24;

      const pollStatus = async () => {
        pollAttempts++;
        if (pollAttempts > MAX_POLL_ATTEMPTS) {
          setStatus("error");
          setErrorMessage("Processing timed out. Please try again.");
          return;
        }

        const { data: updated } = await supabase
          .from("lecture_videos")
          .select("status, transcript, error_message, duration_seconds")
          .eq("id", lectureVideo.id)
          .single();

        if (updated?.status === "analyzing" && updated.transcript) {
          if (updated.duration_seconds) {
            setEstimatedDuration(updated.duration_seconds);
          }

          const transcriptText =
            typeof updated.transcript === "object" && updated.transcript !== null
              ? ((updated.transcript as Record<string, unknown>).text as string) || ""
              : String(updated.transcript);

          if (transcriptText.startsWith("[Transcript unavailable")) {
            toast.warning("Captions not available for this video. AI will generate general comprehension questions.");
          }

          const { data: profile } = await supabase.from("profiles").select("professor_type").eq("id", user.id).single();

          await supabase.functions.invoke("analyze-lecture-cognitive-load", {
            body: {
              lectureVideoId: lectureVideo.id,
              transcript: transcriptText,
              smartMode: highYieldOnly,
              questionCount: highYieldOnly ? undefined : effectiveQuestionCount,
              professorType: professorType || "stem",
              examStyle: professorType === "medical" ? examStyle : undefined,
            },
          });

          setTimeout(async () => {
            const { data: final } = await supabase
              .from("lecture_videos")
              .select("status, error_message, duration_seconds")
              .eq("id", lectureVideo.id)
              .single();

            if (final?.duration_seconds) {
              setEstimatedDuration(final.duration_seconds);
            }

            if (final?.status === "ready") {
              setStatus("ready");
              setCreatedLectureId(lectureVideo.id);
              toast.success("Lecture processed successfully!");
              onUploadComplete?.(lectureVideo.id);
            } else if (final?.status === "error") {
              setStatus("error");
              setErrorMessage(final.error_message || "Processing failed");
            } else {
              setTimeout(pollStatus, 5000);
            }
          }, 5000);
        } else if (updated?.status === "ready") {
          if (updated.duration_seconds) {
            setEstimatedDuration(updated.duration_seconds);
          }
          setStatus("ready");
          setCreatedLectureId(lectureVideo.id);

          const { data: questionCount } = await supabase
            .from("lecture_pause_points")
            .select("id", { count: "exact", head: true })
            .eq("lecture_video_id", lectureVideo.id);

          const count = questionCount?.length ?? 0;
          if (count === 0) {
            toast.warning(
              "Video processed but no questions were generated. Captions may not be available for this video.",
            );
          } else {
            toast.success(`Lecture processed with ${count} questions!`);
          }
          onUploadComplete?.(lectureVideo.id);
        } else if (updated?.status === "error") {
          setStatus("error");
          setErrorMessage(updated.error_message || "Processing failed");
        } else {
          setTimeout(pollStatus, 5000);
        }
      };

      setTimeout(pollStatus, 5000);
    } catch (error: any) {
      console.error("URL upload error:", error);
      setStatus("error");
      setErrorMessage(error.message);
      toast.error(error.message);
    }
  };

  const getStatusDisplay = () => {
    switch (status) {
      case "uploading":
        return { icon: <Loader2 className="h-5 w-5 animate-spin" />, text: "Uploading video...", color: "bg-blue-500" };
      case "transcribing":
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin" />,
          text: "Transcribing audio...",
          color: "bg-amber-500",
        };
      case "analyzing":
        return {
          icon: <Brain className="h-5 w-5 animate-pulse" />,
          text: highYieldOnly ? "AI analyzing for optimal question placement..." : "Analyzing cognitive load...",
          color: "bg-purple-500",
        };
      case "ready":
        return { icon: <CheckCircle2 className="h-5 w-5" />, text: "Ready for students!", color: "bg-emerald-500" };
      case "error":
        return { icon: <AlertCircle className="h-5 w-5" />, text: "Error occurred", color: "bg-red-500" };
      default:
        return null;
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <Card className="border-primary/20 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          Upload Pre-Recorded Lecture
        </CardTitle>
        <CardDescription>
          Upload a video file or paste a URL link — AI will analyze it to insert questions at optimal learning moments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode Toggle */}
        <Tabs
          value={uploadMode}
          onValueChange={(v) => {
            setUploadMode(v as UploadMode);
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file" disabled={status !== "idle"}>
              <Upload className="h-4 w-4 mr-2" />
              Upload File
            </TabsTrigger>
            <TabsTrigger value="url" disabled={status !== "idle"}>
              <Link className="h-4 w-4 mr-2" />
              URL link
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Lecture Title *</Label>
          <Input
            id="title"
            placeholder="e.g., Introduction to Machine Learning"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={status !== "idle"}
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            placeholder="Brief description of the lecture content..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={status !== "idle"}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setHighYieldOnly(!highYieldOnly)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            disabled={status !== "idle"}
          >
            {highYieldOnly ? "Customize question timing →" : "← Use automatic timing"}
          </button>

          {!highYieldOnly && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Question frequency</span>
                <Badge variant="outline" className="text-xs">
                  {effectiveQuestionCount} questions
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Fewer</span>
                <Slider
                  value={[flowLevel]}
                  onValueChange={([val]) => {
                    setFlowLevel(val);
                    const count = calculateRecommendedPausePoints(estimatedDuration, val);
                    setPausePoints(generateAutoPausePoints(estimatedDuration, count));
                  }}
                  min={1}
                  max={5}
                  step={1}
                  disabled={status !== "idle"}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground">More</span>
              </div>
            </div>
          )}

          {/* Advanced pause point editor removed - AI determines optimal pause points during analysis */}

          <p className="text-xs text-muted-foreground">
            AI will place {effectiveQuestionCount} pause points at optimal learning moments
          </p>
        </div>

        {/* File Upload or URL Input */}
        {uploadMode === "file" ? (
          <div className="space-y-4">
            <Label>Video File *</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : selectedFile
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
              } ${status !== "idle" ? "pointer-events-none opacity-50" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
                disabled={status !== "idle"}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3 relative">
                  <Video className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setPausePoints([]);
                    }}
                    className="absolute top-0 right-0 p-1 rounded-full hover:bg-muted transition-colors"
                    disabled={status !== "idle"}
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Click to select or drag and drop</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="video-url">URL link *</Label>
            <Input
              id="video-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              disabled={status !== "idle"}
            />
            {videoUrl && !isValidVideoUrl(videoUrl) && (
              <p className="text-xs text-destructive">Please enter a valid URL link</p>
            )}
            <p className="text-xs text-muted-foreground">
              Paste a URL video link. AI will extract captions and generate questions automatically.
            </p>
          </div>
        )}

        {/* Progress/Status */}
        {status !== "idle" && statusDisplay && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge className={statusDisplay.color}>
                {statusDisplay.icon}
                <span className="ml-1">{statusDisplay.text}</span>
              </Badge>
              {/* Calibrate Questions - appears with animation when ready */}
              {status === "ready" && createdLectureId && (
                <QuestionStudioDialog
                  lectureId={createdLectureId}
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 animate-fade-in hover:scale-105 transition-transform"
                    >
                      <Sparkles className="h-3.5 w-3.5 animate-pulse text-amber-500" />
                      Calibrate Questions
                    </Button>
                  }
                />
              )}
            </div>
            {status === "uploading" && <Progress value={uploadProgress} className="h-2" />}
            {status === "error" && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={() => {
            if (status === "error") {
              setStatus("idle");
              setErrorMessage("");
              setUploadProgress(0);
              setCreatedLectureId(null);
            } else if (status === "ready" && createdLectureId) {
              window.open(`/instructor/preview/${createdLectureId}`, "_blank");
            } else if (uploadMode === "url") {
              handleUrlUpload();
            } else {
              handleUpload();
            }
          }}
          disabled={
            status === "error"
              ? false
              : status === "ready"
                ? false
                : (uploadMode === "file" ? !selectedFile : !videoUrl.trim() || !isValidVideoUrl(videoUrl.trim())) ||
                  !title.trim() ||
                  status !== "idle"
          }
          className="w-full"
          size="lg"
        >
          {status === "idle" ? (
            <>
              {uploadMode === "file" ? <Upload className="h-4 w-4 mr-2" /> : <Link className="h-4 w-4 mr-2" />}
              {uploadMode === "file" ? "Upload & Process Lecture" : "Add & Process Lecture"}
            </>
          ) : status === "error" ? (
            <>
              <AlertCircle className="h-4 w-4 mr-2" />
              Try Again
            </>
          ) : status === "ready" ? (
            <>
              <Play className="h-4 w-4 mr-2" />
              View Lecture
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
