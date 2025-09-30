import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function InstructorAuth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();
        
        if (profile?.role === "instructor") {
          navigate("/instructor/dashboard");
        }
      }
    };
    checkSession();
  }, [navigate]);

  const handleAuth = async () => {
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              full_name: name,
              role: "instructor"
            }
          }
        });
        if (error) throw error;

        if (data.user) {
          // Create instructor profile
          const { error: profileError } = await supabase.from("profiles").insert({
            id: data.user.id,
            full_name: name,
            role: "instructor",
            onboarded: true,
          });

          if (profileError) {
            console.error("Profile creation error:", profileError);
            toast.error("Failed to create instructor profile");
            return;
          }

          const { error: userError } = await supabase.from("users").insert({
            id: data.user.id,
            user_id: data.user.id,
            name,
            email,
          });

          if (userError) {
            console.error("User creation error:", userError);
            toast.error("Failed to create user record");
            return;
          }

          toast.success("Account created! Please sign in.");
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          
          if (profileError) {
            console.error("Profile fetch error:", profileError);
            toast.error("Error checking instructor status");
            await supabase.auth.signOut();
            return;
          }

          if (profile?.role === "instructor") {
            navigate("/instructor/dashboard");
          } else {
            toast.error("This account is not registered as an instructor");
            await supabase.auth.signOut();
          }
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/5 to-secondary/10 p-4">
      <Card className="w-full max-w-md pixel-corners">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary">
            Instructor Portal
          </CardTitle>
          <CardDescription>
            {isSignUp ? "Create your instructor account" : "Sign in to manage your students"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSignUp && (
            <Input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="retro-input"
            />
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="retro-input"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="retro-input"
          />
          <Button
            onClick={handleAuth}
            disabled={loading}
            className="w-full retro-button"
            variant="retro"
          >
            {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full"
          >
            {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
