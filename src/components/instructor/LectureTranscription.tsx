import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Radio, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface LectureTranscriptionProps {
  onQuestionGenerated: () => void;
}

export const LectureTranscription = ({ onQuestionGenerated }: LectureTranscriptionProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const transcriptBufferRef = useRef<string>("");
  const { toast } = useToast();

  useEffect(() => {
    // Auto-generate questions every 2 minutes during lecture
    if (isRecording && transcript.length > 200) {
      const interval = setInterval(() => {
        handleGenerateQuestions();
      }, 120000); // 2 minutes
      return () => clearInterval(interval);
    }
  }, [isRecording, transcript]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          // Process chunks every 30 seconds
          if (chunks.length >= 30) {
            processAudioChunk(new Blob(chunks, { type: 'audio/webm' }));
            chunks.length = 0;
          }
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      toast({ title: "Recording started", description: "Lecture audio is being captured" });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({ title: "Failed to start recording", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      toast({ title: "Recording stopped" });
    }
  };

  const processAudioChunk = async (audioBlob: Blob) => {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result?.toString().split(',')[1];
        if (!base64Audio) return;

        const { data, error } = await supabase.functions.invoke('transcribe-lecture', {
          body: { audio: base64Audio }
        });

        if (error) throw error;
        
        if (data?.text) {
          transcriptBufferRef.current += " " + data.text;
          setTranscript(transcriptBufferRef.current);
        }
      };
    } catch (error) {
      console.error('Transcription error:', error);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!transcript.trim() || transcript.length < 100) {
      toast({ title: "Not enough content", description: "Continue lecturing to generate questions" });
      return;
    }

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get course context from instructor profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('course_title, course_topics')
        .eq('id', user.id)
        .single();

      const { data: functionData, error: functionError } = await supabase.functions.invoke('generate-lecture-questions', {
        body: { 
          transcript: transcript.slice(-1000), // Last 1000 chars for context
          courseContext: profile || {},
        }
      });

      if (functionError) throw functionError;

      // Save to review queue as lecture questions
      const { error: insertError } = await supabase
        .from('lecture_questions')
        .insert([{
          instructor_id: user.id,
          transcript_snippet: transcript.slice(-500),
          questions: functionData.questions,
          status: 'pending'
        }]);

      if (insertError) throw insertError;

      toast({ title: "Questions generated!", description: "Check review queue to send to students" });
      onQuestionGenerated();
    } catch (error: any) {
      console.error('Question generation error:', error);
      toast({ 
        title: "Failed to generate questions", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isRecording ? <Radio className="h-5 w-5 text-red-500 animate-pulse" /> : <Mic className="h-5 w-5" />}
          Live Lecture Capture
        </CardTitle>
        <CardDescription>
          {isRecording ? "Recording and transcribing in real-time" : "Start recording your lecture"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
            className="flex-1"
          >
            {isRecording ? (
              <>
                <MicOff className="mr-2 h-4 w-4" />
                Stop Recording
              </>
            ) : (
              <>
                <Mic className="mr-2 h-4 w-4" />
                Start Recording
              </>
            )}
          </Button>
          <Button 
            onClick={handleGenerateQuestions}
            disabled={!transcript || isProcessing || transcript.length < 100}
            variant="secondary"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Questions"
            )}
          </Button>
        </div>

        {isRecording && (
          <Badge variant="outline" className="w-full justify-center py-2">
            <Radio className="mr-2 h-3 w-3 text-red-500 animate-pulse" />
            Live
          </Badge>
        )}

        {transcript && (
          <div className="border rounded-lg p-4 max-h-48 overflow-y-auto bg-muted/30">
            <p className="text-sm font-medium mb-2">Transcript:</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {transcript || "Waiting for audio..."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};