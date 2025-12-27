import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Search, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ChevronRight,
  FileText,
  Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AnswerKey {
  id: string;
  title: string;
  subject: string;
  course_context: string | null;
  file_name: string | null;
  status: string;
  problem_count: number;
  created_at: string;
  updated_at: string;
}

interface AnswerKeyLibraryProps {
  onSelectKey?: (keyId: string) => void;
  onCreateNew?: () => void;
}

export function AnswerKeyLibrary({ onSelectKey, onCreateNew }: AnswerKeyLibraryProps) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: answerKeys = [], isLoading } = useQuery({
    queryKey: ["answer-keys"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("instructor_answer_keys")
        .select("*")
        .eq("instructor_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AnswerKey[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (answerKey: AnswerKey) => {
      // Delete file from storage if exists
      if (answerKey.file_name) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const filePath = `${user.id}/${answerKey.file_name}`;
          await supabase.storage.from("answer-keys").remove([filePath]);
        }
      }

      // Delete from database (cascades to problems and MCQs)
      const { error } = await supabase
        .from("instructor_answer_keys")
        .delete()
        .eq("id", answerKey.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Answer key deleted");
      queryClient.invalidateQueries({ queryKey: ["answer-keys"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete answer key");
    },
  });

  const filteredKeys = answerKeys.filter(
    (key) =>
      key.title.toLowerCase().includes(search.toLowerCase()) ||
      key.subject.toLowerCase().includes(search.toLowerCase()) ||
      key.course_context?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string, problemCount: number) => {
    switch (status) {
      case "verified":
        return (
          <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Verified ({problemCount})
          </Badge>
        );
      case "parsed":
        return (
          <Badge variant="secondary">
            <FileText className="h-3 w-3 mr-1" />
            {problemCount} Problems
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Clock className="h-3 w-3 mr-1 animate-pulse" />
            Processing
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return null;
    }
  };

  const getSubjectLabel = (subject: string) => {
    const labels: Record<string, string> = {
      physics: "Physics",
      engineering: "Engineering",
      chemistry: "Chemistry",
      mathematics: "Mathematics",
      biology: "Biology",
      "computer-science": "Computer Science",
      economics: "Economics",
      statistics: "Statistics",
      other: "Other",
    };
    return labels[subject] || subject;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Answer Key Library
            </CardTitle>
            <CardDescription>
              Browse and manage your uploaded answer keys with verified solutions
            </CardDescription>
          </div>
          {onCreateNew && (
            <Button onClick={onCreateNew} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search answer keys..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading answer keys...
          </div>
        ) : filteredKeys.length === 0 ? (
          <div className="py-8 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {search ? "No answer keys match your search" : "No answer keys uploaded yet"}
            </p>
            {!search && onCreateNew && (
              <Button onClick={onCreateNew} variant="outline" className="mt-3">
                <Plus className="h-4 w-4 mr-1" />
                Upload Your First Answer Key
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredKeys.map((answerKey) => (
              <div
                key={answerKey.id}
                className="flex items-center justify-between p-4 border rounded-xl hover:bg-accent/30 transition-colors cursor-pointer group"
                onClick={() => onSelectKey?.(answerKey.id)}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{answerKey.title}</p>
                      {getStatusBadge(answerKey.status, answerKey.problem_count)}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {getSubjectLabel(answerKey.subject)}
                      </Badge>
                      {answerKey.course_context && (
                        <span className="truncate">• {answerKey.course_context}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Updated {formatDistanceToNow(new Date(answerKey.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Answer Key?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{answerKey.title}" and all its problems and MCQs.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(answerKey);
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
