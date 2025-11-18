import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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

      // Get student's instructor connection
      const { data: connection } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", user.id)
        .maybeSingle();

      if (connection?.instructor_id) {
        // Fetch instructor details
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

      // Validate new instructor code
      const { data: newInstructorId, error: validateError } = await supabase
        .rpc("validate_instructor_code", { code: newClassCode.trim() });

      if (validateError || !newInstructorId) {
        toast.error("Invalid class code. Please check with your instructor.");
        return;
      }

      // Check if trying to connect to same instructor
      if (classInfo && newInstructorId === classInfo.instructorId) {
        toast.info("You're already enrolled in this class.");
        setShowSwitchDialog(false);
        setNewClassCode("");
        return;
      }

      // Delete old connection
      await supabase
        .from("instructor_students")
        .delete()
        .eq("student_id", user.id);

      // Get new instructor's org_id
      const { data: instructorProfile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", newInstructorId)
        .single();

      const instructorOrgId = instructorProfile?.org_id;

      // Create new connection
      const { error: insertError } = await supabase
        .from("instructor_students")
        .insert({
          instructor_id: newInstructorId,
          student_id: user.id,
          org_id: instructorOrgId
        });

      if (insertError) {
        toast.error("Failed to join new class");
        console.error("Insert error:", insertError);
        return;
      }

      // Update student's org_id and ensure onboarded stays true
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ 
          org_id: instructorOrgId,
          onboarded: true 
        })
        .eq("id", user.id);

      if (updateError) {
        toast.error("Failed to update profile");
        console.error("Profile update error:", updateError);
        return;
      }

      // Wait for database consistency
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the update
      const { data: verification } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", user.id)
        .maybeSingle();

      if (!verification?.onboarded) {
        toast.error("Profile update verification failed");
        return;
      }

      // Update localStorage to maintain onboarded status
      localStorage.setItem("edvana_onboarded", "true");

      toast.success("Successfully switched to new class!");
      setShowSwitchDialog(false);
      setNewClassCode("");
      
      // Refresh class info
      await fetchClassInfo();
      
      // Refresh the page to update all components after a delay
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
      <Card className="p-6 border-2 border-border bg-card">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/3 mb-4"></div>
          <div className="h-6 bg-muted rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  if (!classInfo) {
    return null;
  }

  return (
    <>
      <Card className="p-6 border-2 border-primary-glow bg-gradient-to-br from-card to-primary/5">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            📚 My Class
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSwitchDialog(true)}
          >
            Switch Class
          </Button>
        </div>
        
        <div className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Instructor</p>
            <p className="text-lg font-semibold text-foreground">{classInfo.instructorName}</p>
          </div>
          
          <div>
            <p className="text-sm text-muted-foreground">Course</p>
            <p className="text-base text-foreground">{classInfo.courseTitle}</p>
          </div>
          
          <div>
            <p className="text-sm text-muted-foreground">Class Code</p>
            <p className="text-base font-mono text-foreground">{classInfo.instructorCode}</p>
          </div>
        </div>
      </Card>

      <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to a Different Class</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the class code for the new class you want to join. This will remove you from your current class.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <Label htmlFor="newClassCode">New Class Code</Label>
            <Input
              id="newClassCode"
              type="text"
              placeholder="Enter new class code"
              value={newClassCode}
              onChange={(e) => setNewClassCode(e.target.value.toUpperCase())}
              disabled={switching}
              className="mt-2"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={switching}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSwitchClass}
              disabled={switching || !newClassCode.trim()}
            >
              {switching ? "Switching..." : "Switch Class"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
