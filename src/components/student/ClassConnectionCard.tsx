import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { GraduationCap, BookOpen, Hash, MoreVertical, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ClassInfo {
  instructorName: string;
  courseTitle: string;
  instructorCode: string;
  instructorId: string;
}

export default function ClassConnectionCard() {
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [newClassCode, setNewClassCode] = useState("");

  useEffect(() => {
    fetchClassInfo();
  }, []);

  const fetchClassInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: connection } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", user.id)
        .maybeSingle();

      if (connection?.instructor_id) {
        const { data: instructor } = await supabase
          .from("profiles")
          .select("full_name, course_title, instructor_code")
          .eq("id", connection.instructor_id)
          .single();

        if (instructor) {
          setClassInfo({
            instructorName: instructor.full_name || "Unknown Instructor",
            courseTitle: instructor.course_title || "No Course Title",
            instructorCode: instructor.instructor_code || "N/A",
            instructorId: connection.instructor_id
          });
        }
      }
    } catch (error) {
      console.error("Error fetching class info:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchClass = async () => {
    if (!newClassCode.trim()) {
      toast.error("Please enter a class code");
      return;
    }

    setSwitching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not authenticated");
        return;
      }

      const { data: newInstructorId, error: validateError } = await supabase
        .rpc("validate_instructor_code", { code: newClassCode.trim() });

      if (validateError || !newInstructorId) {
        toast.error("Invalid class code. Please check with your instructor.");
        return;
      }

      if (classInfo && newInstructorId === classInfo.instructorId) {
        toast.info("You're already enrolled in this class.");
        setShowSwitchDialog(false);
        setNewClassCode("");
        return;
      }

      await supabase
        .from("instructor_students")
        .delete()
        .eq("student_id", user.id);

      const { error: insertError } = await supabase
        .from("instructor_students")
        .insert({
          instructor_id: newInstructorId,
          student_id: user.id
        });

      if (insertError) {
        toast.error("Failed to join new class");
        console.error("Insert error:", insertError);
        return;
      }

      await supabase
        .from("profiles")
        .update({ onboarded: true })
        .eq("id", user.id);

      localStorage.setItem("edvana_onboarded", "true");

      toast.success("Successfully switched to new class!");
      setShowSwitchDialog(false);
      setNewClassCode("");
      
      await fetchClassInfo();
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Error switching class:", error);
      toast.error("Failed to switch class");
    } finally {
      setSwitching(false);
    }
  };

  if (loading) {
    return (
      <div className="bento-card p-5 h-full">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="h-5 bg-muted rounded w-2/3"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!classInfo) {
    return (
      <div className="bento-card p-5 h-full border-dashed">
        <div className="flex flex-col items-center justify-center h-full text-center py-4">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <GraduationCap className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">No class connected</p>
          <Button 
            size="sm" 
            variant="outline" 
            className="rounded-xl"
            onClick={() => setShowSwitchDialog(true)}
          >
            Join a Class
          </Button>
        </div>
        
        <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Join a Class</AlertDialogTitle>
              <AlertDialogDescription>
                Enter the class code provided by your instructor.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="py-4">
              <Label htmlFor="newClassCode" className="text-sm font-medium">Class Code</Label>
              <Input
                id="newClassCode"
                type="text"
                placeholder="Enter class code"
                value={newClassCode}
                onChange={(e) => setNewClassCode(e.target.value.toUpperCase())}
                disabled={switching}
                className="mt-2 rounded-xl h-12 text-center font-mono text-lg tracking-wider"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={switching} className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSwitchClass}
                disabled={switching || !newClassCode.trim()}
                className="rounded-xl"
              >
                {switching ? "Joining..." : "Join Class"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <>
      <div className="bento-card p-5 h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">My Class</h3>
              <p className="text-xs text-muted-foreground">{classInfo.instructorName}</p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={() => setShowSwitchDialog(true)} className="gap-2 rounded-lg">
                <RefreshCw className="h-4 w-4" />
                Switch Class
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground truncate">{classInfo.courseTitle}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-muted-foreground">{classInfo.instructorCode}</span>
          </div>
        </div>
      </div>

      <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Class</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the code for the new class. This will remove you from your current class.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <Label htmlFor="newClassCode" className="text-sm font-medium">New Class Code</Label>
            <Input
              id="newClassCode"
              type="text"
              placeholder="Enter class code"
              value={newClassCode}
              onChange={(e) => setNewClassCode(e.target.value.toUpperCase())}
              disabled={switching}
              className="mt-2 rounded-xl h-12 text-center font-mono text-lg tracking-wider"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={switching} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSwitchClass}
              disabled={switching || !newClassCode.trim()}
              className="rounded-xl"
            >
              {switching ? "Switching..." : "Switch Class"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
