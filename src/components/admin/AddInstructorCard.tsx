import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ConnectedInstructor {
  id: string;
  instructor_id: string;
  full_name: string | null;
  instructor_code: string | null;
}

export const AddInstructorCard = () => {
  const [instructorCode, setInstructorCode] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: connectedInstructors = [], isLoading } = useQuery({
    queryKey: ["admin-instructors"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("admin_instructors")
        .select(`
          id,
          instructor_id,
          profiles!admin_instructors_instructor_id_fkey (
            full_name,
            instructor_code
          )
        `)
        .eq("admin_id", user.id);

      if (error) throw error;

      return data.map((item: any) => ({
        id: item.id,
        instructor_id: item.instructor_id,
        full_name: item.profiles?.full_name,
        instructor_code: item.profiles?.instructor_code,
      })) as ConnectedInstructor[];
    },
  });

  const handleAddInstructor = async () => {
    if (!instructorCode.trim()) {
      toast.error("Please enter an instructor code");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("add_instructor_for_admin", {
        _instructor_code: instructorCode.trim().toUpperCase(),
      });

      if (error) throw error;

      toast.success("Instructor added successfully!");
      setInstructorCode("");
      queryClient.invalidateQueries({ queryKey: ["admin-instructors"] });
    } catch (error: any) {
      console.error("Error adding instructor:", error);
      toast.error(error.message || "Failed to add instructor");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveInstructor = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from("admin_instructors")
        .delete()
        .eq("id", connectionId);

      if (error) throw error;

      toast.success("Instructor removed");
      queryClient.invalidateQueries({ queryKey: ["admin-instructors"] });
    } catch (error: any) {
      console.error("Error removing instructor:", error);
      toast.error("Failed to remove instructor");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Manage Instructors
        </CardTitle>
        <CardDescription>
          Add instructors by entering their instructor codes to view their students and data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter instructor code (e.g., INST-ABC123)"
            value={instructorCode}
            onChange={(e) => setInstructorCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleAddInstructor()}
          />
          <Button onClick={handleAddInstructor} disabled={loading}>
            {loading ? "Adding..." : "Add"}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading instructors...</p>
        ) : connectedInstructors.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Connected Instructors:</p>
            {connectedInstructors.map((instructor) => (
              <div
                key={instructor.id}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div>
                  <p className="font-medium">
                    {instructor.full_name || "Unknown Instructor"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Code: {instructor.instructor_code}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveInstructor(instructor.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No instructors added yet. Add instructors to view their data.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
