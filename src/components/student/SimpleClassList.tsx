import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { BookOpen, Users, Radio, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClassInfo {
  instructorId: string;
  instructorName: string;
  courseTitle: string;
  isLive: boolean;
  studentCount: number;
}

interface SimpleClassListProps {
  userId: string;
  onClassesLoaded?: (classes: ClassInfo[]) => void;
}

export function SimpleClassList({ userId, onClassesLoaded }: SimpleClassListProps) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchClasses();
  }, [userId]);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      
      // Get all instructor connections
      const { data: connections, error } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", userId);

      if (error) throw error;

      if (!connections || connections.length === 0) {
        setClasses([]);
        onClassesLoaded?.([]);
        return;
      }

      const instructorIds = connections.map(c => c.instructor_id);

      // Fetch instructor details
      const { data: instructors } = await supabase
        .from("profiles")
        .select("id, full_name, course_title")
        .in("id", instructorIds);

      // Check for active live sessions - must be active AND within valid time window
      const now = new Date().toISOString();
      const { data: liveSessions } = await supabase
        .from("live_sessions")
        .select("instructor_id, course_id")
        .in("instructor_id", instructorIds)
        .eq("is_active", true)
        .gt("ends_at", now); // Only count sessions that haven't expired

      const liveInstructors = new Set(liveSessions?.map(s => s.instructor_id) || []);

      // Get student counts per instructor
      const { data: studentCounts } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .in("instructor_id", instructorIds);

      const countMap = new Map<string, number>();
      studentCounts?.forEach(sc => {
        countMap.set(sc.instructor_id, (countMap.get(sc.instructor_id) || 0) + 1);
      });

      const classData: ClassInfo[] = (instructors || []).map(instructor => ({
        instructorId: instructor.id,
        instructorName: instructor.full_name || "Unknown Instructor",
        courseTitle: instructor.course_title || "Untitled Course",
        isLive: liveInstructors.has(instructor.id),
        studentCount: countMap.get(instructor.id) || 0,
      }));

      // Sort with live classes first
      classData.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0));

      setClasses(classData);
      onClassesLoaded?.(classData);
    } catch (error) {
      console.error("Error fetching classes:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-12 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <h3 className="font-medium text-foreground mb-1">No classes yet</h3>
          <p className="text-sm text-muted-foreground">
            Enter a class code above to join your first class
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          My Classes ({classes.length})
        </h2>
      </div>
      
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {classes.map((classInfo) => (
          <Card 
            key={classInfo.instructorId}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              classInfo.isLive && "border-green-500/50 bg-green-500/5"
            )}
            onClick={() => navigate(`/class/${classInfo.instructorId}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{classInfo.courseTitle}</h3>
                    {classInfo.isLive && (
                      <Badge className="bg-green-500 text-white gap-1 animate-pulse">
                        <Radio className="w-3 h-3" />
                        LIVE
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{classInfo.instructorName}</span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {classInfo.studentCount}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
              
              {classInfo.isLive && (
                <Button 
                  size="sm" 
                  className="w-full mt-3 bg-green-600 hover:bg-green-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/join");
                  }}
                >
                  <Radio className="w-4 h-4 mr-2" />
                  Join Live Session
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
