import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, BookOpen, Presentation, Video, Radio, Copy, LayoutDashboard, Users, FileText, Library, Settings, Award } from "lucide-react";
import { PendingOrgInvites } from "@/components/instructor/PendingOrgInvites";
import { CommandStripHero } from "@/components/instructor/CommandStripHero";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { LiveStatusSection } from "@/components/instructor/LiveStatusSection";
import { LastSessionCard } from "@/components/instructor/LastSessionCard";
import { LiveUnderstandingHealth } from "@/components/instructor/LiveUnderstandingHealth";
import { RecentUnderstandingPatterns } from "@/components/instructor/RecentUnderstandingPatterns";
import { RecentSessionsList } from "@/components/instructor/RecentSessionsList";
import { AccountSnapshot } from "@/components/instructor/AccountSnapshot";
import { CheckInPreview } from "@/components/instructor/CheckInPreview";
import { CourseSelector } from "@/components/instructor/CourseSelector";
import StudentDetailDialog from "@/components/instructor/StudentDetailDialog";
import { StudentRosterPanel } from "@/components/instructor/StudentRosterPanel";
import { LectureTranscription } from "@/components/instructor/LectureTranscription";
import { LectureCheckInResults } from "@/components/instructor/LectureCheckInResults";
import { AnswerReleaseCard } from "@/components/instructor/AnswerReleaseCard";
import { LectureMaterialsUpload } from "@/components/instructor/LectureMaterialsUpload";
// InstructorConnectionCard removed - organization connection not needed unless for institutional licensing
import { LiveSessionControls } from "@/components/instructor/LiveSessionControls";
import { LiveSessionResults } from "@/components/instructor/LiveSessionResults";
import { PastLiveSessions } from "@/components/instructor/PastLiveSessions";
import { PreRecordedLectureUpload } from "@/components/instructor/PreRecordedLectureUpload";
import { LectureVideoManager } from "@/components/instructor/LectureVideoManager";
import { PreRecordedLectureGrades } from "@/components/instructor/PreRecordedLectureGrades";
import { StudentLectureQuestions } from "@/components/instructor/StudentLectureQuestions";
import { QuestionBankTab } from "@/components/instructor/QuestionBankTab";
import { SettingsPanel } from "@/components/instructor/SettingsPanel";
import { cn } from "@/lib/utils";
import { useCourseContext } from "@/hooks/useCourseContext";
import { useLiveTranscriptBroadcast } from "@/hooks/useLiveTranscriptBroadcast";
import { SavedSummariesTab } from "@/components/instructor/SavedSummariesTab";
import { LiveSessionStrip } from "@/components/instructor/LiveSessionStrip";
import { LiveCopilotHero } from "@/components/instructor/LiveCopilotHero";
import { HowItWorksSection } from "@/components/instructor/HowItWorksSection";
import { SessionReadiness } from "@/components/instructor/SessionReadiness";
import { LastLiveSignal } from "@/components/instructor/LastLiveSignal";
import { LiveToolsSection } from "@/components/instructor/LiveToolsSection";
import { LiveResponsesEmpty } from "@/components/instructor/LiveResponsesEmpty";
import { useQueryClient } from "@tanstack/react-query";
import { useStudentRoster, rosterQueryKey } from "@/hooks/useStudentRoster";
import { useStudentDetail } from "@/hooks/useStudentDetail";

type TabValue = "overview" | "live" | "recorded" | "students" | "materials" | "question-bank" | "summaries" | "settings";

const navItems: { value: TabValue; label: string; icon: React.ElementType }[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "live", label: "Live Copilot", icon: Radio },
  { value: "recorded", label: "Pre-Recorded", icon: Video },
  { value: "question-bank", label: "Question Bank", icon: Library },
  { value: "summaries", label: "Summaries", icon: Award },
  { value: "students", label: "Students", icon: Users },
  { value: "materials", label: "Materials", icon: FileText },
  { value: "settings", label: "Settings", icon: Settings },
];

