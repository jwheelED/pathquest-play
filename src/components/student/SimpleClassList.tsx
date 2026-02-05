import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { BookOpen, Users, Radio, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClassInfo {
  enrollmentId: string;
  instructorId: string;
  instructorName: string;
  courseId: string | null;
  courseTitle: string;
  courseCode: string;
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
      
      // Get all student enrollments with course_id
      const { data: enrollments, error } = await supabase
        .from("instructor_students")
        .select("id, instructor_id, course_id")
        .eq("student_id", userId);

      if (error) throw error;

      if (!enrollments || enrollments.length === 0) {
        setClasses([]);
        onClassesLoaded?.([]);
        return;
      }

      // Separate enrollments by whether they have course_id or not
      const courseEnrollments = enrollments.filter(e => e.course_id);
      const legacyEnrollments = enrollments.filter(e => !e.course_id);
      
      const classData: ClassInfo[] = [];

      // Fetch course-specific enrollments
      if (courseEnrollments.length > 0) {
        const courseIds = courseEnrollments.map(e => e.course_id).filter(Boolean) as string[];
        
        const { data: courses } = await supabase
          .from("courses")
          .select("id, title, course_code, instructor_id")
          .in("id", courseIds);

        const instructorIds = [...new Set(courses?.map(c => c.instructor_id) || [])];
        
        const { data: instructors } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", instructorIds);

        const instructorMap = new Map(instructors?.map(i => [i.id, i.full_name]) || []);

        // Check for active live sessions
        const now = new Date().toISOString();
        const { data: liveSessions } = await supabase
          .from("live_sessions")
          .select("course_id")
          .in("course_id", courseIds)
          .eq("is_active", true)
          .gt("ends_at", now);

        const liveCourseIds = new Set(liveSessions?.map(s => s.course_id) || []);

        // Get student counts per course
        const { data: studentCounts } = await supabase
          .from("instructor_students")
          .select("course_id")
          .in("course_id", courseIds);

        const countMap = new Map<string, number>();
        studentCounts?.forEach(sc => {
          if (sc.course_id) {
            countMap.set(sc.course_id, (countMap.get(sc.course_id) || 0) + 1);
          }
        });

        courses?.forEach(course => {
          const enrollment = courseEnrollments.find(e => e.course_id === course.id);
          if (enrollment) {
            classData.push({
              enrollmentId: enrollment.id,
              instructorId: course.instructor_id,
              instructorName: instructorMap.get(course.instructor_id) || "Unknown Instructor",
              courseId: course.id,
              courseTitle: course.title,
              courseCode: course.course_code,
              isLive: liveCourseIds.has(course.id),
              studentCount: countMap.get(course.id) || 0,
            });
          }
        });
      }

      // Fetch legacy enrollments (instructor-based, no course_id)
      if (legacyEnrollments.length > 0) {
        const instructorIds = legacyEnrollments.map(e => e.instructor_id);
        
        const { data: instructors } = await supabase
          .from("profiles")
          .select("id, full_name, course_title, instructor_code")
          .in("id", instructorIds);

        // Check for active live sessions for legacy instructors
        const now = new Date().toISOString();
        const { data: liveSessions } = await supabase
          .from("live_sessions")
          .select("instructor_id")
          .in("instructor_id", instructorIds)
          .eq("is_active", true)
          .gt("ends_at", now);

        const liveInstructorIds = new Set(liveSessions?.map(s => s.instructor_id) || []);

        // Get student counts per instructor (legacy)
        const { data: studentCounts } = await supabase
          .from("instructor_students")
          .select("instructor_id")
          .in("instructor_id", instructorIds)
          .is("course_id", null);

        const countMap = new Map<string, number>();
        studentCounts?.forEach(sc => {
          countMap.set(sc.instructor_id, (countMap.get(sc.instructor_id) || 0) + 1);
        });

        instructors?.forEach(instructor => {
          const enrollment = legacyEnrollments.find(e => e.instructor_id === instructor.id);
          if (enrollment) {
            classData.push({
              enrollmentId: enrollment.id,
              instructorId: instructor.id,
              instructorName: instructor.full_name || "Unknown Instructor",
              courseId: null,
              courseTitle: instructor.course_title || "Untitled Course",
              courseCode: instructor.instructor_code || "N/A",
              isLive: liveInstructorIds.has(instructor.id),
              studentCount: countMap.get(instructor.id) || 0,
            });
          }
        });
      }

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

  const handleClassClick = (classInfo: ClassInfo) => {
    // Navigate with course_id if available, otherwise use instructor_id for legacy
    if (classInfo.courseId) {
      navigate(`/class/${classInfo.instructorId}?course=${classInfo.courseId}`);
    } else {
      navigate(`/class/${classInfo.instructorId}`);
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
            key={classInfo.enrollmentId}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              classInfo.isLive && "border-green-500/50 bg-green-500/5"
            )}
            onClick={() => handleClassClick(classInfo)}
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
