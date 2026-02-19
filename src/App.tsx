import { useEffect } from "react";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import posthog from "posthog-js";
import * as Sentry from "@sentry/react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Index from "./pages/Index";
import MarketingLanding from "./pages/MarketingLanding";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

import ClassDashboard from "./pages/ClassDashboard";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import InstructorAuth from "./pages/InstructorAuth";
import InstructorOnboarding from "./pages/InstructorOnboarding";
import InstructorOrgOnboarding from "./pages/InstructorOrgOnboarding";
import InstructorDashboard from "./pages/InstructorDashboard";
import InstructorSettings from "./pages/InstructorSettings";
import AdminAuth from "./pages/AdminAuth";
import AdminOnboarding from "./pages/AdminOnboarding";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import JoinLive from "./pages/JoinLive";
import LiveStudent from "./pages/LiveStudent";
import PresenterView from "./pages/PresenterView";
import LecturePresenterView from "./pages/LecturePresenterView";
import SlidePresenter from "./pages/SlidePresenter";
import InteractiveLecture from "./pages/InteractiveLecture";
import InstructorLecturePreview from "./pages/InstructorLecturePreview";
import StudentTraining from "./pages/StudentTraining";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { InstallPrompt } from "./components/InstallPrompt";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { SkipLink, ScreenReaderAnnouncer } from "./components/accessibility";
import { CourseProvider } from "./hooks/useCourseContext";

const queryClient = new QueryClient();

function App() {
  // Check for new deployments
  useVersionCheck();

  // PostHog user identification
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          posthog.identify(session.user.id, {
            email: session.user.email,
            role: session.user.user_metadata?.role,
          });
          Sentry.setUser({
            id: session.user.id,
            email: session.user.email,
          });
        } else if (event === 'SIGNED_OUT') {
          posthog.reset();
          Sentry.setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <ScreenReaderAnnouncer>
            <SkipLink />
            <Toaster />
            <Sonner />
            <OfflineIndicator />
        <InstallPrompt />
        <BrowserRouter>
          <main id="main-content">
            <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/learn-more" element={<MarketingLanding />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard" element={
            <ProtectedRoute requiredRole="student" redirectTo="/auth">
              <StudentTraining />
            </ProtectedRoute>
          } />
          <Route path="/class/:instructorId" element={
            <ProtectedRoute requiredRole="student" redirectTo="/auth">
              <ClassDashboard />
            </ProtectedRoute>
          } />
          <Route path="/instructor/auth" element={<InstructorAuth />} />
          <Route path="/instructor/org-onboarding" element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/instructor/auth">
              <InstructorOrgOnboarding />
            </ProtectedRoute>
          } />
          <Route path="/instructor/onboarding" element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/instructor/auth">
              <InstructorOnboarding />
            </ProtectedRoute>
          } />
          <Route path="/instructor/dashboard" element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/instructor/auth">
              <CourseProvider>
                <InstructorDashboard />
              </CourseProvider>
            </ProtectedRoute>
          } />
          <Route path="/instructor/settings" element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/instructor/auth">
              <CourseProvider>
                <InstructorSettings />
              </CourseProvider>
            </ProtectedRoute>
          } />
          <Route path="/instructor/lecture-presenter" element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/instructor/auth">
              <LecturePresenterView />
            </ProtectedRoute>
          } />
          <Route path="/instructor/presenter" element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/instructor/auth">
              <PresenterView />
            </ProtectedRoute>
          } />
          <Route path="/instructor/slides" element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/instructor/auth">
              <SlidePresenter />
            </ProtectedRoute>
          } />
          <Route path="/instructor/preview/:lectureId" element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/instructor/auth">
              <InstructorLecturePreview />
            </ProtectedRoute>
          } />
          <Route path="/admin/auth" element={<AdminAuth />} />
          <Route path="/admin/onboarding" element={
            <ProtectedRoute requiredRole="admin" redirectTo="/admin/auth">
              <AdminOnboarding />
            </ProtectedRoute>
          } />
          <Route path="/admin/dashboard" element={
            <ProtectedRoute requiredRole="admin" redirectTo="/admin/auth">
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/join" element={<JoinLive />} />
          <Route path="/live/:sessionCode" element={<LiveStudent />} />
          <Route path="/lecture/:lectureId" element={
            <ProtectedRoute requiredRole="student" redirectTo="/auth">
              <InteractiveLecture />
            </ProtectedRoute>
          } />
          {/* Redirect /training to /dashboard for backwards compatibility */}
          <Route path="/training" element={
            <ProtectedRoute requiredRole="student" redirectTo="/auth">
              <StudentTraining />
            </ProtectedRoute>
          } />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </main>
        </BrowserRouter>
      </ScreenReaderAnnouncer>
    </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
  );
}

export default App;
