import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { BookOpen, Plus } from "lucide-react";
import { JoinClassWidget } from "./JoinClassWidget";

interface ClassConnection {
  instructorId: string;
  instructorName: string;
  courseTitle: string;
  instructorCode: string;
}

interface ClassSelectorProps {
  userId: string;
}

export function ClassSelector({ userId }: ClassSelectorProps) {
  const [classes, setClasses] = useState<ClassConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJoinWidget, setShowJoinWidget] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchClasses();
  }, [userId]);

  const fetchClasses = async () => {
    try {
      // Get all instructor connections
      const { data: connections, error } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", userId);

      if (error) throw error;

      if (!connections || connections.length === 0) {
        setClasses([]);
        setLoading(false);
        return;
      }

      // Fetch instructor details for each connection
      const classPromises = connections.map(async (conn) => {
        const { data: instructor } = await supabase
          .from("profiles")
          .select("full_name, course_title, instructor_code")
          .eq("id", conn.instructor_id)
          .single();

        return {
          instructorId: conn.instructor_id,
          instructorName: instructor?.full_name || "Unknown Instructor",
          courseTitle: instructor?.course_title || "No Course Title",
          instructorCode: instructor?.instructor_code || "N/A",
        };
      });

      const classData = await Promise.all(classPromises);
      setClasses(classData);
    } catch (error) {
      console.error("Error fetching classes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClassAdded = () => {
    setShowJoinWidget(false);
    fetchClasses();
  };

  if (loading) {
    return (
      <Card className="border-2 border-border bg-card">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-6 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (classes.length === 0) {
    return (
      <Card className="border-2 border-dashed border-border bg-card/50">
        <CardContent className="p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground mb-2">No Classes Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Join a class to access instructor content, assignments, and class-specific features.
            </p>
          </div>
          {showJoinWidget ? (
            <JoinClassWidget userId={userId} onClassJoined={handleClassAdded} onCancel={() => setShowJoinWidget(false)} />
          ) : (
            <Button onClick={() => setShowJoinWidget(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Join a Class
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          📚 My Classes
        </h2>
        {!showJoinWidget && (
          <Button variant="outline" size="sm" onClick={() => setShowJoinWidget(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Class
          </Button>
        )}
      </div>

      {showJoinWidget && (
        <JoinClassWidget userId={userId} onClassJoined={handleClassAdded} onCancel={() => setShowJoinWidget(false)} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {classes.map((classInfo) => (
          <Card
            key={classInfo.instructorId}
            className="border-2 border-primary/30 bg-gradient-to-br from-card to-primary/5 hover:border-primary/60 transition-all cursor-pointer"
            onClick={() => navigate(`/class/${classInfo.instructorId}`)}
          >
            <CardContent className="p-6 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {classInfo.courseTitle}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Instructor: {classInfo.instructorName}
                  </p>
                </div>
                <BookOpen className="w-5 h-5 text-primary flex-shrink-0" />
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Class Code: <code className="font-mono text-foreground">{classInfo.instructorCode}</code>
                </p>
              </div>
              <Button variant="secondary" size="sm" className="w-full mt-2">
                View Class Dashboard →
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
