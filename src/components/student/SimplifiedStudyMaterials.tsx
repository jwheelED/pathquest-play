import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookOpen, Upload, FileText, Image, Trash2, 
  Plus, X, Loader2, Sparkles, ChevronDown, ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Material {
  id: string;
  title: string;
  material_type: string;
  questions_generated: number;
  created_at: string;
}

interface SimplifiedStudyMaterialsProps {
  userId: string;
  onMaterialCountChange?: (count: number) => void;
}

export function SimplifiedStudyMaterials({ userId, onMaterialCountChange }: SimplifiedStudyMaterialsProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<Material | null>(null);
  
  // Upload form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<"note" | "file">("note");

  useEffect(() => {
    fetchMaterials();
  }, [userId]);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("student_study_materials")
        .select("id, title, material_type, questions_generated, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setMaterials(data || []);
      onMaterialCountChange?.(data?.length || 0);
    } catch (error) {
      console.error("Error fetching materials:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    if (uploadType === "note" && !content.trim()) {
      toast.error("Please enter some content");
      return;
    }

    if (uploadType === "file" && !file) {
      toast.error("Please select a file");
      return;
    }

    setUploading(true);
    try {
      let filePath = null;
      let materialType = "note";

      // Upload file directly to Supabase Storage
      if (file) {
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        const uniqueName = `${userId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

        const { error: storageError } = await supabase.storage
          .from("student-materials")
          .upload(uniqueName, file);

        if (storageError) throw new Error(storageError.message || "File upload failed");

        const { data: urlData } = supabase.storage
          .from("student-materials")
          .getPublicUrl(uniqueName);

        filePath = urlData.publicUrl;
        materialType = fileExt === "pdf" ? "pdf" : "image";
      }

      // Insert material record
      const { data: materialData, error: insertError } = await supabase
        .from("student_study_materials")
        .insert({
          user_id: userId,
          title: title.trim(),
          material_type: materialType,
          content: uploadType === "note" ? content.trim() : null,
          file_path: filePath,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success("Material uploaded!");

      // Generate questions
      if (materialData) {
        toast.info("Generating practice questions...");
        try {
          await supabase.functions.invoke("generate-personalized-questions", {
            body: {
              materialId: materialData.id,
              userId: userId,
              difficulty: "intermediate",
              questionCount: 5
            }
          });
          toast.success("Questions generated!");
        } catch (error) {
          console.error("Error generating questions:", error);
        }
      }

      // Reset form
      setTitle("");
      setContent("");
      setFile(null);
      setShowUpload(false);
      fetchMaterials();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!materialToDelete) return;

    try {
      const { error } = await supabase
        .from("student_study_materials")
        .delete()
        .eq("id", materialToDelete.id);

      if (error) throw error;

      toast.success("Material deleted");
      fetchMaterials();
    } catch (error: any) {
      toast.error(error.message || "Delete failed");
    } finally {
      setDeleteDialogOpen(false);
      setMaterialToDelete(null);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "image": return Image;
      case "pdf": return FileText;
      default: return FileText;
    }
  };

  return (
    <>
      <Card id="study-materials-section">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="w-5 h-5 text-primary" />
              Study Materials
            </CardTitle>
            <Button 
              variant={showUpload ? "secondary" : "default"} 
              size="sm"
              onClick={() => setShowUpload(!showUpload)}
            >
              {showUpload ? (
                <>
                  <X className="w-4 h-4 mr-1" /> Cancel
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1" /> Add Material
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Upload Form */}
          <Collapsible open={showUpload}>
            <CollapsibleContent>
              <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={uploadType === "note" ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setUploadType("note"); setFile(null); }}
                  >
                    <FileText className="w-4 h-4 mr-1" /> Text Note
                  </Button>
                  <Button
                    variant={uploadType === "file" ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setUploadType("file"); setContent(""); }}
                  >
                    <Upload className="w-4 h-4 mr-1" /> File Upload
                  </Button>
                </div>

                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (e.g., Chapter 5 Notes)"
                  maxLength={100}
                />

                {uploadType === "note" ? (
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste or type your notes here..."
                    rows={6}
                    className="font-mono text-sm"
                  />
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <input
                      type="file"
                      id="file-upload"
                      accept="image/*,application/pdf"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      {file ? (
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      ) : (
                        <div>
                          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm">Click to upload PDF or image</p>
                          <p className="text-xs text-muted-foreground">Max 50MB</p>
                        </div>
                      )}
                    </label>
                  </div>
                )}

                <Button 
                  onClick={handleUpload} 
                  disabled={uploading}
                  className="w-full"
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> Upload & Generate Questions</>
                  )}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Materials List */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse h-16 bg-muted rounded-lg" />
              ))}
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No materials yet</p>
              <p className="text-sm text-muted-foreground">
                Upload notes or PDFs to generate practice questions
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {materials.map((material) => {
                const Icon = getIcon(material.material_type);
                return (
                  <div
                    key={material.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{material.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{new Date(material.created_at).toLocaleDateString()}</span>
                        {material.questions_generated > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            <Sparkles className="w-3 h-3" />
                            {material.questions_generated} Q's
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setMaterialToDelete(material);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Material?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{materialToDelete?.title}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