export default function InstructorDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [instructorCode, setInstructorCode] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshQueue, setRefreshQueue] = useState(0);
  const [instructorProfile, setInstructorProfile] = useState<any>(null);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [isListening, setIsListening] = useState(false);
  const [autoQuestionEnabled, setAutoQuestionEnabled] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [micConnected, setMicConnected] = useState(true);
  const [hasCheckIns, setHasCheckIns] = useState(false);
  // Transcription state from LectureTranscription
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [questionCandidate, setQuestionCandidate] = useState<any>(null);
  const [isSendingQuestion, setIsSendingQuestion] = useState(false);
  const [isQuestionHeld, setIsQuestionHeld] = useState(false);
  const [autoQuestionState, setAutoQuestionState] = useState({ intervalMinutes: 15, nextQuestionIn: 0, isSending: false });
  // Refs for callbacks
  const onSendQuestionRef = useRef<((text: string, type?: string, options?: string[], correctAnswer?: string, expectedAnswer?: string, codingPayload?: Record<string, unknown>) => void) | null>(null);
  const onPreviewQuestionRef = useRef<((text: string) => void) | null>(null);
  const onDismissQuestionRef = useRef<(() => void) | null>(null);
  const onStartRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const onStopRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const onAutoQuestionIntervalChangeRef = useRef<((minutes: number) => void) | null>(null);
  const onAutoQuestionToggleRef = useRef<((enabled: boolean) => Promise<void>) | null>(null);
  const { selectedCourseId, selectedCourse } = useCourseContext();

  // Roster + per-student detail for the Students tab. Roster derives
  // participation/comprehension signals (lib/studentSignals); detail lazily
  // loads the question-by-question responses and activity feed.
  const queryClient = useQueryClient();
  const rosterQuery = useStudentRoster(currentUser?.id ?? null, selectedCourseId ?? null);
  const rosterStudents = rosterQuery.data?.students ?? [];
  const courseVideos = rosterQuery.data?.videos ?? [];
  const studentDetailQuery = useStudentDetail(
    selectedStudentId,
    currentUser?.id ?? null,
    selectedCourseId ?? null,
    courseVideos,
  );

  const professorType = instructorProfile?.professor_type;

  // Stream live transcript chunks to enrolled students (realtime + persistence)
  useLiveTranscriptBroadcast({
    sessionId: liveSessionId,
    instructorId: currentUser?.id ?? null,
    courseId: selectedCourseId ?? null,
    chunks: transcriptChunks,
    enabled: isListening && !!liveSessionId,
  });

  // Auto-create a lightweight live_session whenever the instructor starts
  // recording (even without explicitly opening a live class). This lets
  // enrolled students see the live transcript from their class dashboard the
  // moment "Start Recording" is pressed.
  const autoCreatedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ensureSession = async () => {
      if (!isListening || liveSessionId || !currentUser?.id) return;
      try {
        const { data, error } = await (supabase
          .from("live_sessions") as any)
          .insert({
            instructor_id: currentUser.id,
            course_id: selectedCourseId ?? null,
            title: "Recording session",
            is_active: true,
          })
          .select("id")
          .single();
        if (cancelled) return;
        if (error || !data?.id) {
          console.warn("Failed to auto-create live session for recording", error);
          return;
        }
        autoCreatedSessionRef.current = data.id;
        setLiveSessionId(data.id);
      } catch (err) {
        console.warn("Auto live_session creation threw", err);
      }
    };
    ensureSession();
    return () => {
      cancelled = true;
    };
  }, [isListening, liveSessionId, currentUser?.id, selectedCourseId]);

  // When recording stops, close out any session we auto-created so the
  // "Live now" indicator disappears from the student dashboard.
  useEffect(() => {
    if (isListening) return;
    const id = autoCreatedSessionRef.current;
    if (!id) return;
    autoCreatedSessionRef.current = null;
    (supabase.from("live_sessions") as any)
      .update({ is_active: false })
      .eq("id", id)
      .then(({ error }: any) => {
        if (error) console.warn("Failed to close auto live session", error);
      });
    setLiveSessionId((curr) => (curr === id ? null : curr));
  }, [isListening]);


  useEffect(() => {
    checkAuth();
  }, []);

  // Fetch participant count when active session changes
  useEffect(() => {
    if (!activeSession?.id) {
      setParticipantCount(0);
      return;
    }

    const fetchParticipantCount = async () => {
      const { count, error } = await supabase
        .from("live_participants")
        .select("*", { count: "exact", head: true })
        .eq("session_id", activeSession.id);
      
      if (!error) {
        setParticipantCount(count || 0);
      }
    };

    fetchParticipantCount();
    
    // Poll every 5 seconds
    const interval = setInterval(fetchParticipantCount, 5000);
    
    return () => clearInterval(interval);
  }, [activeSession?.id]);
  
  useEffect(() => {
    const lastReminderDate = localStorage.getItem('lastCourseMaterialsReminder');
    const today = new Date().toDateString();
    if (lastReminderDate !== today) {
      setTimeout(() => {
        toast.info("💡 Tip: You can upload lecture slides and materials in the Materials tab!", {
          duration: 5000,
        });
        localStorage.setItem('lastCourseMaterialsReminder', today);
      }, 1500);
    }
    
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Roster freshness: invalidate the TanStack key and let query dedup
      // absorb event bursts. The old unfiltered user_stats subscription
      // (refetch on ANY student's XP change org-wide) was removed along with
      // the gamification display.
      const invalidateRoster = () => {
        queryClient.invalidateQueries({ queryKey: ["student-roster"] });
      };

      const channel = supabase
        .channel('instructor-realtime-updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'instructor_students',
            filter: `instructor_id=eq.${user.id}`
          },
          () => {
            invalidateRoster();
            toast.success('New student joined the class!', { duration: 3000 });
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'student_assignments',
            filter: `instructor_id=eq.${user.id}`
          },
          () => {
            invalidateRoster();
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Successfully subscribed to realtime updates');
          }
        });

      return channel;
    };

    const channelPromise = setupRealtime();

    return () => {
      channelPromise.then(channel => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/instructor/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "instructor")
      .maybeSingle();
    
    if (!roleData) {
      toast.error("Access denied. Instructor privileges required.");
      navigate("/instructor/auth");
      return;
    }
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("instructor_code, course_title, course_schedule, course_topics, onboarded, professor_type, full_name, question_format_preference, coding_question_style")
      .eq("id", session.user.id)
      .single();
    
    setInstructorProfile(profile);

    if (!profile?.onboarded) {
      toast.info("Please complete your instructor onboarding");
      navigate("/instructor/onboarding");
      return;
    }

    // Check the courses table (source of truth) instead of legacy profile fields.
    // Legacy accounts may have onboarded=true but no course row yet — send them
    // back to onboarding to create their first course rather than stranding them
    // on a dashboard with no course context.
    const { data: existingCourses } = await supabase
      .from("courses")
      .select("id")
      .eq("instructor_id", session.user.id)
      .eq("is_active", true)
      .limit(1);

    if (!existingCourses || existingCourses.length === 0) {
      toast.info("Let's finish setting up your first course.");
      navigate("/instructor/onboarding");
      return;
    }

    setCurrentUser(session.user);
    setInstructorCode(profile.instructor_code || "");
    setLoading(false);
  };

  const handleLogout = async () => {
    localStorage.removeItem("edvana_onboarded");
    localStorage.removeItem("lastCourseMaterialsReminder");
    await supabase.auth.signOut();
    navigate("/instructor/auth");
  };

  // Selecting a row opens the detail panel; the response-drilldown dialog
  // opens only via the panel's "View all responses" button.
  const handleStudentClick = (studentId: string) => {
    setSelectedStudentId(studentId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const quickActions = [
    {
      icon: <Radio className="w-3 h-3" />,
      label: "Start Live",
      onClick: () => setActiveTab("live"),
      variant: "primary" as const,
    },
    {
      icon: <Presentation className="w-3 h-3" />,
      label: "Present Slides",
      onClick: () => navigate("/instructor/slides"),
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-10">
            {/* Pending Invites - Top priority notification */}
            <PendingOrgInvites />
            
            {/* ===== PRIMARY SECTION: Command Strip Hero ===== */}
            <section>
              <CommandStripHero
                activeSession={activeSession}
                onStartLive={() => setActiveTab("live")}
                onPresentSlides={() => navigate("/instructor/slides")}
                onSessionChange={setLiveSessionId}
                setActiveSession={setActiveSession}
              />
            </section>
            
            {/* ===== SECONDARY SECTION: Live Status + Last Session ===== */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <LiveStatusSection 
                onStartLive={() => setActiveTab("live")}
                onViewSummary={() => setActiveTab("summaries")}
              />
              <LastSessionCard onNavigate={(tab) => setActiveTab(tab as TabValue)} />
            </section>
            
            {/* ===== TERTIARY SECTION: Live Understanding Health ===== */}
            <section>
              <LiveUnderstandingHealth />
            </section>
            
            {/* ===== TERTIARY SECTION: Recent Understanding Patterns ===== */}
            <section>
              <RecentUnderstandingPatterns 
                onViewPatterns={() => setActiveTab("live")}
              />
            </section>
            
            {/* Check-in Preview (only shows when session active) */}
            <CheckInPreview
              activeSessionId={activeSession?.id}
              onNavigate={(tab) => setActiveTab(tab as TabValue)}
            />
            
            {/* ===== LOWER PRIORITY: Recent Sessions ===== */}
            <section className="pt-2">
              <RecentSessionsList onNavigate={(tab) => setActiveTab(tab as TabValue)} />
            </section>
            
            {/* ===== LOWEST PRIORITY: Account Snapshot + Quick Actions ===== */}
            <section className="border-t border-slate-100 pt-8 mt-4">
              <AccountSnapshot 
                onNavigate={(tab) => setActiveTab(tab as TabValue)}
                onStartLive={() => setActiveTab("live")}
                onPresentSlides={() => navigate("/instructor/slides")}
              />
            </section>
          </div>
        );

      case "live":
        return (
          <div className="space-y-6">
            {/* ===== SESSION CONTROLS: Start/manage live session ===== */}
            <section>
              <CommandStripHero
                activeSession={activeSession}
                onStartLive={() => {}}
                onPresentSlides={() => navigate("/instructor/slides")}
                onSessionChange={setLiveSessionId}
                setActiveSession={setActiveSession}
              />
            </section>

            {/* ===== LIVE COPILOT HERO: Main action center ===== */}
            <section>
              <LiveCopilotHero
                isListening={isListening}
                autoQuestionEnabled={autoQuestionEnabled}
                onStartListening={() => onStartRecordingRef.current?.()}
                onStopListening={() => onStopRecordingRef.current?.()}
                onToggleAutoQuestion={(enabled) => onAutoQuestionToggleRef.current?.(enabled)}
                participantCount={participantCount}
                transcriptChunks={transcriptChunks}
                currentTranscript={currentTranscript}
                questionCandidate={questionCandidate}
                isSendingQuestion={isSendingQuestion}
                onSendQuestion={(text, type, options, correctAnswer, expectedAnswer, codingPayload) => onSendQuestionRef.current?.(text, type, options, correctAnswer, expectedAnswer, codingPayload)}
                onPreviewQuestion={(text) => onPreviewQuestionRef.current?.(text)}
                onDismissQuestion={() => onDismissQuestionRef.current?.()}
                isQuestionHeld={isQuestionHeld}
                onToggleQuestionHold={() => setIsQuestionHeld(h => !h)}
                onViewLiveResponses={() => setActiveTab("live")}
                formatPreference={instructorProfile?.question_format_preference as 'multiple_choice' | 'short_answer' | 'poll' | 'coding' | undefined}
                codingStyle={(instructorProfile?.coding_question_style as 'simple' | 'full' | undefined) ?? 'simple'}
                intervalMinutes={autoQuestionState.intervalMinutes}
                nextQuestionIn={autoQuestionState.nextQuestionIn}
                onIntervalChange={(minutes) => onAutoQuestionIntervalChangeRef.current?.(minutes)}
                courseId={selectedCourseId}
              />
            </section>

            {/* ===== HOW IT WORKS: Educational section (hide when listening) ===== */}
            {!isListening && (
              <section>
                <HowItWorksSection />
              </section>
            )}

            {/* ===== SESSION READINESS: Pre-flight indicators ===== */}
            {!isListening && (
              <section>
                <SessionReadiness
                  isLive={!!activeSession?.is_active}
                  micConnected={micConnected}
                  participantCount={participantCount}
                  autoQuestionEnabled={autoQuestionEnabled}
                />
              </section>
            )}

            {/* ===== LOWER PRIORITY: Live Responses + Tools ===== */}
            {!isListening && (
              <section>
                <LiveToolsSection onNavigate={(tab) => setActiveTab(tab as TabValue)} />
              </section>
            )}

            {/* ===== CHECK-IN RESULTS: Always visible at bottom ===== */}
            <section>
              <LiveResponsesEmpty hasActiveSession={!!activeSession?.id} activeSessionId={activeSession?.id} />
            </section>

            {/* ===== LAST LIVE SIGNAL: Below primary surface ===== */}
            {!isListening && (
              <section>
                <LastLiveSignal onViewSummary={() => setActiveTab("summaries")} />
              </section>
            )}

            {/* ===== PAST LIVE SESSIONS: Session history with student answers ===== */}
            <section>
              <PastLiveSessions />
            </section>
          </div>
        );

      case "recorded":
        return (
          <div className="space-y-6">
            <div className="min-w-0">
              <PreRecordedLectureUpload />
            </div>
            
            <div className="min-w-0">
              <LectureVideoManager />
            </div>
            
            <div className="min-w-0">
              <PreRecordedLectureGrades />
            </div>

            {currentUser && (
              <div className="min-w-0">
                <StudentLectureQuestions instructorId={currentUser.id} />
              </div>
            )}
          </div>
        );

      case "students":
        return (
          <StudentRosterPanel
            students={rosterStudents}
            selectedStudentId={selectedStudentId}
            onStudentClick={handleStudentClick}
            onRefresh={() =>
              queryClient.invalidateQueries({
                queryKey: rosterQueryKey(currentUser?.id ?? null, selectedCourseId ?? null),
              })
            }
            instructorId={currentUser?.id || ""}
            detail={studentDetailQuery.data ?? null}
            detailLoading={studentDetailQuery.isLoading}
            onOpenResponses={() => setDialogOpen(true)}
            loading={rosterQuery.isLoading}
          />
        );

      case "question-bank":
        return <QuestionBankTab professorType={professorType} />;

      case "summaries":
        return <SavedSummariesTab />;

      case "materials":
        return (
          <div className="space-y-6">
            <LectureMaterialsUpload />
            {professorType === "research" && (
              <Card className="headspace-card h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Code className="h-5 w-5 text-primary" />
                    Research Tools
                  </CardTitle>
                  <CardDescription>
                    AI-powered content generation for research
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full rounded-xl">
                    Access Lab Portal
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case "settings":
        return currentUser ? (
          <SettingsPanel
            currentUserId={currentUser.id}
            professorType={instructorProfile?.professor_type}
          />
        ) : null;

      default:
        return null;
    }
  };

  return (
    <DashboardShell
      role="instructor"
      userName={instructorProfile?.full_name || currentUser?.email || "Instructor"}
      userEmail={currentUser?.email || ""}
      userId={currentUser?.id}
      onLogout={handleLogout}
      title="Instructor Dashboard"
      subtitle={instructorProfile?.course_title}
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as TabValue)}
      headerActions={
        <>
          <CourseSelector />
          <QuickActions actions={quickActions} className="hidden lg:flex" />
        </>
      }
    >
      <div className="flex min-h-[calc(100vh-12rem)]">
        {/* Sidebar Navigation - Desktop Only */}
        <aside className="hidden lg:flex w-56 flex-col border-r border-border/60 pr-6 mr-6 shrink-0">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => setActiveTab(item.value)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-left",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold border-l-3 border-primary"
                      : "text-muted-foreground font-medium hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* LiveSessionControls - Hidden but persists session state */}
          {currentUser && (
            <div className="hidden">
              <LiveSessionControls 
                onSessionChange={setLiveSessionId} 
                activeSession={activeSession}
                setActiveSession={setActiveSession}
              />
            </div>
          )}
          
          {/* LectureTranscription - Hidden but persists recording state & exposes callbacks */}
          <div className="hidden">
            <LectureTranscription
              onQuestionGenerated={() => {}}
              onRecordingChange={setIsListening}
              onTranscriptChange={(chunks, current) => {
                setTranscriptChunks(chunks);
                setCurrentTranscript(current);
              }}
              onQuestionCandidateChange={setQuestionCandidate}
              onSendingChange={setIsSendingQuestion}
              onAutoQuestionStateChange={setAutoQuestionState}
              onAutoQuestionIntervalChangeRef={onAutoQuestionIntervalChangeRef}
              onAutoQuestionToggleRef={onAutoQuestionToggleRef}
              onAutoQuestionEnabledChange={setAutoQuestionEnabled}
              onSendQuestionRef={onSendQuestionRef}
              onPreviewQuestionRef={onPreviewQuestionRef}
              onDismissQuestionRef={onDismissQuestionRef}
              onStartRecordingRef={onStartRecordingRef}
              onStopRecordingRef={onStopRecordingRef}
              suppressInternalDialogs={true}
            />
          </div>
          
          {renderTabContent()}

          {/* LectureTranscription is now rendered inline within the live tab */}
        </main>
      </div>

      {/* Per-question response drilldown */}
      {selectedStudentId && (
        <StudentDetailDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          studentName={rosterStudents.find(s => s.id === selectedStudentId)?.name || "Student"}
          groups={studentDetailQuery.data?.responsesByVideo ?? []}
        />
      )}
    </DashboardShell>
  );
}
