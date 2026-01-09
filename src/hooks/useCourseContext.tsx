import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Course {
  id: string;
  instructor_id: string;
  title: string;
  description: string | null;
  topics: string[];
  schedule: string | null;
  course_type: string | null;
  course_code: string;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CourseContextType {
  courses: Course[];
  selectedCourseId: string | null;
  selectedCourse: Course | null;
  loading: boolean;
  selectCourse: (courseId: string) => void;
  createCourse: (data: CreateCourseData) => Promise<Course | null>;
  updateCourse: (courseId: string, data: Partial<CreateCourseData>) => Promise<boolean>;
  archiveCourse: (courseId: string) => Promise<boolean>;
  refreshCourses: () => Promise<void>;
}

interface CreateCourseData {
  title: string;
  description?: string;
  topics?: string[];
  schedule?: string;
  course_type?: string;
}

const CourseContext = createContext<CourseContextType | null>(null);

export function useCourseContext() {
  const context = useContext(CourseContext);
  if (!context) {
    throw new Error("useCourseContext must be used within a CourseProvider");
  }
  return context;
}

export function CourseProvider({ children }: { children: ReactNode }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedCourse = courses.find(c => c.id === selectedCourseId) || null;

  const fetchCourses = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("instructor_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching courses:", error);
        return;
      }

      setCourses(data || []);

      // Restore last selected course from localStorage or select first active
      const storedCourseId = localStorage.getItem("selectedCourseId");
      const activeCourses = (data || []).filter(c => c.is_active);
      
      if (storedCourseId && activeCourses.some(c => c.id === storedCourseId)) {
        setSelectedCourseId(storedCourseId);
      } else if (activeCourses.length > 0) {
        setSelectedCourseId(activeCourses[0].id);
      }
    } catch (err) {
      console.error("Error in fetchCourses:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const selectCourse = useCallback((courseId: string) => {
    setSelectedCourseId(courseId);
    localStorage.setItem("selectedCourseId", courseId);
  }, []);

  const createCourse = useCallback(async (data: CreateCourseData): Promise<Course | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not authenticated");
        return null;
      }

      const { data: newCourse, error } = await supabase
        .from("courses")
        .insert({
          instructor_id: user.id,
          title: data.title,
          description: data.description || null,
          topics: data.topics || [],
          schedule: data.schedule || null,
          course_type: data.course_type || "stem",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating course:", error);
        toast.error("Failed to create course");
        return null;
      }

      setCourses(prev => [...prev, newCourse]);
      toast.success(`Course "${data.title}" created!`);
      return newCourse;
    } catch (err) {
      console.error("Error in createCourse:", err);
      toast.error("An error occurred");
      return null;
    }
  }, []);

  const updateCourse = useCallback(async (courseId: string, data: Partial<CreateCourseData>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("courses")
        .update({
          title: data.title,
          description: data.description,
          topics: data.topics,
          schedule: data.schedule,
          course_type: data.course_type,
        })
        .eq("id", courseId);

      if (error) {
        console.error("Error updating course:", error);
        toast.error("Failed to update course");
        return false;
      }

      setCourses(prev => prev.map(c => 
        c.id === courseId ? { ...c, ...data } : c
      ));
      toast.success("Course updated!");
      return true;
    } catch (err) {
      console.error("Error in updateCourse:", err);
      toast.error("An error occurred");
      return false;
    }
  }, []);

  const archiveCourse = useCallback(async (courseId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("courses")
        .update({
          is_active: false,
          archived_at: new Date().toISOString(),
        })
        .eq("id", courseId);

      if (error) {
        console.error("Error archiving course:", error);
        toast.error("Failed to archive course");
        return false;
      }

      setCourses(prev => prev.map(c => 
        c.id === courseId ? { ...c, is_active: false, archived_at: new Date().toISOString() } : c
      ));

      // If archived course was selected, select another
      if (selectedCourseId === courseId) {
        const activeCourses = courses.filter(c => c.id !== courseId && c.is_active);
        if (activeCourses.length > 0) {
          selectCourse(activeCourses[0].id);
        } else {
          setSelectedCourseId(null);
        }
      }

      toast.success("Course archived");
      return true;
    } catch (err) {
      console.error("Error in archiveCourse:", err);
      toast.error("An error occurred");
      return false;
    }
  }, [selectedCourseId, courses, selectCourse]);

  const value: CourseContextType = {
    courses,
    selectedCourseId,
    selectedCourse,
    loading,
    selectCourse,
    createCourse,
    updateCourse,
    archiveCourse,
    refreshCourses: fetchCourses,
  };

  return (
    <CourseContext.Provider value={value}>
      {children}
    </CourseContext.Provider>
  );
}

export { CourseContext };
