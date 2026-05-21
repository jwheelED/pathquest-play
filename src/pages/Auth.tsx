// CRITICAL PATH #1 — Authentication. See CRITICAL_PATHS.md.
// Invariants enforced by src/lib/__tests__/validation.test.ts and
// src/components/__tests__/ProtectedRoute.test.tsx.
// Before editing: read CRITICAL_PATHS.md §1. After editing: run `bun run test:auth`.
"use client";

import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { studentSignUpSchema, signInSchema } from "@/lib/validation";
import { getOrgId } from "@/hooks/useOrgId";
import { Label } from "@/components/ui/label";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [session, setSession] = useState(null);
  const [isResetMode, setIsResetMode] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const isRecoveryModeRef = useRef(false);
  const isHandlingAuthRef = useRef(false);

  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const redirectTo = searchParams.get("redirect");

  const handlePasswordUpdate = async () => {
    setError("");
    setSuccess("");

    if (!newPassword || newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      toast.error("Password must be at least 8 characters");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    
    if (error) {
      setError(error.message);
      toast.error(error.message);
    } else {
      setSuccess("Password updated successfully!");
      toast.success("Password updated successfully! Please sign in.");
      isRecoveryModeRef.current = false;
      setIsRecoveryMode(false);
      setNewPassword("");
      await supabase.auth.signOut();
    }
  };

  // Helper to navigate user to the correct dashboard based on their role + onboarding state
  const navigateByRole = async (userId: string) => {
    // Check roles in order of priority: admin > instructor > student
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (isAdmin) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id, onboarded')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.org_id && profile?.onboarded) {
        navigate("/admin/dashboard");
      } else {
        navigate("/admin/onboarding");
      }
      return;
    }

    const { data: isInstructor } = await supabase.rpc('has_role', { _user_id: userId, _role: 'instructor' });
    if (isInstructor) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id, onboarded')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.onboarded === true) {
        navigate("/instructor/dashboard");
      } else if (!profile?.org_id) {
        navigate("/instructor/org-onboarding");
      } else {
        navigate("/instructor/onboarding");
      }
      return;
    }

    // Default to student dashboard
    navigate("/dashboard");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAuth();
    }
  };

  const handleAuth = async () => {
    setError("");
    setSuccess("");
    isHandlingAuthRef.current = true;

    try {
      if (isSignUp) {
        // Validate student signup inputs
        const validationResult = studentSignUpSchema.safeParse({
          email: email.trim(),
          password,
          name: name.trim(),
          instructorCode: '' // Not collected during auth
        });

        if (!validationResult.success) {
          const firstError = validationResult.error.errors[0];
          setError(firstError.message);
          toast.error(firstError.message);
          return;
        }

        const validData = validationResult.data;

        const { data, error } = await supabase.auth.signUp({
          email: validData.email,
          password: validData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`,
            data: {
              full_name: validData.name
            }
          }
        });

        if (error) {
          // Check if user already exists
          if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('user already exists')) {
            setError('This email is already registered. Please sign in instead.');
            toast.error('This email is already registered. Please sign in instead.');
          } else {
            setError(error.message);
            toast.error(error.message);
          }
          return;
        }

        const user = data.user;
        if (user) {
          // Profile is created by the handle_new_user trigger (with onboarded=true
          // from user_metadata). Do NOT upsert from the client — it races with the
          // trigger and overwrites trigger-managed fields.

          // user_stats may also be created by the trigger; use upsert to avoid 23505 collisions.
          const { error: statsError } = await supabase
            .from("user_stats")
            .upsert({ user_id: user.id, org_id: null }, { onConflict: "user_id", ignoreDuplicates: true });
          if (statsError) {
            console.error("Stats creation error:", statsError);
          }

          setSuccess("Account created! Please check your email to confirm your account.");
          toast.success("Account created! Check your email to confirm before signing in.");
          setIsSignUp(false); // Switch to sign-in mode
        }
      } else {
        // Validate sign-in inputs
        const validationResult = signInSchema.safeParse({
          email: email.trim(),
          password
        });

        if (!validationResult.success) {
          const firstError = validationResult.error.errors[0];
          setError(firstError.message);
          toast.error(firstError.message);
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ 
          email: validationResult.data.email, 
          password: validationResult.data.password 
        });

        if (error) {
          // Check for email not confirmed error
          if (error.message.toLowerCase().includes('email not confirmed') || 
              error.message.toLowerCase().includes('verify your email')) {
            setError('Please confirm your email before signing in. Check your inbox for the confirmation link.');
            toast.error('Please confirm your email before signing in. Check your inbox for the confirmation link.');
          } else if (error.message.toLowerCase().includes('invalid login credentials')) {
            // Could be wrong password OR unconfirmed email
            setError('Invalid email or password. If you just signed up, please confirm your email first.');
            toast.error('Invalid email or password. If you just signed up, please confirm your email first.');
          } else {
            setError(error.message);
            toast.error(error.message);
          }
        } else {
          setSuccess("Signed in successfully!");
          // If there's a redirect (e.g. from live session), go there
          if (redirectTo) {
            navigate(redirectTo);
          } else {
            // Navigate based on user role
            await navigateByRole(data.user.id);
          }
        }
      }
    } finally {
      // Hold the lock briefly so the async SIGNED_IN listener (which fires after
      // signInWithPassword resolves) sees it as still set and skips a duplicate navigate.
      setTimeout(() => { isHandlingAuthRef.current = false; }, 1500);
    }
  };

  const handlePasswordReset = async () => {
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Please enter your email address");
      toast.error("Please enter your email address");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth`,
    });

    if (error) {
      setError(error.message);
      toast.error(error.message);
    } else {
      setSuccess("Password reset link sent! Check your email.");
      toast.success("Password reset link sent! Check your email.");
      setIsResetMode(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  // Single consolidated auth lifecycle effect
  useEffect(() => {
    // Check URL hash on mount for recovery token (synchronous)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') {
      isRecoveryModeRef.current = true;
      setIsRecoveryMode(true);
      toast.info("Please enter your new password");
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Handle recovery FIRST, before any navigation logic
      if (event === 'PASSWORD_RECOVERY') {
        isRecoveryModeRef.current = true;
        setIsRecoveryMode(true);
        toast.info("Please enter your new password");
        return;
      }

      // If in recovery mode, suppress all navigation/session logic
      if (isRecoveryModeRef.current) {
        return;
      }

      setSession(session);

      if (session) {
        // Skip if handleAuth is already managing sign-in navigation
        if (isHandlingAuthRef.current) {
          return;
        }

        // Only auto-navigate for OAuth callbacks (has code/token in URL)
        // Otherwise, show "You are signed in" screen so user can switch accounts
        const urlParams = new URLSearchParams(window.location.search);
        const hasOAuthCallback = urlParams.has('code') || window.location.hash.includes('access_token');
        
        if (!hasOAuthCallback && event === 'INITIAL_SESSION') {
          // User navigated to /auth while already logged in - don't auto-redirect
          // They can see "You are signed in" and logout to switch accounts
          return;
        }

        const initializeUser = async () => {
          // Only auto-provision/onboard student-role users here. Instructors and
          // admins have their own onboarding flows and must not be marked onboarded
          // by this generic path (would skip /instructor/org-onboarding etc.).
          const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' });
          const { data: isInstructor } = await supabase.rpc('has_role', { _user_id: session.user.id, _role: 'instructor' });
          const isStudent = !isAdmin && !isInstructor;

          if (isStudent) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, onboarded")
              .eq("id", session.user.id)
              .maybeSingle();

            if (!profile) {
              await supabase.from("profiles").upsert({
                id: session.user.id,
                full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || "Student",
                onboarded: true,
              });

              await supabase
                .from("user_stats")
                .upsert({ user_id: session.user.id, org_id: null }, { onConflict: "user_id", ignoreDuplicates: true });
            } else if (!profile.onboarded) {
              await supabase.from("profiles").update({ onboarded: true }).eq("id", session.user.id);
            }
          }

          await navigateByRole(session.user.id);
        };

        // Use setTimeout to avoid Supabase auth deadlock
        setTimeout(initializeUser, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-5 py-12" style={{ background: 'hsl(210, 20%, 98%)' }}>
      {/* Ambient glows */}
      <div className="absolute top-[-15%] right-[25%] w-[450px] h-[450px] rounded-full opacity-[0.05] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(160, 84%, 42%), transparent 70%)' }} />
      <div className="absolute bottom-[-10%] left-[30%] w-[350px] h-[350px] rounded-full opacity-[0.035] pointer-events-none" style={{ background: 'radial-gradient(circle, hsl(199, 89%, 60%), transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="bg-card rounded-2xl border border-border/50 shadow-[0_1px_3px_0_hsl(220_25%_15%/0.04),0_8px_28px_-6px_hsl(220_25%_15%/0.06)] px-7 py-9 sm:px-9 sm:py-10">
          {session ? (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold tracking-tight text-center text-foreground">You are signed in</h2>
              <p className="text-center text-[13px] text-muted-foreground">{session.user.email}</p>
              <button
                onClick={() => navigateByRole(session.user.id)}
                className="w-full h-[42px] bg-primary text-primary-foreground rounded-[10px] hover:bg-primary/90 transition-all font-medium text-sm shadow-sm"
              >
                Go to Dashboard
              </button>
              <button
                onClick={handleLogout}
                className="w-full h-[42px] bg-destructive text-destructive-foreground rounded-[10px] hover:bg-destructive/90 transition-all font-medium text-sm"
              >
                Sign out &amp; switch account
              </button>
            </div>
          ) : isRecoveryMode ? (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Set your new password
                </h2>
              </div>

              {error && <div role="alert" className="text-destructive text-[13px] leading-snug">{error}</div>}
              {success && <div role="status" className="text-primary text-[13px] leading-snug">{success}</div>}

              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-[0.08em]">New Password</Label>
                <input
                  id="new-password"
                  type="password"
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handlePasswordUpdate()}
                  className="w-full h-[42px] px-3.5 text-sm border border-border/60 bg-background text-foreground rounded-[10px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>

              <button
                onClick={handlePasswordUpdate}
                className="w-full h-[42px] bg-primary text-primary-foreground rounded-[10px] hover:bg-primary/90 transition-all font-medium text-sm shadow-sm"
              >
                Update Password
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Header */}
              <div className="text-center pb-1">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {isResetMode ? "Reset your password" : isSignUp ? "Create an account" : "Welcome back"}
                </h2>
                {!isResetMode && (
                  <p className="text-[13px] text-muted-foreground/70 mt-1.5">
                    {isSignUp ? "Sign up to start learning" : "Sign in to continue"}
                  </p>
                )}
              </div>

              {/* Prominent Sign In / Sign Up tab toggle */}
              {!isResetMode && (
                <div role="tablist" aria-label="Authentication mode" className="grid grid-cols-2 gap-1 p-1 bg-muted/50 border border-border/50 rounded-[10px]">
                  <button
                    role="tab"
                    aria-selected={!isSignUp}
                    onClick={() => { setIsSignUp(false); setError(""); setSuccess(""); }}
                    className={`h-9 rounded-[7px] text-[13px] font-semibold transition-all ${
                      !isSignUp
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    role="tab"
                    aria-selected={isSignUp}
                    onClick={() => { setIsSignUp(true); setError(""); setSuccess(""); }}
                    className={`h-9 rounded-[7px] text-[13px] font-semibold transition-all ${
                      isSignUp
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Create account
                  </button>
                </div>
              )}

              {error && <div role="alert" className="text-destructive text-[13px] leading-snug">{error}</div>}
              {success && <div role="status" className="text-primary text-[13px] leading-snug">{success}</div>}

              {/* Form fields */}
              <div className="space-y-3.5">
                {!isResetMode && isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-[0.08em]">Full Name</Label>
                    <input
                      id="name"
                      type="text"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyPress={handleKeyPress}
                      aria-describedby={error ? "auth-error" : undefined}
                      className="w-full h-[42px] px-3.5 text-sm border border-border/60 bg-background text-foreground rounded-[10px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-[0.08em]">Email</Label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyPress={isResetMode ? (e) => e.key === 'Enter' && handlePasswordReset() : handleKeyPress}
                    aria-describedby={error ? "auth-error" : undefined}
                    className="w-full h-[42px] px-3.5 text-sm border border-border/60 bg-background text-foreground rounded-[10px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                </div>
                {!isResetMode && (
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-[0.08em]">Password</Label>
                    <input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      aria-describedby={error ? "auth-error" : undefined}
                      className="w-full h-[42px] px-3.5 text-sm border border-border/60 bg-background text-foreground rounded-[10px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Primary CTA */}
              <button
                onClick={isResetMode ? handlePasswordReset : handleAuth}
                className="w-full h-[44px] bg-primary text-primary-foreground rounded-[10px] hover:bg-primary/90 transition-all font-semibold text-sm shadow-[0_1px_3px_0_hsl(160_84%_29%/0.25)]"
              >
                {isResetMode ? "Send Reset Link" : isSignUp ? "Sign Up" : "Sign In"}
              </button>

              {!isResetMode && !isSignUp && (
                <button
                  onClick={() => setIsResetMode(true)}
                  className="w-full text-center text-[12px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  Forgot password?
                </button>
              )}

              {!isResetMode && (
                <>
                  <div className="relative my-1.5">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/40" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-card px-3 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/50">Or continue with</span>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      const { error } = await supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: {
                          redirectTo: `${window.location.origin}/auth`,
                        }
                      });
                      if (error) {
                        toast.error(error.message);
                      }
                    }}
                    className="w-full h-[42px] flex items-center justify-center gap-2.5 bg-background border border-border/50 text-foreground rounded-[10px] hover:bg-muted/40 hover:border-border/70 transition-all text-sm font-medium"
                  >
                    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </button>

                </>
              )}

              {isResetMode && (
                <p className="text-[13px] text-center pt-1">
                  <button
                    onClick={() => setIsResetMode(false)}
                    className="text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    ← Back to Sign In
                  </button>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Back link — outside card */}
        {!isRecoveryMode && (
          <p className="text-center mt-8">
            <Link to="/" className="text-[12px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              ← Back to Home
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}