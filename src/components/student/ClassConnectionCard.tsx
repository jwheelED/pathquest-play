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
      <div className="headspace-card p-5 h-full">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded-full w-1/3"></div>
          <div className="h-5 bg-muted rounded-full w-2/3"></div>
          <div className="h-4 bg-muted rounded-full w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!classInfo) {
    return (
      <div className="headspace-card p-5 h-full border-2 border-dashed border-border">
        <div className="flex flex-col items-center justify-center h-full text-center py-4">
          <div className="w-14 h-14 rounded-3xl bg-accent flex items-center justify-center mb-4">
            <GraduationCap className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-4">No class connected yet</p>
          <Button 
            size="sm" 
            className="rounded-full px-6"
            onClick={() => setShowSwitchDialog(true)}
          >
            Join a Class
          </Button>
        </div>
        
        <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
          <AlertDialogContent className="rounded-3xl">
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
                className="mt-2 rounded-2xl h-14 text-center font-mono text-xl tracking-widest"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={switching} className="rounded-full">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSwitchClass}
                disabled={switching || !newClassCode.trim()}
                className="rounded-full"
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
      <div className="headspace-card p-5 h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-secondary/15 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-secondary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">My Class</h3>
              <p className="text-xs text-muted-foreground">{classInfo.instructorName}</p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl">
              <DropdownMenuItem onClick={() => setShowSwitchDialog(true)} className="gap-2 rounded-xl">
                <RefreshCw className="h-4 w-4" />
                Switch Class
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-accent/50">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground truncate">{classInfo.courseTitle}</span>
          </div>
          <div className="flex items-center gap-3 px-3">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-sm text-muted-foreground">{classInfo.instructorCode}</span>
          </div>
        </div>
      </div>

      <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
        <AlertDialogContent className="rounded-3xl">
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
              className="mt-2 rounded-2xl h-14 text-center font-mono text-xl tracking-widest"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={switching} className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSwitchClass}
              disabled={switching || !newClassCode.trim()}
              className="rounded-full"
            >
              {switching ? "Switching..." : "Switch Class"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
