import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileText, Image, Video, Music, X, Loader2, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StudyMaterialUploadProps {
  userId: string;
  onUploadComplete?: () => void;
}

type MaterialType = 'note' | 'image' | 'video' | 'pdf' | 'audio';

interface ClassOption {
  instructorId: string;
  courseTitle: string;
  instructorName: string;
}

export function StudyMaterialUpload({ userId, onUploadComplete }: StudyMaterialUploadProps) {
  const [materialType, setMaterialType] = useState<MaterialType>('note');
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [loadingClasses, setLoadingClasses] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserClasses();
  }, [userId]);

  const fetchUserClasses = async () => {
    try {
      setLoadingClasses(true);
      const { data: connections, error } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", userId);

      if (error) throw error;

      if (!connections || connections.length === 0) {
        setClasses([]);
        setLoadingClasses(false);
        return;
      }

      const classPromises = connections.map(async (conn) => {
        const { data: instructor } = await supabase
          .from("profiles")
          .select("full_name, course_title")
          .eq("id", conn.instructor_id)
          .single();

        return {
          instructorId: conn.instructor_id,
          courseTitle: instructor?.course_title || "Unknown Course",
          instructorName: instructor?.full_name || "Unknown Instructor",
        };
      });

      const classData = await Promise.all(classPromises);
      setClasses(classData);
      
      // Auto-select first class if available
      if (classData.length > 0) {
        setSelectedClass(classData[0].instructorId);
      }
    } catch (error: any) {
      console.error("Error fetching classes:", error);
    } finally {
      setLoadingClasses(false);
    }
  };

  const materialTypes = [
    { value: 'note', label: 'Text Note', icon: FileText, accept: '' },
    { value: 'image', label: 'Image', icon: Image, accept: 'image/*' },
    { value: 'video', label: 'Video Link', icon: Video, accept: '' },
    { value: 'pdf', label: 'PDF', icon: FileText, accept: 'application/pdf' },
    { value: 'audio', label: 'Audio', icon: Music, accept: 'audio/*' },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file size (50MB limit)
      if (selectedFile.size > 52428800) {
        toast({
          title: "File too large",
          description: "Maximum file size is 50MB",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleUpload = async () => {
    if (classes.length > 0 && !selectedClass) {
      toast({
        title: "Class required",
        description: "Please select which class this material is for",
        variant: "destructive",
      });
      return;
    }

    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for your material",
        variant: "destructive",
      });
      return;
    }

    if (materialType === 'note' && !content.trim()) {
      toast({
        title: "Content required",
        description: "Please enter some content for your note",
        variant: "destructive",
      });
      return;
    }

    if (materialType === 'video' && !videoUrl.trim()) {
      toast({
        title: "Video URL required",
        description: "Please enter a YouTube or video URL",
        variant: "destructive",
      });
      return;
    }

    if ((materialType === 'image' || materialType === 'pdf' || materialType === 'audio') && !file) {
      toast({
        title: "File required",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      let filePath = null;

      // Upload file to storage if needed
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('student-materials')
          .upload(fileName, file);

        if (uploadError) throw uploadError;
        filePath = fileName;
      }

      // Get user's org_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', userId)
        .single();

      // Insert material record
      const { data: materialData, error: insertError } = await supabase
        .from('student_study_materials')
        .insert({
          user_id: userId,
          org_id: profileData?.org_id || null,
          instructor_id: selectedClass || null,
          title: title.trim(),
          description: description.trim() || null,
          material_type: materialType,
          content: materialType === 'note' ? content.trim() : null,
          file_path: filePath,
          video_url: materialType === 'video' ? videoUrl.trim() : null,
          subject_tags: tags.length > 0 ? tags : null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast({
        title: "Material uploaded!",
        description: "Your study material has been saved successfully",
      });

      // Auto-generate questions from the uploaded material
      if (materialData) {
        toast({
          title: "Generating practice questions...",
          description: "Creating 5 questions from your material",
        });

        try {
          const { error: generateError } = await supabase.functions.invoke('generate-personalized-questions', {
            body: {
              materialId: materialData.id,
              userId: userId,
              difficulty: 'intermediate',
              questionCount: 5
            }
          });

          if (generateError) {
            console.error('Error generating questions:', generateError);
            toast({
              title: "Questions generation failed",
              description: "You can generate them manually later",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Questions ready!",
              description: "5 practice questions generated from your material",
            });
          }
        } catch (error: any) {
          console.error('Error calling generate function:', error);
          // Don't show error - questions can be generated manually later
        }
      }

      // Reset form
      setTitle("");
      setDescription("");
      setContent("");
      setVideoUrl("");
      setFile(null);
      setTags([]);
      
      onUploadComplete?.();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const currentType = materialTypes.find(t => t.value === materialType);
  const Icon = currentType?.icon || FileText;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Upload Study Material</h3>
        </div>

        {/* Class Selector */}
        {classes.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="class-select" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Select Class *
            </Label>
            <Select value={selectedClass} onValueChange={setSelectedClass} disabled={loadingClasses}>
              <SelectTrigger id="class-select">
                <SelectValue placeholder="Choose a class for this material" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((classOption) => (
                  <SelectItem key={classOption.instructorId} value={classOption.instructorId}>
                    {classOption.courseTitle} - {classOption.instructorName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This helps organize your materials and generate relevant practice questions
            </p>
          </div>
        )}

        {classes.length === 0 && !loadingClasses && (
          <div className="p-4 border-2 border-dashed border-border rounded-lg text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Join a class to organize your study materials by course
            </p>
          </div>
        )}

        {/* Material Type Selector */}
        <div className="space-y-2">
          <Label>Material Type</Label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {materialTypes.map((type) => {
              const TypeIcon = type.icon;
              return (
                <button
                  key={type.value}
                  onClick={() => {
                    setMaterialType(type.value as MaterialType);
                    setFile(null);
                  }}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    materialType === type.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <TypeIcon className="w-5 h-5 mx-auto mb-1" />
                  <p className="text-xs font-medium">{type.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Chapter 5 Notes, Lecture Summary..."
            maxLength={100}
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description (Optional)</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this material..."
            rows={2}
            maxLength={500}
          />
        </div>

        {/* Content based on type */}
        {materialType === 'note' && (
          <div className="space-y-2">
            <Label htmlFor="content">Note Content *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your notes here... You can use markdown formatting."
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Supports markdown: **bold**, *italic*, `code`, etc.
            </p>
          </div>
        )}

        {materialType === 'video' && (
          <div className="space-y-2">
            <Label htmlFor="videoUrl">Video URL *</Label>
            <Input
              id="videoUrl"
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
            />
            <p className="text-xs text-muted-foreground">
              YouTube, Vimeo, or any video URL
            </p>
          </div>
        )}

        {(materialType === 'image' || materialType === 'pdf' || materialType === 'audio') && (
          <div className="space-y-2">
            <Label htmlFor="file">Upload File *</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                id="file"
                type="file"
                accept={currentType?.accept}
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="file" className="cursor-pointer">
                <Icon className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                {file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-foreground">Click to upload</p>
                    <p className="text-xs text-muted-foreground">Max 50MB</p>
                  </div>
                )}
              </label>
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="space-y-2">
          <Label htmlFor="tags">Subject Tags (Optional)</Label>
          <div className="flex gap-2">
            <Input
              id="tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              placeholder="e.g., Physics, Calculus, History..."
            />
            <Button type="button" onClick={addTag} variant="outline">
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => removeTag(tag)}
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Upload Button */}
        <Button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full"
          size="lg"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload Material
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
