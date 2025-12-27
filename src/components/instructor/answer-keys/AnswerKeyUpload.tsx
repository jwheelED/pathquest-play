import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, X, Loader2, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getOrgId } from "@/hooks/useOrgId";
import { cn } from "@/lib/utils";

const SUBJECTS = [
  { value: "physics", label: "Physics" },
  { value: "engineering", label: "Engineering" },
  { value: "chemistry", label: "Chemistry" },
  { value: "mathematics", label: "Mathematics" },
  { value: "biology", label: "Biology" },
  { value: "computer-science", label: "Computer Science" },
  { value: "economics", label: "Economics" },
  { value: "statistics", label: "Statistics" },
  { value: "other", label: "Other" },
];

interface AnswerKeyUploadProps {
  onUploadComplete?: (answerKeyId: string) => void;
}

export function AnswerKeyUpload({ onUploadComplete }: AnswerKeyUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [courseContext, setCourseContext] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !title.trim() || !subject) {
        throw new Error("Please provide a title, subject, and select a file");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("answer-keys")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const orgId = await getOrgId(user.id);
      
      // Create answer key record
      const { data: answerKey, error: dbError } = await supabase
        .from("instructor_answer_keys")
        .insert({
          instructor_id: user.id,
          org_id: orgId,
          title: title.trim(),
          subject,
          course_context: courseContext.trim() || null,
          file_path: filePath,
          file_name: selectedFile.name,
          file_type: selectedFile.type,
          status: "processing",
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Trigger AI parsing (will be implemented in Phase 3)
      // For now, just mark as ready for manual entry
      await supabase
        .from("instructor_answer_keys")
        .update({ status: "parsed" })
        .eq("id", answerKey.id);

      return answerKey.id;
    },
    onSuccess: (answerKeyId) => {
      toast.success("Answer key uploaded! You can now add problems.");
      setTitle("");
      setSubject("");
      setCourseContext("");
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["answer-keys"] });
      onUploadComplete?.(answerKeyId);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to upload answer key");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    validateAndSetFile(file);
  };

  const validateAndSetFile = (file: File | undefined) => {
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/png",
      "image/jpeg",
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload PDF, DOC, DOCX, TXT, PNG, or JPG files only");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File size must be less than 50MB");
      return;
    }

    setSelectedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    validateAndSetFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleUpload = async () => {
    setUploading(true);
    try {
      await uploadMutation.mutateAsync();
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Upload Answer Key
        </CardTitle>
        <CardDescription>
          Upload problem sets with solutions for STEM subjects. AI will parse them and generate MCQs with verified answers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Problem Set 3 - Kinematics"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="course">Course Context (Optional)</Label>
          <Textarea
            id="course"
            value={courseContext}
            onChange={(e) => setCourseContext(e.target.value)}
            placeholder="e.g., PHYS 201 - Mechanics, Week 5"
            className="mt-1.5"
            rows={2}
          />
        </div>

        {/* Drag & Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-accent/30",
            selectedFile && "border-primary/50 bg-primary/5"
          )}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <input
            id="file-input"
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            className="hidden"
          />

          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Drop your answer key here</p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse • PDF, DOC, DOCX, TXT, PNG, JPG (Max 50MB)
              </p>
            </>
          )}
        </div>

        <Button
          onClick={handleUpload}
          disabled={!selectedFile || !title.trim() || !subject || uploading}
          className="w-full"
          size="lg"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload & Parse Answer Key
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
