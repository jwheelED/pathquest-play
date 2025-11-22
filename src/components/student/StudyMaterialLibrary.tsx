import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  FileText, Image, Video, Music, File, Trash2, Download, 
  Search, Filter, Grid, List, Eye, Sparkles 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  description: string | null;
  material_type: string;
  content: string | null;
  file_path: string | null;
  video_url: string | null;
  subject_tags: string[] | null;
  questions_generated: number;
  created_at: string;
  last_used_at: string | null;
}

interface StudyMaterialLibraryProps {
  userId: string;
  refreshKey?: number;
}

export function StudyMaterialLibrary({ userId, refreshKey }: StudyMaterialLibraryProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<Material | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchMaterials();
  }, [userId, refreshKey]);

  useEffect(() => {
    filterMaterials();
  }, [materials, searchQuery, filterType]);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('student_study_materials')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMaterials(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading materials",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterMaterials = () => {
    let filtered = materials;

    if (filterType !== "all") {
      filtered = filtered.filter(m => m.material_type === filterType);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.title.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query) ||
        m.subject_tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    setFilteredMaterials(filtered);
  };

  const handleDelete = async () => {
    if (!materialToDelete) return;

    try {
      // Delete file from storage if exists
      if (materialToDelete.file_path) {
        await supabase.storage
          .from('student-materials')
          .remove([materialToDelete.file_path]);
      }

      // Delete database record
      const { error } = await supabase
        .from('student_study_materials')
        .delete()
        .eq('id', materialToDelete.id);

      if (error) throw error;

      toast({
        title: "Material deleted",
        description: "Your study material has been removed",
      });

      fetchMaterials();
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setMaterialToDelete(null);
    }
  };

  const handleDownload = async (material: Material) => {
    if (!material.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('student-materials')
        .download(material.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = material.title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'note': return FileText;
      case 'image': return Image;
      case 'video': return Video;
      case 'audio': return Music;
      case 'pdf': return FileText;
      default: return File;
    }
  };

  const materialTypes = [
    { value: 'all', label: 'All' },
    { value: 'note', label: 'Notes' },
    { value: 'image', label: 'Images' },
    { value: 'video', label: 'Videos' },
    { value: 'pdf', label: 'PDFs' },
    { value: 'audio', label: 'Audio' },
  ];

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">My Study Materials</h3>
              <p className="text-sm text-muted-foreground">
                {materials.length} {materials.length === 1 ? 'material' : 'materials'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search materials..."
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Filter className="w-4 h-4 my-auto text-muted-foreground" />
              <div className="flex gap-1 overflow-x-auto">
                {materialTypes.map(type => (
                  <Button
                    key={type.value}
                    variant={filterType === type.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType(type.value)}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Materials Display */}
          {filteredMaterials.length === 0 ? (
            <div className="text-center py-12">
              <File className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">
                {searchQuery || filterType !== 'all'
                  ? 'No materials found'
                  : 'No materials yet. Upload your first study material above!'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaterials.map((material) => {
                const Icon = getIcon(material.material_type);
                return (
                  <Card key={material.id} className="p-4 hover:shadow-lg transition-shadow">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5 text-primary" />
                          <Badge variant="secondary" className="text-xs">
                            {material.material_type}
                          </Badge>
                        </div>
                        {material.questions_generated > 0 && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Sparkles className="w-3 h-3" />
                            {material.questions_generated}
                          </Badge>
                        )}
                      </div>

                      <div>
                        <h4 className="font-semibold text-foreground line-clamp-2">
                          {material.title}
                        </h4>
                        {material.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {material.description}
                          </p>
                        )}
                      </div>

                      {material.subject_tags && material.subject_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {material.subject_tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {material.subject_tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{material.subject_tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        {material.file_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(material)}
                            className="flex-1"
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setMaterialToDelete(material);
                            setDeleteDialogOpen(true);
                          }}
                          className="flex-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {new Date(material.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMaterials.map((material) => {
                const Icon = getIcon(material.material_type);
                return (
                  <Card key={material.id} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <Icon className="w-6 h-6 text-primary" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground truncate">
                          {material.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {material.material_type}
                          </Badge>
                          {material.questions_generated > 0 && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Sparkles className="w-3 h-3" />
                              {material.questions_generated}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(material.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {material.file_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(material)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setMaterialToDelete(material);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Material?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{materialToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
