import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Upload, Loader2, Sparkles, CheckCircle2, AlertTriangle, FileUp, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";

interface SlideUploadFlowProps {
  onComplete: (count: number) => void;
  onCancel: () => void;
}

type Stage = "upload" | "converting" | "rendering" | "analyzing" | "done" | "error";

export function SlideUploadFlow({ onComplete, onCancel }: SlideUploadFlowProps) {
  const { selectedCourseId } = useCourseContext();
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const [questionsGenerated, setQuestionsGenerated] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef(false);

  // Load PDF.js
  useEffect(() => {
    // @ts-ignore
    if (!window.pdfjsLib) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.async = true;
      document.body.appendChild(script);
      script.onload = () => {
        // @ts-ignore
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      };
    }
  }, []);

  const renderSlideToImage = useCallback(
    async (pdf: any, pageNum: number): Promise<string | null> => {
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current || document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL("image/jpeg", 0.7);
      } catch {
        return null;
      }
    },
    []
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const isPdf = selected.type === "application/pdf";
    const isPptx =
      selected.type.includes("presentation") || selected.type.includes("powerpoint");

    if (!isPdf && !isPptx) {
      toast.error("Please upload a PDF or PowerPoint file");
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      toast.error("File must be under 50 MB");
      return;
    }
    setFile(selected);
  };

  const handleUploadAndGenerate = async () => {
    if (!file) return;
    setUploading(true);
    abortRef.current = false;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const isPptx =
        file.type.includes("presentation") || file.type.includes("powerpoint");

      // Upload to storage
      const ext = file.name.split(".").pop() || "pdf";
      const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("lecture-materials")
        .upload(storagePath, file);
      if (uploadErr) throw uploadErr;

      // Create lecture_materials record
      const title = file.name.replace(/\.[^.]+$/, "");
      const { data: material, error: matErr } = await supabase
        .from("lecture_materials")
        .insert({
          instructor_id: user.id,
          title,
          file_name: file.name,
          file_path: storagePath,
          file_type: file.type,
          file_size: file.size,
          course_id: selectedCourseId || null,
        })
        .select("id")
        .single();
      if (matErr || !material) throw matErr || new Error("Failed to create material");

      const materialId = material.id;

      // If PPTX, trigger conversion and wait
      let pdfPath = storagePath;
      if (isPptx) {
        setStage("converting");
        setProgress(10);

        // Trigger conversion
        await supabase.functions.invoke("convert-pptx-background", {
          body: { material_id: materialId },
        });

        // Poll for completion (max 3 min)
        let converted = false;
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          if (abortRef.current) return;

          const { data: mat } = await supabase
            .from("lecture_materials")
            .select("pdf_fallback_path, pdf_conversion_status")
            .eq("id", materialId)
            .single();

          if (mat?.pdf_conversion_status === "completed" && mat?.pdf_fallback_path) {
            pdfPath = mat.pdf_fallback_path;
            converted = true;
            break;
          }
          if (mat?.pdf_conversion_status === "failed") {
            throw new Error("PPTX conversion failed. Try uploading as PDF.");
          }
          setProgress(10 + Math.min(i, 30));
        }
        if (!converted) throw new Error("Conversion timed out. Try uploading as PDF.");
      }

      // Get signed URL for PDF
      const { data: signedData, error: signErr } = await supabase.storage
        .from("lecture-materials")
        .createSignedUrl(pdfPath, 3600);
      if (signErr || !signedData) throw new Error("Failed to get file URL");

      // Wait for PDF.js
      let attempts = 0;
      // @ts-ignore
      while (!window.pdfjsLib && attempts < 20) {
        await new Promise((r) => setTimeout(r, 250));
        attempts++;
      }
      // @ts-ignore
      const pdfjsLib = window.pdfjsLib;
      if (!pdfjsLib) throw new Error("PDF.js failed to load");

      // Render slides
      setStage("rendering");
      setProgress(0);
      const pdf = await pdfjsLib.getDocument(signedData.signedUrl).promise;
      const numPages = pdf.numPages;
      setTotalSlides(numPages);

      const BATCH_SIZE = 3;
      const batches: Array<Array<{ number: number; image: string }>> = [];
      let currentBatch: Array<{ number: number; image: string }> = [];

      for (let i = 1; i <= numPages; i++) {
        if (abortRef.current) return;
        setCurrentSlide(i);
        setProgress(Math.round((i / numPages) * 40));

        const image = await renderSlideToImage(pdf, i);
        if (image) {
          currentBatch.push({ number: i, image });
          if (currentBatch.length >= BATCH_SIZE) {
            batches.push(currentBatch);
            currentBatch = [];
          }
        }
      }
      if (currentBatch.length > 0) batches.push(currentBatch);

      // Analyze with AI
      setStage("analyzing");
      let totalGenerated = 0;
      const sourceTitle = title;

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        if (abortRef.current) return;
        const batch = batches[bIdx];
        setProgress(40 + Math.round(((bIdx + 1) / batches.length) * 55));
        setCurrentSlide(batch[batch.length - 1].number);

        try {
          const { data, error } = await supabase.functions.invoke(
            "generate-slide-questions",
            {
              body: {
                material_id: materialId,
                slides: batch,
                course_id: selectedCourseId,
                target: "question_bank",
                source_material_title: sourceTitle,
              },
            }
          );

          if (error) {
            console.error("Batch error:", error);
            continue;
          }
          if (data?.questions_generated) {
            totalGenerated += data.questions_generated;
            setQuestionsGenerated(totalGenerated);
          }
        } catch (batchErr) {
          console.error("Batch processing error:", batchErr);
        }
      }

      setProgress(100);
      setStage("done");
      setQuestionsGenerated(totalGenerated);
    } catch (err) {
      console.error("Upload/generate error:", err);
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="max-w-lg mx-auto headspace-card">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          Generate Questions from Slides
        </CardTitle>
        <CardDescription>
          Upload a PDF or PowerPoint — AI will generate questions from each slide
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <canvas ref={canvasRef} className="hidden" />

        {stage === "upload" && (
          <div className="space-y-4">
            {!file ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors">
                <FileUp className="h-10 w-10 text-muted-foreground mb-3" />
                <span className="text-sm font-medium">
                  Drop PDF or PPTX here, or click to browse
                </span>
                <span className="text-xs text-muted-foreground mt-1">Max 50 MB</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                  onChange={handleFileSelect}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileUp className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({(file.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleUploadAndGenerate}
                disabled={!file || uploading}
                className="flex-1"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload & Generate
              </Button>
            </div>
          </div>
        )}

        {(stage === "converting" || stage === "rendering" || stage === "analyzing") && (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <Progress value={progress} />
            <p className="text-sm text-center text-muted-foreground">
              {stage === "converting"
                ? "Converting PowerPoint to PDF..."
                : stage === "rendering"
                ? `Rendering slide ${currentSlide} of ${totalSlides}...`
                : `Analyzing slide ${currentSlide} of ${totalSlides}...`}
            </p>
            {questionsGenerated > 0 && (
              <p className="text-xs text-center text-muted-foreground">
                {questionsGenerated} question{questionsGenerated !== 1 ? "s" : ""} generated
                so far
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                abortRef.current = true;
                onCancel();
              }}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        )}

        {stage === "done" && (
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <div>
              <p className="font-semibold text-lg">
                We found {questionsGenerated} likely question
                {questionsGenerated !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                from {totalSlides} slides
              </p>
            </div>
            <Button onClick={() => onComplete(questionsGenerated)} className="w-full">
              Review & Edit Questions
            </Button>
          </div>
        )}

        {stage === "error" && (
          <div className="text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-sm text-destructive">{errorMessage}</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setStage("upload");
                  setFile(null);
                  setProgress(0);
                }}
              >
                Try Again
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
