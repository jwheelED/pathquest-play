import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, MicOff, CheckCircle, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const AudioSetup = () => {
  const [audioPermission, setAudioPermission] = useState<boolean | null>(null);
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const { toast } = useToast();

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

  const handleAudioSetup = async () => {
    setIsTestingAudio(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      stream.getTracks().forEach(track => track.stop());
      setAudioPermission(true);
      toast({ 
        title: "✅ Audio access granted", 
        description: "Microphone is working properly" 
      });
    } catch (error: any) {
      setAudioPermission(false);
      toast({ 
        title: "❌ Audio access denied", 
        description: error.name === 'NotAllowedError' 
          ? "Please allow microphone access in your browser settings"
          : "Failed to access microphone. Check your device settings.",
        variant: "destructive" 
      });
    } finally {
      setIsTestingAudio(false);
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
            {audioPermission === null ? (
              <Mic className="h-16 w-16 text-muted-foreground" />
            ) : audioPermission ? (
              <CheckCircle className="h-16 w-16 text-green-600" />
            ) : (
              <MicOff className="h-16 w-16 text-destructive" />
            )}
          </div>
          
          {audioPermission === null && (
            <div className="text-center space-y-2">
              <p className="text-sm font-medium">Microphone Status Unknown</p>
              <p className="text-xs text-muted-foreground">
                Test your microphone to ensure lecture capture works properly
              </p>
            </div>
          )}
          
          {audioPermission === true && (
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-green-600">✓ Microphone Ready</p>
              <p className="text-xs text-muted-foreground">
                Your audio is configured and ready for lecture capture
              </p>
            </div>
          )}
          
          {audioPermission === false && (
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
            disabled={isTestingAudio}
            className="flex-1"
          >
            <Mic className="mr-2 h-4 w-4" />
            {isTestingAudio ? "Testing..." : "Test Microphone"}
          </Button>
          <Button 
            onClick={handleCheckPermission}
            variant="outline"
            className="flex-1"
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
