import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import { useSessionState } from "@/components/live/useSessionState";
import { TopBar } from "@/components/live/TopBar";
import { ListeningScreen } from "@/components/live/ListeningScreen";
import { CheckInCard } from "@/components/live/CheckInCard";
import { DiagramCheckIn } from "@/components/live/DiagramCheckIn";
import { FeedbackCard } from "@/components/live/FeedbackCard";
import { RecapScreen } from "@/components/live/RecapScreen";
import { LostMeBar } from "@/components/live/LostMeBar";

const LiveStudent = () => {
  const { sessionCode } = useParams();
  const navigate = useNavigate();

  // Validate participant before anything else
  useEffect(() => {
    const stored = localStorage.getItem("participantId");
    if (!stored) {
      toast.error("Please join the session first");
      navigate("/join");
    }
  }, [navigate]);

  const {
    phase,
    sessionId,
    sessionTitle,
    currentQuestion,
    selectedOption,
    confidence,
    timeLeft,
    feedbackData,
    roomStats,
    recapData,
    selectOption,
    selectConfidence,
    submitAnswer,
    dismissFeedback,
    sendLostMe,
    lostMeSentAt,
  } = useSessionState(sessionCode);

  const isEnded = phase === "recap";

  return (
    <main
      id="main-content"
      aria-label="Live session"
      className="flex flex-col min-h-screen bg-[hsl(var(--surface-app))]"
    >
      <TopBar
        title={sessionTitle || "Edvana Live"}
        inRoom={roomStats.inRoom}
        isActive={!isEnded}
      />

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        {phase === "listening" && <ListeningScreen />}

        {phase === "checkin" && currentQuestion && (
          currentQuestion.image_kind === "diagram" ? (
            <DiagramCheckIn
              question={currentQuestion}
              selectedOption={selectedOption}
              confidence={confidence}
              timeLeft={timeLeft}
              onSelectOption={selectOption}
              onSelectConfidence={selectConfidence}
              onSubmit={submitAnswer}
            />
          ) : (
            <CheckInCard
              question={currentQuestion}
              selectedOption={selectedOption}
              confidence={confidence}
              timeLeft={timeLeft}
              onSelectOption={selectOption}
              onSelectConfidence={selectConfidence}
              onSubmit={submitAnswer}
            />
          )
        )}

        {phase === "feedback" && feedbackData && (
          <FeedbackCard feedback={feedbackData} onDismiss={dismissFeedback} />
        )}

        {phase === "recap" && (
          <RecapScreen title={sessionTitle} items={recapData} />
        )}
      </div>

      {/* Bottom bar — hidden during recap */}
      {phase !== "recap" && (
        <LostMeBar
          onLostMe={sendLostMe}
          lostMeSentAt={lostMeSentAt}
        />
      )}
    </main>
  );
};

export default LiveStudent;
