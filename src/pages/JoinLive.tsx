import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Radio } from "lucide-react";
import { trackSessionJoined } from "@/lib/posthogTracking";

const JoinLive = () => {
  const [searchParams] = useSearchParams();
  const prefillCode = searchParams.get("code") || "";
  const [sessionCode, setSessionCode] = useState(prefillCode);
  const [nickname, setNickname] = useState("");
  const [step, setStep] = useState<"code" | "nickname">(prefillCode.length === 6 ? "nickname" : "code");
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

    // Proceed to nickname step - validation happens in edge function
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
      
      // Track session join in PostHog
      trackSessionJoined(sessionCode.toUpperCase(), nickname.trim());

      toast.success("Joined successfully!");
      navigate(`/live/${sessionCode.toUpperCase()}`);
    } catch (error: any) {
      console.error("Error joining session:", error);
      
      let errorMessage = "Failed to join session";
      
      if (error instanceof FunctionsHttpError) {
        try {
          const errorData = await error.context.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = error.message || errorMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main id="main-content" aria-label="Join live session" className="min-h-screen flex flex-col items-center justify-center mastery-bg p-4">
      {/* Ambient glow */}
      <div aria-hidden="true" className="absolute top-[-20%] left-[30%] w-[500px] h-[500px] rounded-full opacity-[0.04] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(160, 50%, 45%), transparent 70%)' }} />
      
      <div className="w-full max-w-md space-y-4 relative z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="gap-2 rounded-full text-charcoal-muted hover:text-charcoal hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        
        <div className="command-card p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Radio className="w-5 h-5 text-emerald-600" />
            </div>
            <h1 className="text-xl font-semibold text-charcoal mb-1">Join Live Session</h1>
            <p className="text-sm text-charcoal-muted">
              {step === "code" 
                ? "Enter the 6-digit code from your instructor" 
                : "Choose a nickname to identify yourself"}
            </p>
          </div>
          
          {step === "code" ? (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-xs font-medium text-charcoal-muted uppercase tracking-wide">
                  Session Code
                </Label>
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
                  className="text-center text-2xl tracking-[0.5em] font-mono h-14 border-slate-200 focus:border-emerald-300 focus:ring-emerald-200"
                  autoFocus
                />
                <p className="text-xs text-charcoal-subtle text-center">
                  Live session codes are 6 digits
                </p>
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium" 
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
                <Label htmlFor="nickname" className="text-xs font-medium text-charcoal-muted uppercase tracking-wide">
                  Your Nickname
                </Label>
                <Input
                  id="nickname"
                  placeholder="Enter your name"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={30}
                  className="h-11 border-slate-200 focus:border-emerald-300 focus:ring-emerald-200"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Button 
                  type="submit" 
                  className="w-full h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
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
                  className="w-full h-10 rounded-full text-charcoal-muted hover:text-charcoal hover:bg-slate-50"
                  onClick={() => setStep("code")}
                  disabled={isLoading}
                >
                  Back
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
};

export default JoinLive;