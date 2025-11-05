import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, Mic, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function InstructorOnboarding() {
  const [step, setStep] = useState(1);
  const [courseTitle, setCourseTitle] = useState("");
  const [schedule, setSchedule] = useState("");
  const [topics, setTopics] = useState("");
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [audioPermission, setAudioPermission] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const handleSyllabusUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSyllabusFile(e.target.files[0]);
      toast({ title: "Syllabus uploaded", description: e.target.files[0].name });
    }
  };

  const handleAudioSetup = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setAudioPermission(true);
      toast({ title: "Audio access granted", description: "Ready to capture lectures" });
    } catch (error) {
      toast({ 
        title: "Audio access denied", 
        description: "Please allow microphone access",
        variant: "destructive" 
      });
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!courseTitle) {
        toast({ title: "Please enter course title", variant: "destructive" });
        return;
      }
      if (!schedule) {
        toast({ title: "Please enter class schedule", variant: "destructive" });
        return;
      }
      if (!topics) {
        toast({ title: "Please enter key topics", variant: "destructive" });
        return;
      }
    }
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleFinish = async () => {
    if (!audioPermission) {
      toast({ title: "Please set up audio access", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update instructor profile with course info
      const { error } = await supabase
        .from('profiles')
        .update({
          course_title: courseTitle,
          course_schedule: schedule,
          course_topics: topics.split(',').map(t => t.trim()),
          onboarded: true,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({ title: "Setup complete!", description: "Ready to start lectures" });
      navigate('/instructor/dashboard');
    } catch (error: any) {
      console.error('Onboarding error:', error);
      toast({ 
        title: "Failed to complete setup", 
        description: error.message,
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/5 to-secondary/10 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Instructor Setup</CardTitle>
          <CardDescription>
            Configure your lecture capture and engagement system
          </CardDescription>
          <Progress value={progress} className="mt-4" />
          <p className="text-sm text-muted-foreground mt-2">
            Step {step} of {totalSteps}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Course Information</h3>
              <div className="space-y-2">
                <Label htmlFor="courseTitle">Course Title *</Label>
                <Input
                  id="courseTitle"
                  placeholder="e.g., Introduction to Computer Science"
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule">Class Schedule *</Label>
                <Input
                  id="schedule"
                  placeholder="e.g., Mon/Wed/Fri 10:00-11:30 AM"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topics">Key Topics (comma-separated) *</Label>
                <Textarea
                  id="topics"
                  placeholder="e.g., algorithms, data structures, python, object-oriented programming"
                  value={topics}
                  onChange={(e) => setTopics(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Syllabus & Outline (Optional)</h3>
              <p className="text-sm text-muted-foreground">
                Upload your syllabus to help generate more relevant questions
              </p>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <Label htmlFor="syllabusUpload" className="cursor-pointer">
                  <Button variant="outline" asChild>
                    <span>Choose File</span>
                  </Button>
                </Label>
                <Input
                  id="syllabusUpload"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleSyllabusUpload}
                  className="hidden"
                />
                {syllabusFile && (
                  <p className="text-sm text-green-600 mt-4 flex items-center justify-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {syllabusFile.name}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Audio Setup</h3>
              <p className="text-sm text-muted-foreground">
                Grant microphone access to enable lecture capture and transcription
              </p>
              <div className="border rounded-lg p-6 text-center space-y-4">
                <Mic className={`h-16 w-16 mx-auto ${audioPermission ? 'text-green-600' : 'text-muted-foreground'}`} />
                {audioPermission ? (
                  <div className="space-y-2">
                    <p className="text-green-600 font-medium flex items-center justify-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Audio Access Granted
                    </p>
                    <p className="text-sm text-muted-foreground">
                      You're ready to capture lectures
                    </p>
                  </div>
                ) : (
                  <Button onClick={handleAudioSetup}>
                    <Mic className="mr-2 h-4 w-4" />
                    Enable Microphone Access
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
            >
              Back
            </Button>
            {step < totalSteps ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button onClick={handleFinish}>
                Finish Setup
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}