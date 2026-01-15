import { useState } from "react";
import { Check, ChevronsUpDown, Plus, BookOpen, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useCourseContext } from "@/hooks/useCourseContext";
import { CreateCourseDialog } from "./CreateCourseDialog";

export function CourseSelector() {
  const { courses, selectedCourseId, selectedCourse, loading, selectCourse } = useCourseContext();
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const activeCourses = courses.filter(c => c.is_active);
  const archivedCourses = courses.filter(c => !c.is_active);

  if (loading) {
    return (
      <Button variant="outline" className="w-[240px] justify-between" disabled>
        <span className="text-muted-foreground">Loading courses...</span>
      </Button>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[240px] justify-between"
          >
            <div className="flex items-center gap-2 truncate">
              <BookOpen className="h-4 w-4 shrink-0 text-primary" />
              {selectedCourse ? (
                <span className="truncate">{selectedCourse.title}</span>
              ) : (
                <span className="text-muted-foreground">Select course...</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search courses..." />
            <CommandList>
              <CommandEmpty>No courses found.</CommandEmpty>
              
              {activeCourses.length > 0 && (
                <CommandGroup heading="Active Courses">
                  {activeCourses.map((course) => (
                    <CommandItem
                      key={course.id}
                      value={course.title}
                      onSelect={() => {
                        selectCourse(course.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedCourseId === course.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex-1 truncate">
                        <span className="block truncate">{course.title}</span>
                        <span className="text-xs text-muted-foreground block truncate">
                          Code: {course.course_code}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {archivedCourses.length > 0 && (
                <CommandGroup heading="Archived">
                  {archivedCourses.map((course) => (
                    <CommandItem
                      key={course.id}
                      value={course.title}
                      onSelect={() => {
                        selectCourse(course.id);
                        setOpen(false);
                      }}
                      className="opacity-60"
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      <div className="flex-1 truncate">
                        <span className="block truncate">{course.title}</span>
                        <Badge variant="secondary" className="text-xs mt-0.5">
                          Archived
                        </Badge>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setCreateDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Course
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateCourseDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
      />
    </>
  );
}
