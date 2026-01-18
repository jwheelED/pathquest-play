import { useState } from "react";
import { Code, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useCourseContext } from "@/hooks/useCourseContext";
import { cn } from "@/lib/utils";

interface CreateCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCourseDialog({ open, onOpenChange }: CreateCourseDialogProps) {
  const { createCourse, selectCourse } = useCourseContext();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topics, setTopics] = useState("");
  const [schedule, setSchedule] = useState("");
  const [courseType, setCourseType] = useState<"stem" | "humanities">("stem");

  const handleSubmit = async () => {
    if (!title.trim()) return;

    setLoading(true);
    const newCourse = await createCourse({
      title: title.trim(),
      description: description.trim() || undefined,
      topics: topics.split(",").map(t => t.trim()).filter(Boolean),
      schedule: schedule.trim() || undefined,
      course_type: courseType,
    });

    setLoading(false);

    if (newCourse) {
      selectCourse(newCourse.id);
      resetForm();
      onOpenChange(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setTopics("");
    setSchedule("");
    setCourseType("stem");
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Course</DialogTitle>
          <DialogDescription>
            Add a new course to your account. Each gets a unique join code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3">
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-sm">Course Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Introduction to Computer Science"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-sm">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief course description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schedule" className="text-sm">Class Schedule</Label>
            <Input
              id="schedule"
              placeholder="e.g., Mon/Wed/Fri 10:00-11:30 AM"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="topics" className="text-sm">Key Topics (comma-separated)</Label>
            <Textarea
              id="topics"
              placeholder="e.g., algorithms, data structures, python"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Course Category</Label>
            <div className="grid grid-cols-2 gap-2">
              <Card 
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  courseType === "stem" && "ring-2 ring-primary"
                )}
                onClick={() => setCourseType("stem")}
              >
                <CardContent className="p-3 text-center">
                  <Code className="h-6 w-6 mx-auto text-blue-500 mb-1" />
                  <p className="font-medium text-xs">STEM / Technical</p>
                </CardContent>
              </Card>
              
              <Card 
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  courseType === "humanities" && "ring-2 ring-primary"
                )}
                onClick={() => setCourseType("humanities")}
              >
                <CardContent className="p-3 text-center">
                  <BookOpen className="h-6 w-6 mx-auto text-amber-500 mb-1" />
                  <p className="font-medium text-xs">Humanities</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || loading} size="sm">
            {loading ? "Creating..." : "Create Course"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
