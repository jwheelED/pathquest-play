import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import posthog from "posthog-js";
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
// InstructorDashboard is lazy-loaded in InstructorLayout for persistent mounting
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
import { InstructorLayout } from "./components/instructor/InstructorLayout";

const queryClient = new QueryClient();

function App() {
  // PostHog user identification
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          // Identify user in PostHog
          posthog.identify(session.user.id, {
            email: session.user.email,
            role: session.user.user_metadata?.role,
          });
        } else if (event === 'SIGNED_OUT') {
          // Clear PostHog data on logout
          posthog.reset();
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
          {/* Instructor routes wrapped in InstructorLayout for persistent recording */}
          <Route element={
            <ProtectedRoute requiredRole="instructor" redirectTo="/instructor/auth">
              <CourseProvider>
                <InstructorLayout />
              </CourseProvider>
            </ProtectedRoute>
          }>
            {/* Dashboard is rendered by InstructorLayout, but we need a route for it */}
            <Route path="/instructor/dashboard" element={null} />
            <Route path="/instructor/settings" element={<InstructorSettings />} />
            <Route path="/instructor/lecture-presenter" element={<LecturePresenterView />} />
            <Route path="/instructor/presenter" element={<PresenterView />} />
            <Route path="/instructor/slides" element={<SlidePresenter />} />
            <Route path="/instructor/preview/:lectureId" element={<InstructorLecturePreview />} />
          </Route>
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
