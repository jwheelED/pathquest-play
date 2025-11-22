import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface JoinClassWidgetProps {
  userId: string;
  onClassJoined: () => void;
  onCancel?: () => void;
}

export function JoinClassWidget({ userId, onClassJoined, onCancel }: JoinClassWidgetProps) {
  const [classCode, setClassCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoinClass = async () => {
    if (!classCode.trim()) {
      toast.error("Please enter a class code");
      return;
    }

    setLoading(true);
    try {
      // Validate instructor code
      const { data: instructorId, error: validateError } = await supabase
        .rpc("validate_instructor_code", { code: classCode.trim() });

      if (validateError || !instructorId) {
        toast.error("Invalid class code. Please check with your instructor.");
        setLoading(false);
        return;
      }

      // Check if already connected to this instructor
      const { data: existing } = await supabase
        .from("instructor_students")
        .select("id")
        .eq("instructor_id", instructorId)
        .eq("student_id", userId)
        .maybeSingle();

      if (existing) {
        toast.info("You're already enrolled in this class.");
        setLoading(false);
        return;
      }

      // Add new connection (keeps existing connections)
      const { error: insertError } = await supabase
        .from("instructor_students")
        .insert({
          instructor_id: instructorId,
          student_id: userId
        });

      if (insertError) {
        toast.error("Failed to join class. Please try again.");
        console.error(insertError);
        setLoading(false);
        return;
      }

      // Ensure onboarded status
      await supabase
        .from("profiles")
        .update({ onboarded: true })
        .eq("id", userId);

      toast.success("Successfully joined class! 🎉");
      setClassCode("");
      onClassJoined();
    } catch (err) {
      console.error("Error joining class:", err);
      toast.error("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-2 border-primary/40 bg-gradient-to-br from-card to-primary/10">
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Join a New Class</h3>
          <p className="text-sm text-muted-foreground">
            Enter the class code provided by your instructor
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="classCode">Class Code</Label>
          <Input
            id="classCode"
            type="text"
            placeholder="Enter class code"
            value={classCode}
            onChange={(e) => setClassCode(e.target.value.toUpperCase())}
            disabled={loading}
            className="font-mono uppercase"
            maxLength={6}
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleJoinClass}
            disabled={loading || !classCode.trim()}
            className="flex-1"
          >
            {loading ? "Joining..." : "Join Class"}
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
