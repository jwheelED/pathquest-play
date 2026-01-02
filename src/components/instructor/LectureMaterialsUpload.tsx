import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, Trash2, Download, BookOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOrgId } from "@/hooks/useOrgId";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LectureMaterial {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  title: string;
  description: string | null;
  created_at: string;
}

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

// Keywords that suggest the file is an answer key/quiz
const ANSWER_KEY_KEYWORDS = ["quiz", "test", "exam", "answer", "key", "solution", "problem set", "homework", "assignment"];

export function LectureMaterialsUpload() {
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseAsAnswerKey, setParseAsAnswerKey] = useState(false);
  const [answerKeySubject, setAnswerKeySubject] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const queryClient = useQueryClient();

  // Auto-detect if file might be an answer key based on title
  useEffect(() => {
    const lowerTitle = title.toLowerCase();
    const mightBeAnswerKey = ANSWER_KEY_KEYWORDS.some(keyword => lowerTitle.includes(keyword));
    if (mightBeAnswerKey && !parseAsAnswerKey) {
      // Only auto-suggest, don't auto-enable
      toast.info("This looks like a quiz/answer key. Enable 'Parse as Answer Key' to use it for live matching.", {
        duration: 5000,
      });
    }
  }, [title]);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["lecture-materials"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("lecture_materials")
        .select("*")
        .eq("instructor_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as LectureMaterial[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !title.trim()) {
        throw new Error("Please provide a title and select a file");
      }

      if (parseAsAnswerKey && !answerKeySubject) {
        throw new Error("Please select a subject for the answer key");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      const orgId = await getOrgId(user.id);

      // Upload to appropriate bucket based on whether it's an answer key
      const bucketName = parseAsAnswerKey ? "answer-keys" : "lecture-materials";
      
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      if (parseAsAnswerKey) {
        // Create answer key record and trigger parsing
        const { data: answerKey, error: dbError } = await supabase
          .from("instructor_answer_keys")
          .insert({
            instructor_id: user.id,
            org_id: orgId,
            title: title.trim(),
            subject: answerKeySubject,
            course_context: description.trim() || null,
            file_path: filePath,
            file_name: selectedFile.name,
            file_type: selectedFile.type,
            status: "processing",
          })
          .select()
          .single();

        if (dbError) throw dbError;

        // Trigger AI parsing
        setIsParsing(true);
        const { error: parseError } = await supabase.functions.invoke("parse-answer-key", {
          body: { answerKeyId: answerKey.id },
        });

        if (parseError) {
          console.error("Parse error (non-blocking):", parseError);
          toast.info("AI parsing started. Problems will appear in Answer Keys manager when ready.");
        }

        // Also add to lecture_materials for reference
        await supabase
          .from("lecture_materials")
          .insert({
            instructor_id: user.id,
            org_id: orgId,
            file_name: selectedFile.name,
            file_path: filePath,
            file_type: selectedFile.type,
            file_size: selectedFile.size,
            title: title.trim(),
            description: `[Answer Key] ${description.trim() || answerKeySubject}`,
          });

        return { isAnswerKey: true, answerKeyId: answerKey.id };
      } else {
        // Regular material upload
        const { error: dbError } = await supabase
          .from("lecture_materials")
          .insert({
            instructor_id: user.id,
            org_id: orgId,
            file_name: selectedFile.name,
            file_path: filePath,
            file_type: selectedFile.type,
            file_size: selectedFile.size,
            title: title.trim(),
            description: description.trim() || null,
          });

        if (dbError) throw dbError;
        return { isAnswerKey: false };
      }
    },
    onSuccess: (result) => {
      if (result?.isAnswerKey) {
        toast.success("Answer key uploaded! AI is parsing problems for live matching.");
      } else {
        toast.success("Material uploaded successfully!");
      }
      setTitle("");
      setDescription("");
      setSelectedFile(null);
      setParseAsAnswerKey(false);
      setAnswerKeySubject("");
      setIsParsing(false);
      queryClient.invalidateQueries({ queryKey: ["lecture-materials"] });
      queryClient.invalidateQueries({ queryKey: ["answer-keys"] });
      queryClient.invalidateQueries({ queryKey: ["verified-problems-count"] });
    },
    onError: (error: any) => {
      setIsParsing(false);
      toast.error(error.message || "Failed to upload material");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (material: LectureMaterial) => {
      const { error: storageError } = await supabase.storage
        .from("lecture-materials")
        .remove([material.file_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("lecture_materials")
        .delete()
        .eq("id", material.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      toast.success("Material deleted successfully!");
      queryClient.invalidateQueries({ queryKey: ["lecture-materials"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete material");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = [
        "application/pdf",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ];
      
      if (!allowedTypes.includes(file.type)) {
        toast.error("Please upload PDF, PPT, PPTX, DOC, DOCX, or TXT files only");
        return;
      }
      
      if (file.size > 50 * 1024 * 1024) {
        toast.error("File size must be less than 50MB");
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    try {
      await uploadMutation.mutateAsync();
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = async (material: LectureMaterial) => {
    const { data, error } = await supabase.storage
      .from("lecture-materials")
      .download(material.file_path);

    if (error) {
      toast.error("Failed to download file");
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = material.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lecture Materials</CardTitle>
        <CardDescription>
          Upload course materials (slides, PDFs, documents) - AI will use them to generate contextually relevant questions during live lectures
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Material Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Week 3 - Data Structures"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the material..."
              className="mt-1.5"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="file">File Upload</Label>
            <Input
              id="file"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.ppt,.pptx,.doc,.docx,.txt"
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Supported formats: PDF, PPT, PPTX, DOC, DOCX, TXT (Max 50MB)
            </p>
          </div>

          {/* Parse as Answer Key option */}
          <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="parse-answer-key"
                checked={parseAsAnswerKey}
                onCheckedChange={(checked) => setParseAsAnswerKey(checked === true)}
              />
              <Label htmlFor="parse-answer-key" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-primary" />
                Parse as Answer Key
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Enable this for quizzes, tests, or problem sets. AI will extract problems and create MCQs for live lecture matching.
            </p>

            {parseAsAnswerKey && (
              <div className="ml-6">
                <Label htmlFor="answer-key-subject" className="text-xs">Subject *</Label>
                <Select value={answerKeySubject} onValueChange={setAnswerKeySubject}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
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
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !title.trim() || uploading || isParsing || (parseAsAnswerKey && !answerKeySubject)}
            className="w-full"
          >
            {uploading || isParsing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isParsing ? "Parsing..." : "Uploading..."}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {parseAsAnswerKey ? "Upload & Parse Answer Key" : "Upload Material"}
              </>
            )}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading materials...</p>
        ) : materials.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No materials uploaded yet
          </p>
        ) : (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Uploaded Materials</h4>
            {materials.map((material) => (
              <div
                key={material.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <FileText className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{material.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {material.file_name} • {formatFileSize(material.file_size)}
                    </p>
                    {material.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {material.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile(material)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(material)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
