import { useEffect, useState, createContext, useContext, ReactNode } from "react";

interface AnnouncerContextType {
  announce: (message: string, priority?: "polite" | "assertive") => void;
}

const AnnouncerContext = createContext<AnnouncerContextType | null>(null);

/**
 * Hook to access the screen reader announcer
 * Use announce("message", "polite") for non-urgent updates
 * Use announce("message", "assertive") for urgent/important announcements
 */
export const useAnnouncer = () => {
  const context = useContext(AnnouncerContext);
  if (!context) {
    throw new Error("useAnnouncer must be used within ScreenReaderAnnouncer");
  }
  return context;
};

interface ScreenReaderAnnouncerProps {
  children: ReactNode;
}

/**
 * ARIA live region provider for dynamic content announcements
 * WCAG 2.1 AA requirement for screen reader compatibility
 */
export const ScreenReaderAnnouncer = ({ children }: ScreenReaderAnnouncerProps) => {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");

  const announce = (message: string, priority: "polite" | "assertive" = "polite") => {
    if (priority === "assertive") {
      setAssertiveMessage("");
      // Small delay to ensure screen reader picks up the change
      setTimeout(() => setAssertiveMessage(message), 100);
    } else {
      setPoliteMessage("");
      setTimeout(() => setPoliteMessage(message), 100);
    }
  };

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      {/* Polite announcements - for non-urgent updates */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>
      {/* Assertive announcements - for urgent/important updates */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </AnnouncerContext.Provider>
  );
};
