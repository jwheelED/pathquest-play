"use client"

import { supabase } from "@/integrations/supabase/client"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast, Toaster } from "sonner"

export default function OnboardingPage() {
  const [classCode, setClassCode] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleJoinClass = async () => {
    if (!classCode.trim()) {
      toast.error("Please enter a class code")
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error("Not authenticated")
        return
      }

      // Validate instructor code
      const { data: instructorId, error: instructorError } = await supabase
        .rpc("validate_instructor_code", { code: classCode.trim() })

      if (instructorError || !instructorId) {
        toast.error("Invalid class code. Please check with your instructor.")
        return
      }

      // Check if already connected
      const { data: existing } = await supabase
        .from("instructor_students")
        .select("id")
        .eq("instructor_id", instructorId)
        .eq("student_id", user.id)
        .maybeSingle()

      if (existing) {
        toast.info("You're already enrolled in this class.")
        // Still mark as onboarded
        await supabase
          .from("profiles")
          .update({ onboarded: true })
          .eq("id", user.id)
        navigate("/dashboard")
        return
      }

      // Connect to instructor
      const { error: connectionError } = await supabase
        .from("instructor_students")
        .insert({
          instructor_id: instructorId,
          student_id: user.id,
        })

      if (connectionError) {
        toast.error("Failed to join class. Please try again.")
        console.error(connectionError)
        return
      }

      // Mark as onboarded
      await supabase
        .from("profiles")
        .update({ onboarded: true })
        .eq("id", user.id)

      toast.success("Successfully joined class! Welcome to your learning journey.")
      navigate("/dashboard")
    } catch (err) {
      console.error("Error joining class:", err)
      toast.error("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }


  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-accent/20 px-4 py-8">
      <Toaster position="top-center" />
      
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            🎓 Welcome to Edvana
          </h1>
          <p className="text-lg text-muted-foreground">
            Your personalized learning journey starts here
          </p>
        </div>

        <div className="bg-card p-8 shadow-xl rounded-2xl border-2 border-primary/20 space-y-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Join Your Class
              </h2>
              <p className="text-sm text-muted-foreground">
                Enter the class code provided by your instructor to get started
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="classCode" className="text-sm font-medium text-foreground">
                Class Code
              </label>
              <input
                id="classCode"
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                placeholder="Enter your class code"
                className="w-full px-4 py-3 border-2 border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg font-mono tracking-wider uppercase"
                maxLength={6}
              />
            </div>

            <button
              onClick={handleJoinClass}
              disabled={loading || !classCode.trim()}
              className="w-full bg-gradient-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-glow"
            >
              {loading ? "Joining..." : "Join Class"}
            </button>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Don't have a class code? Contact your instructor to get one.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
