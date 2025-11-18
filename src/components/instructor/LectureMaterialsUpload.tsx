import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Trash2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOrgId } from "@/hooks/useOrgId";

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

export function LectureMaterialsUpload() {
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("lecture-materials")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const orgId = await getOrgId(user.id);
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
    },
    onSuccess: () => {
      toast.success("Material uploaded successfully!");
      setTitle("");
      setDescription("");
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["lecture-materials"] });
    },
    onError: (error: any) => {
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

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !title.trim() || uploading}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? "Uploading..." : "Upload Material"}
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
