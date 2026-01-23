import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface JoinClassHeroProps {
  userId: string;
  onClassJoined?: () => void;
}

export function JoinClassHero({ userId, onClassJoined }: JoinClassHeroProps) {
  const [classCode, setClassCode] = useState("");
  const [joining, setJoining] = useState(false);

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classCode.trim()) return;

    setJoining(true);
    try {
      // Find instructor by code
      const { data: instructor, error: findError } = await supabase
        .from("profiles")
        .select("id, full_name, course_title")
        .eq("instructor_code", classCode.trim().toUpperCase())
        .eq("role", "instructor")
        .single();

      if (findError || !instructor) {
        toast.error("Invalid class code. Please check and try again.");
        return;
      }

      // Check if already connected
      const { data: existing } = await supabase
        .from("instructor_students")
        .select("id")
        .eq("student_id", userId)
        .eq("instructor_id", instructor.id)
        .maybeSingle();

      if (existing) {
        toast.info("You're already enrolled in this class!");
        return;
      }

      // Create connection
      const { error: connectError } = await supabase
        .from("instructor_students")
        .insert({
          student_id: userId,
          instructor_id: instructor.id,
        });

      if (connectError) throw connectError;

      toast.success(`Joined ${instructor.course_title || "class"} successfully!`);
      setClassCode("");
      onClassJoined?.();
    } catch (error: any) {
      console.error("Error joining class:", error);
      toast.error(error.message || "Failed to join class");
    } finally {
      setJoining(false);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-8 h-8 text-primary" />
          </div>
          
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-xl font-bold text-foreground mb-1">
              Join a New Class
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter the class code from your instructor to get started
            </p>
          </div>

          <form onSubmit={handleJoinClass} className="flex gap-2 w-full md:w-auto">
            <Input
              value={classCode}
              onChange={(e) => setClassCode(e.target.value.toUpperCase())}
              placeholder="CLASS CODE"
              className="w-full md:w-40 text-center font-mono uppercase tracking-wider bg-background"
              maxLength={8}
              disabled={joining}
            />
            <Button type="submit" disabled={!classCode.trim() || joining}>
              {joining ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Join <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
