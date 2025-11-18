"use client"

import { supabase } from "@/integrations/supabase/client"
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { toast, Toaster } from "sonner"
import { Button } from "@/components/ui/button"
import { getOrgId } from "@/hooks/useOrgId"

export default function OnboardingPage() {
  const [classCode, setClassCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasExistingClass, setHasExistingClass] = useState(false)
  const [existingClassInfo, setExistingClassInfo] = useState<{ code: string; title: string } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    checkExistingConnection()
  }, [])

  const checkExistingConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if student has existing instructor connection
      const { data: connection } = await supabase
        .from("instructor_students")
        .select("instructor_id")
        .eq("student_id", user.id)
        .maybeSingle()

      if (connection?.instructor_id) {
        // Fetch instructor details
        const { data: instructor } = await supabase
          .from("profiles")
          .select("instructor_code, course_title")
          .eq("id", connection.instructor_id)
          .single()

        if (instructor) {
          setHasExistingClass(true)
          setExistingClassInfo({
            code: instructor.instructor_code || "N/A",
            title: instructor.course_title || "Unknown Course"
          })
        }
      }
    } catch (error) {
      console.error("Error checking existing connection:", error)
    }
  }

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

      // Check if already connected to this instructor
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
        
        // Cache onboarding status
        localStorage.setItem("edvana_onboarded", "true")
        navigate("/dashboard")
        return
      }

      // If student has existing connection to different instructor, remove it first
      const { data: oldConnection } = await supabase
        .from("instructor_students")
        .select("id, instructor_id")
        .eq("student_id", user.id)
        .maybeSingle()

      if (oldConnection && oldConnection.instructor_id !== instructorId) {
        toast.info("Switching to new class...")
        await supabase
          .from("instructor_students")
          .delete()
          .eq("id", oldConnection.id)
      }

      // Get instructor's org_id
      const { data: instructorProfile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", instructorId)
        .single()

      const instructorOrgId = instructorProfile?.org_id

      // Connect to new instructor
      const { error: connectionError } = await supabase
        .from("instructor_students")
        .insert({
          instructor_id: instructorId,
          student_id: user.id,
          org_id: instructorOrgId,
        })

      if (connectionError) {
        toast.error("Failed to join class. Please try again.")
        console.error(connectionError)
        return
      }

      // Mark as onboarded and set org_id
      await supabase
        .from("profiles")
        .update({ 
          onboarded: true,
          org_id: instructorOrgId
        })
        .eq("id", user.id)

      // Wait for database consistency
      await new Promise(resolve => setTimeout(resolve, 500))

      // Verify the update
      const { data: verification } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", user.id)
        .maybeSingle()

      if (verification?.onboarded) {
        // Cache onboarding status in localStorage
        localStorage.setItem("edvana_onboarded", "true")
        toast.success("Successfully joined class! Welcome to your learning journey.")
        navigate("/dashboard")
      } else {
        toast.error("Failed to complete onboarding. Please try again.")
      }
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
          {hasExistingClass && existingClassInfo && (
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg space-y-2">
              <p className="text-sm font-semibold text-foreground">
                Currently enrolled in:
              </p>
              <p className="text-base text-foreground font-medium">
                {existingClassInfo.title}
              </p>
              <p className="text-xs text-muted-foreground">
                Class code: <code className="font-mono">{existingClassInfo.code}</code>
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  localStorage.setItem("edvana_onboarded", "true")
                  navigate("/dashboard")
                }}
                className="mt-2 w-full"
              >
                Return to Dashboard
              </Button>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {hasExistingClass ? "Switch Class" : "Join Your Class"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {hasExistingClass 
                  ? "Enter a new class code to switch to a different class"
                  : "Enter the class code provided by your instructor to get started"
                }
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
