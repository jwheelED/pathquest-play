import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Upload, FileText, Trash2, Download, Loader2, Search,
  Sparkles, BookOpen, Presentation, File, CheckCircle2, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOrgId } from "@/hooks/useOrgId";
import { useCourseContext } from "@/hooks/useCourseContext";
import { formatDistanceToNow } from "date-fns";

interface LectureMaterial {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  title: string;
  description: string | null;
  created_at: string;
  parsed_text?: string | null;
}

// --- Helpers ---

function getFileIcon(mimeType: string) {
  if (mimeType.includes("pdf")) return { icon: FileText, color: "text-red-500" };
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return { icon: Presentation, color: "text-orange-500" };
  if (mimeType.includes("word") || mimeType.includes("document"))
    return { icon: FileText, color: "text-blue-500" };
  if (mimeType.includes("text/plain")) return { icon: File, color: "text-muted-foreground" };
  return { icon: File, color: "text-muted-foreground" };
}

function getFileTypeLabel(mimeType: string) {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("presentationml") || mimeType.includes("powerpoint")) return "PPTX";
  if (mimeType.includes("wordprocessingml")) return "DOCX";
  if (mimeType.includes("msword")) return "DOC";
  if (mimeType.includes("text/plain")) return "TXT";
  return "FILE";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

// --- Component ---

