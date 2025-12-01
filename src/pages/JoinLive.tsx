import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const JoinLive = () => {
  const [sessionCode, setSessionCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [step, setStep] = useState<"code" | "nickname">("code");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionCode.trim()) return;

    // Check if code is numeric (live session codes are 6 digits)
    const isNumeric = /^\d{6}$/.test(sessionCode.trim());
    if (!isNumeric) {
      toast.error(
        "Live session codes are 6 digits. Looking to join a class instead?",
        {
          description: "Go to your dashboard to enter an instructor class code",
          action: {
            label: "Go to Dashboard",
            onClick: () => navigate("/auth"),
          },
        }
      );
      return;
    }

    setIsLoading(true);
    
    // Validate session code exists
    const { data, error } = await supabase
      .from("live_sessions")
      .select("id, is_active, ends_at")
      .eq("session_code", sessionCode.toUpperCase())
      .eq("is_active", true)
      .single();

    setIsLoading(false);

    if (error || !data) {
      toast.error("Invalid session code", {
        description: "Make sure your instructor has started a live session and shared the 6-digit code",
      });
      return;
    }

    if (new Date(data.ends_at) < new Date()) {
      toast.error("This session has expired");
      return;
    }

    setStep("nickname");
  };

  const handleNicknameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("join-live-session", {
        body: {
          sessionCode: sessionCode.toUpperCase(),
          nickname: nickname.trim(),
        },
      });

      if (error) throw error;

      // Store participant ID in localStorage
      localStorage.setItem("participantId", data.participant.id);
      localStorage.setItem("participantNickname", nickname.trim());

      toast.success("Joined successfully!");
      navigate(`/live/${sessionCode.toUpperCase()}`);
    } catch (error: any) {
      console.error("Error joining session:", error);
      toast.error(error.message || "Failed to join session");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Join Live Session</CardTitle>
          <CardDescription>
            {step === "code" 
              ? "Your instructor will display a 6-digit code when they start a live Q&A session" 
              : "Choose your nickname"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "code" ? (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Session Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="000000"
                  value={sessionCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    setSessionCode(value);
                  }}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest font-mono"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-center">
                  Live session codes are 6 digits (numbers only)
                </p>
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                size="lg"
                disabled={sessionCode.length !== 6 || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleNicknameSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nickname">Your Nickname</Label>
                <Input
                  id="nickname"
                  placeholder="Enter your name"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={30}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Button 
                  type="submit" 
                  className="w-full" 
                  size="lg"
                  disabled={!nickname.trim() || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Join Session"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("code")}
                  disabled={isLoading}
                >
                  Back
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinLive;