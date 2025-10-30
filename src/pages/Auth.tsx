"use client";

import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { studentSignUpSchema, signInSchema } from "@/lib/validation";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [instructorCode, setInstructorCode] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [session, setSession] = useState(null);

  const navigate = useNavigate();

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAuth();
    }
  };

  const handleAuth = async () => {
    setError("");
    setSuccess("");

    if (isSignUp) {
      // Validate student signup inputs
      const validationResult = studentSignUpSchema.safeParse({
        email: email.trim(),
        password,
        name: name.trim(),
        phone: phone.trim() || undefined,
        age: age ? parseInt(age) : undefined,
        instructorCode: instructorCode.trim().toUpperCase() || undefined
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
      });

      if (error) {
        setError(error.message);
        return;
      }

      const user = data.user;
      if (user) {
        // Create user profile
        const { error: insertError } = await supabase.from("users").insert({
          id: user.id,
          user_id: user.id,
          name: validData.name,
          email: validData.email,
          phone: validData.phone || null,
          age: validData.age || null,
        });

        // Create user stats for gamification
        const { error: statsError } = await supabase.from("user_stats").insert({
          user_id: user.id,
        });

        if (insertError) {
          toast.error("Error creating user profile");
        }
        if (statsError) {
          toast.error("Error creating user stats");
        }

        // Link to instructor if code provided
        if (validData.instructorCode) {
          // Use validate_instructor_code RPC function
          const { data: instructorId, error: validateError } = await supabase
            .rpc("validate_instructor_code", { code: validData.instructorCode });

          if (instructorId) {
            const { error: linkError } = await supabase
              .from("instructor_students")
              .insert({
                instructor_id: instructorId,
                student_id: user.id,
              });

            if (linkError) {
              toast.error("Valid code, but failed to link to instructor");
            } else {
              toast.success("Successfully linked to instructor!");
            }
          } else {
            toast.error("Invalid instructor code");
          }
        }
        
        setSuccess("Sign-up email sent!");
        navigate("/onboarding");
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

      const { error } = await supabase.auth.signInWithPassword({ 
        email: validationResult.data.email, 
        password: validationResult.data.password 
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess("Signed in successfully!");
        // Check if user has completed onboarding
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("onboarded")
            .eq("id", user.id)
            .single();
          
          if (profile?.onboarded) {
            navigate("/dashboard");
          } else {
            navigate("/onboarding");
          }
        }
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  const fetchSession = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (!error) {
      setSession(data.session);
    }
  };

  useEffect(() => {
    fetchSession();

    const {data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      
      setSession(session);

      if (session) {
        const checkOnboarding = async () => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("onboarded")
            .eq("id", session.user.id)
            .maybeSingle();

          if (profile?.onboarded) {
            navigate("/dashboard");
          } else {
            navigate("/onboarding");
          }
        };

        checkOnboarding();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-primary/10 px-4">
      <div className="w-full max-w-md p-8 bg-card shadow-glow border border-primary-glow rounded-xl">
        {session ? (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-center text-foreground">You are signed in</h2>
            <p className="text-center text-sm mb-4 text-muted-foreground">{session.user.email}</p>
            <button
              onClick={handleLogout}
              className="w-full bg-destructive text-destructive-foreground p-2 rounded-lg hover:bg-destructive/90 transition"
            >
              Logout
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-6 text-center text-primary">
              {isSignUp ? "Create an account" : "Sign in to your account"}
            </h2>

            {error && <p className="text-destructive mb-4 text-sm">{error}</p>}
            {success && <p className="text-primary mb-4 text-sm">{success}</p>}

            {isSignUp && (
              <>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full mb-4 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="text"
                  placeholder="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full mb-4 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="number"
                  placeholder="Age"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full mb-4 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="text"
                  placeholder="Instructor Code (Optional)"
                  value={instructorCode}
                  onChange={(e) => setInstructorCode(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full mb-4 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </>
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full mb-4 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full mb-6 p-2 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <button
              onClick={handleAuth}
              className="w-full bg-primary text-primary-foreground p-2 rounded-lg hover:bg-primary/90 transition font-semibold shadow-glow"
            >
              {isSignUp ? "Sign Up" : "Sign In"}
            </button>

            <p className="mt-4 text-sm text-center text-foreground">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-primary hover:underline font-semibold"
              >
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </p>
            <p className="mt-4 text-sm text-center text-muted-foreground">
              <Link to="/" className="text-primary hover:underline">
                ← Back to Home
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}