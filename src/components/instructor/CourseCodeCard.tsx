import { Copy, Settings, Archive, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { useCourseContext } from "@/hooks/useCourseContext";
import { toast } from "sonner";

export function CourseCodeCard() {
  const { selectedCourse, archiveCourse } = useCourseContext();
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  if (!selectedCourse) {
    return null;
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedCourse.course_code);
    setCodeCopied(true);
    toast.success("Join code copied to clipboard ✓");
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleArchive = async () => {
    await archiveCourse(selectedCourse.id);
    setArchiveDialogOpen(false);
  };

  return (
    <>
      <Card className="headspace-card h-fit">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Student Join Code</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleCopyCode}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Join Code
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setArchiveDialogOpen(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Archive Course
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Course settings</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground truncate">
              {selectedCourse.title}
            </p>
            <code className="text-2xl font-bold text-primary bg-primary/5 px-4 py-3 rounded-xl text-center block break-all">
              {selectedCourse.course_code}
            </code>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl"
            onClick={handleCopyCode}
          >
            {codeCopied ? <Check className="w-4 h-4 mr-1 text-success" /> : <Copy className="w-4 h-4 mr-1" />}
            {codeCopied ? "Copied!" : "Copy Join Code"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Students enter this code in Edvana to join your class.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Course?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive "{selectedCourse.title}". Students will no longer be able to join this course. 
              You can still view archived courses but cannot start new sessions for them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>
              Archive Course
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
