"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  const handleAuth = async () => {
    setError("");
    setSuccess("");

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
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
          name,
          email,
          phone,
          age: parseInt(age) || null,
        });

        // Create user stats for gamification
        const { error: statsError } = await supabase.from("user_stats").insert({
          user_id: user.id,
        });

        if (insertError) {
          console.error("Insert user error:", insertError.message);
        }
        if (statsError) {
          console.error("Insert user stats error:", statsError.message);
        }

        // Link to instructor if code provided
        if (instructorCode.trim()) {
          const { data: instructorProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("instructor_code", instructorCode.toUpperCase())
            .eq("role", "instructor")
            .maybeSingle();

          if (instructorProfile) {
            const { error: linkError } = await supabase
              .from("instructor_students")
              .insert({
                instructor_id: instructorProfile.id,
                student_id: user.id,
              });

            if (linkError) {
              console.error("Error linking to instructor:", linkError.message);
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });

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
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md p-8 bg-white shadow-md rounded-xl">
        {session ? (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-center">You are signed in</h2>
            <p className="text-center text-sm mb-4">{session.user.email}</p>
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-6 text-center text-emerald-500">
              {isSignUp ? "Create an account" : "Sign in to your account"}
            </h2>

            {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
            {success && <p className="text-green-500 mb-4 text-sm">{success}</p>}

            {isSignUp && (
              <>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full mb-4 p-2 border rounded-lg focus:outline-none focus:ring-3 focus:ring-sky-200 text-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full mb-4 p-2 border rounded-lg focus:outline-none focus:ring-3 focus:ring-sky-200 text-emerald-500"
                />
                <input
                  type="number"
                  placeholder="Age"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full mb-4 p-2 border rounded-lg focus:outline-none focus:ring-3 focus:ring-sky-200 text-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Instructor Code (Optional)"
                  value={instructorCode}
                  onChange={(e) => setInstructorCode(e.target.value)}
                  className="w-full mb-4 p-2 border rounded-lg focus:outline-none focus:ring-3 focus:ring-sky-200 text-emerald-500"
                />
              </>
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mb-4 p-2 border rounded-lg focus:outline-none focus:ring-3 focus:ring-sky-200 text-emerald-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mb-6 p-2 border rounded-lg focus:outline-none focus:ring-3 focus:ring-sky-200 text-emerald-500"
            />

            <button
              onClick={handleAuth}
              className="w-full bg-emerald-500 p-2 rounded-lg hover:bg-sky-400 text-white transition"
            >
              {isSignUp ? "Sign Up" : "Sign In"}
            </button>

            <p className="mt-4 text-sm text-center text-emerald-500">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sky-400 hover:underline"
              >
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </>
        )}
      </div>
    </main>
  );
}