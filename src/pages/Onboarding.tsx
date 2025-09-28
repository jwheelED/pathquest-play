"use client"

import { supabase } from "@/integrations/supabase/client"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

const weekdays = ["Sun", "M", "Tu", "W", "Th", "F", "Sat"]

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [selectedGoals, setSelectedGoals] = useState([])
  const [experienceLevel, setExperienceLevel] = useState("")
  const [studyDays, setStudyDays] = useState([])
  const navigate = useNavigate();

  const totalSteps = 4

  const toggleGoal = (goal) => {
    setSelectedGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    )
  }

  const toggleDay = (day) => {
    setStudyDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const handleNext = async () => {
    if (step < totalSteps) {
      setStep(step + 1)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        goals: selectedGoals,
        experience_level: experienceLevel,
        study_days: studyDays,
        onboarded: true,
      })

    if (profileError) {
      console.error("Error saving onboarding data:", profileError.message)
      toast.error("Failed to save onboarding data.")
      return
    }

    const response = await fetch("/api/generate-path", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId: user.id,
    goal: selectedGoals[0],
    experienceLevel,
  }),
})


    if (!response.ok) {
      toast.error("Failed to generate learning path")
      return
    }

    toast.success("Onboarding complete! Learning path generated.")
    navigate("/dashboard")
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <>
            <h2 className="text-2xl font-bold mb-4 text-emerald-500">Choose your goals</h2>
            <p className="mb-6 text-sky-400">Let us personalize your experience.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {["Learn C++", "Learn JavaScript", "Learn Python", "Learn Machine Learning"].map(goal => (
                <button
                  key={goal}
                  onClick={() => toggleGoal(goal)}
                  className={`p-4 rounded-lg border ${
                    selectedGoals.includes(goal)
                      ? "bg-sky-400 text-white hover:bg-sky-500"
                      : "bg-emerald-500 text-white"
                  }`}
                >
                  {goal}
                </button>
              ))}
            </div>
          </>
        )
      case 2:
        return (
          <>
            <h2 className="text-2xl font-bold mb-4 text-sky-400">Select your experience level</h2>
            <select
              className="w-full p-3 mb-6 border rounded text-emerald-500"
              value={experienceLevel}
              onChange={e => setExperienceLevel(e.target.value)}
            >
              <option value="">Choose one...</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </>
        )
      case 3:
        return (
          <>
            <h2 className="text-2xl font-bold mb-4 text-sky-400">Pick your study days</h2>
            <div className="flex justify-center gap-3 mb-6">
              {weekdays.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`w-10 h-10 rounded-full border text-sm font-medium ${
                    studyDays.includes(day)
                      ? "bg-sky-400 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </>
        )
      case 4:
        return (
          <>
            <h2 className="text-2xl font-bold mb-4 text-sky-400">Review your selections</h2>
            <p className="text-left mb-2 text-gray-700"><strong>Goals:</strong> {selectedGoals.join(", ")}</p>
            <p className="text-left mb-2 text-gray-700"><strong>Experience:</strong> {experienceLevel}</p>
            <p className="text-left text-gray-700"><strong>Study Days:</strong> {studyDays.join(", ")}</p>
          </>
        )
      default:
        return null
    }
  }

  const progressPercent = (step / totalSteps) * 100

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100 px-4 py-8 space-y-6">
      <Toaster position="top-center" />
      <div className="w-full max-w-xl px-6">
        <div className="h-2 bg-gray-300 rounded-full">
          <div
            className="h-2 bg-sky-400 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-sm text-center mt-2 text-gray-600">
          Step {step} of {totalSteps}
        </p>
      </div>

      <div className="w-full max-w-xl p-8 bg-white shadow-lg rounded-xl text-center">
        {renderStepContent()}
        <div className="flex justify-between mt-6">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="bg-emerald-300 text-white px-4 py-2 rounded hover:bg-emerald-400 disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={
              (step === 1 && selectedGoals.length === 0) ||
              (step === 2 && experienceLevel === "") ||
              (step === 3 && studyDays.length === 0)
            }
            className="bg-sky-400 text-white px-6 py-2 rounded hover:bg-sky-500 disabled:opacity-50"
          >
            {step === totalSteps ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </main>
  )
}
