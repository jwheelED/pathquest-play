import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Mic, MicOff, CheckCircle, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const AudioSetup = () => {
  const [audioPermission, setAudioPermission] = useState<boolean | null>(null);
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const { toast } = useToast();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const checkAudioPermission = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setAudioPermission(result.state === 'granted');
      return result.state === 'granted';
    } catch (error) {
      console.log('Permission API not available, will try direct access');
      return null;
    }
  };

  useEffect(() => {
    return () => {
      stopAudioTest();
    };
  }, []);

  const stopAudioTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setVolumeLevel(0);
    setIsTestingAudio(false);
  };

  const analyzeAudio = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate average volume level
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const normalizedVolume = Math.min(100, (average / 128) * 100);
    
    setVolumeLevel(normalizedVolume);

    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  };

  const handleAudioSetup = async () => {
    if (isTestingAudio) {
      stopAudioTest();
      toast({ 
        title: "Test stopped",
        description: "Microphone test ended"
      });
      return;
    }

    setIsTestingAudio(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      streamRef.current = stream;

      // Set up Web Audio API for volume analysis
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Start analyzing audio
      analyzeAudio();

      setAudioPermission(true);
      toast({ 
        title: "✅ Testing microphone", 
        description: "Speak to see the volume meter respond" 
      });

      // Auto-stop after 10 seconds
      setTimeout(() => {
        if (isTestingAudio) {
          stopAudioTest();
          toast({ 
            title: "Test complete",
            description: "Microphone is working properly"
          });
        }
      }, 10000);

    } catch (error: any) {
      setAudioPermission(false);
      setIsTestingAudio(false);
      toast({ 
        title: "❌ Audio access denied", 
        description: error.name === 'NotAllowedError' 
          ? "Please allow microphone access in your browser settings"
          : "Failed to access microphone. Check your device settings.",
        variant: "destructive" 
      });
    }
  };

  const handleCheckPermission = async () => {
    const hasPermission = await checkAudioPermission();
    if (hasPermission === true) {
      toast({ 
        title: "✅ Microphone access is enabled",
        description: "Your audio is configured properly"
      });
    } else if (hasPermission === false) {
      toast({ 
        title: "⚠️ Microphone access denied",
        description: "Click 'Test Microphone' to grant access",
        variant: "destructive"
      });
    } else {
      toast({ 
        title: "ℹ️ Click 'Test Microphone' to verify",
        description: "We'll check your microphone access"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Audio Configuration
        </CardTitle>
        <CardDescription>
          Test and configure your microphone for lecture capture
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-lg p-6 bg-muted/30">
          <div className="flex items-center justify-center mb-4">
            {isTestingAudio ? (
              <Mic className={`h-16 w-16 text-primary ${volumeLevel > 10 ? 'animate-pulse' : ''}`} />
            ) : audioPermission === null ? (
              <Mic className="h-16 w-16 text-muted-foreground" />
            ) : audioPermission ? (
              <CheckCircle className="h-16 w-16 text-green-600" />
            ) : (
              <MicOff className="h-16 w-16 text-destructive" />
            )}
          </div>
          
          {isTestingAudio && (
            <div className="space-y-3 mb-4">
              <div className="text-center">
                <p className="text-sm font-medium text-primary">🎤 Testing Microphone...</p>
                <p className="text-xs text-muted-foreground">Speak to see the volume respond</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Volume Level</span>
                  <span className="font-mono font-semibold">{Math.round(volumeLevel)}%</span>
                </div>
                <Progress value={volumeLevel} className="h-3" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Quiet</span>
                  <span>Loud</span>
                </div>
              </div>
            </div>
          )}
          
          {!isTestingAudio && audioPermission === null && (
            <div className="text-center space-y-2">
              <p className="text-sm font-medium">Microphone Status Unknown</p>
              <p className="text-xs text-muted-foreground">
                Test your microphone to ensure lecture capture works properly
              </p>
            </div>
          )}
          
          {!isTestingAudio && audioPermission === true && (
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-green-600">✓ Microphone Ready</p>
              <p className="text-xs text-muted-foreground">
                Your audio is configured and ready for lecture capture
              </p>
            </div>
          )}
          
          {!isTestingAudio && audioPermission === false && (
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-destructive">✗ No Microphone Access</p>
              <p className="text-xs text-muted-foreground">
                Grant microphone access to enable lecture recording
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={handleAudioSetup}
            variant={isTestingAudio ? "destructive" : "default"}
            className="flex-1"
          >
            {isTestingAudio ? (
              <>
                <MicOff className="mr-2 h-4 w-4" />
                Stop Test
              </>
            ) : (
              <>
                <Mic className="mr-2 h-4 w-4" />
                Test Microphone
              </>
            )}
          </Button>
          <Button 
            onClick={handleCheckPermission}
            variant="outline"
            className="flex-1"
            disabled={isTestingAudio}
          >
            <Settings className="mr-2 h-4 w-4" />
            Check Status
          </Button>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-xs text-blue-900 dark:text-blue-200">
            <strong>💡 Tip:</strong> If you're having issues, check your browser's site settings 
            to ensure microphone access is allowed for this website.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