export function LectureMaterialsUpload() {
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { selectedCourseId } = useCourseContext();

  // --- Queries & Mutations (unchanged logic) ---

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["lecture-materials", selectedCourseId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (!selectedCourseId) return [];
      const { data, error } = await supabase
        .from("lecture_materials")
        .select("*")
        .eq("instructor_id", user.id)
        .eq("course_id", selectedCourseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LectureMaterial[];
    },
    enabled: !!selectedCourseId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !title.trim()) throw new Error("Please provide a title and select a file");
      if (!selectedCourseId) throw new Error("Please select a course first");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      const orgId = await getOrgId(user.id);
      const { error: uploadError } = await supabase.storage.from("lecture-materials").upload(filePath, selectedFile);
      if (uploadError) throw uploadError;
      const { error: dbError } = await supabase.from("lecture_materials").insert({
        instructor_id: user.id, org_id: orgId, course_id: selectedCourseId,
        file_name: selectedFile.name, file_path: filePath, file_type: selectedFile.type,
        file_size: selectedFile.size, title: title.trim(), description: description.trim() || null,
      });
      if (dbError) throw dbError;
      supabase.functions.invoke("parse-lecture-material", { body: { filePath } }).then(async (result) => {
        if (result.data?.text) {
          await supabase.from("lecture_materials").update({ parsed_text: result.data.text } as Record<string, unknown>).eq("file_path", filePath);
          queryClient.invalidateQueries({ queryKey: ["lecture-materials"] });
        }
      }).catch((err) => console.error("[AUTO-PARSE FAILED]", err));
    },
    onSuccess: () => {
      toast.success("Material uploaded successfully!", {
        description: "Your file is being parsed for AI question generation.",
        action: { label: "Generate Questions", onClick: () => {
          // Navigate to question bank tab
          const el = document.querySelector('[data-tab="question-bank"]') as HTMLElement;
          el?.click();
        }},
      });
      setTitle(""); setDescription(""); setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["lecture-materials"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to upload material"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (material: LectureMaterial) => {
      setIsDeleting(true);
      const { error: storageError } = await supabase.storage.from("lecture-materials").remove([material.file_path]);
      if (storageError) throw storageError;
      const { error: dbError } = await supabase.from("lecture_materials").delete().eq("id", material.id);
      if (dbError) throw dbError;
      await new Promise(resolve => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      toast.success("Material deleted");
      queryClient.invalidateQueries({ queryKey: ["lecture-materials"] });
      queryClient.invalidateQueries({ queryKey: ["slides"] });
      queryClient.invalidateQueries({ queryKey: ["presentations"] });
      setTimeout(() => setIsDeleting(false), 500);
    },
    onError: (error: Error) => { setIsDeleting(false); toast.error(error.message || "Failed to delete"); },
  });

  const downloadFile = async (material: LectureMaterial) => {
    const { data, error } = await supabase.storage.from("lecture-materials").download(material.file_path);
    if (error) { toast.error("Failed to download file"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href = url; a.download = material.file_name; a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-parse unparsed materials
  const parsingQueueRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!materials || materials.length === 0) return;
    const unparsed = materials.filter((m) => !m.parsed_text && !parsingQueueRef.current.has(m.id));
    if (unparsed.length === 0) return;
    for (const material of unparsed) {
      parsingQueueRef.current.add(material.id);
      supabase.functions.invoke("parse-lecture-material", { body: { filePath: material.file_path } })
        .then(async (result) => {
          if (result.data?.text) {
            await supabase.from("lecture_materials").update({ parsed_text: result.data.text } as Record<string, unknown>).eq("id", material.id);
            queryClient.invalidateQueries({ queryKey: ["lecture-materials"] });
          }
        }).catch((err) => console.error("[AUTO-PARSE LOAD FAILED]", material.title, err));
    }
  }, [materials, queryClient]);

  // --- Drag & Drop ---
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragOver(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  }, []);

  const validateAndSetFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Please upload PDF, PPT, PPTX, DOC, DOCX, or TXT files only"); return;
    }
    if (file.size > 50 * 1024 * 1024) { toast.error("File size must be less than 50MB"); return; }
    setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleUpload = async () => {
    setUploading(true);
    try { await uploadMutation.mutateAsync(); } finally { setUploading(false); }
  };

  // --- Filter ---
  const filteredMaterials = materials.filter((m) =>
    !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- Render ---
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-foreground">Lecture Materials</h2>
          {materials.length > 0 && (
            <Badge variant="secondary" className="text-xs">{materials.length} file{materials.length !== 1 ? "s" : ""}</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Upload and manage files used for AI question generation and live teaching.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Left: Upload */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden border-primary/20">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Upload className="w-4 h-4" />
                Upload New Material
              </div>

              {/* Drag-and-drop zone */}
              <div
                role="button"
                tabIndex={0}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : selectedFile
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-accent/30"
                }`}
              >
                {selectedFile ? (
                  <>
                    <FileText className="w-8 h-8 text-primary" />
                    <p className="text-sm font-medium text-foreground truncate max-w-full">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                      Change file
                    </Button>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Drop a file here or click to browse</p>
                    <p className="text-xs text-muted-foreground">PDF, PPTX, DOC, DOCX, TXT — max 50MB</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.ppt,.pptx,.doc,.docx,.txt" />
              </div>

              {/* Title */}
              <div>
                <Label htmlFor="mat-title" className="text-xs">Material Title</Label>
                <Input id="mat-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Week 3 — Data Structures" className="mt-1.5" />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="mat-desc" className="text-xs">Description (Optional)</Label>
                <Textarea id="mat-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description…" className="mt-1.5" rows={2} />
              </div>

              {/* Upload CTA */}
              <Button onClick={handleUpload} disabled={!selectedFile || !title.trim() || uploading || isDeleting} className="w-full">
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading…</> : isDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Please wait…</> : <><Upload className="w-4 h-4 mr-2" />Upload Material</>}
              </Button>
            </CardContent>
          </Card>

          {/* Workflow hint */}
          <div className="flex items-start gap-3 rounded-xl bg-accent/40 border border-border/50 p-4">
            <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">How materials work in Edvana</span><br />
              Uploaded files are automatically parsed and used as context for AI question generation during live lectures and practice sessions.
            </div>
          </div>
        </div>

        {/* Right: Material Library */}
        <div className="lg:col-span-3 space-y-4">
          {/* Library header + search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm text-foreground">Material Library</h3>
            </div>
            {materials.length > 0 && (
              <div className="relative sm:ml-auto w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search materials…" className="pl-9 h-9 text-sm" />
              </div>
            )}
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-dashed border-border">
              <BookOpen className="w-10 h-10 text-muted-foreground/50 mb-3" />
              <p className="font-medium text-foreground text-sm">
                {searchQuery ? "No materials match your search" : "No materials uploaded yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery ? "Try a different search term." : "Upload your first file to get started."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMaterials.map((material) => {
                const { icon: TypeIcon, color: iconColor } = getFileIcon(material.file_type);
                const isParsed = !!material.parsed_text;
                return (
                  <Card key={material.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-start gap-4">
                      {/* File type icon */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center ${iconColor}`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-medium text-sm text-foreground truncate">{material.title}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{material.file_name}</span>
                          <span>•</span>
                          <span>{formatFileSize(material.file_size)}</span>
                          <span>•</span>
                          <span>{formatDistanceToNow(new Date(material.created_at), { addSuffix: true })}</span>
                        </div>
                        {material.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{material.description}</p>
                        )}
                        <div className="pt-0.5">
                          {isParsed ? (
                            <Badge variant="secondary" className="text-[10px] gap-1 px-2 py-0">
                              <CheckCircle2 className="w-3 h-3 text-primary" /> Parsed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] gap-1 px-2 py-0">
                              <Clock className="w-3 h-3 animate-spin" /> Processing…
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadFile(material)}>
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(material)} disabled={deleteMutation.isPending}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
