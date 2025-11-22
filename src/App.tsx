import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import MarketingLanding from "./pages/MarketingLanding";
import StudentTraining from "./pages/StudentTraining";
import ClassDashboard from "./pages/ClassDashboard";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import InstructorAuth from "./pages/InstructorAuth";
import InstructorOnboarding from "./pages/InstructorOnboarding";
import InstructorOrgOnboarding from "./pages/InstructorOrgOnboarding";
import InstructorDashboard from "./pages/InstructorDashboard";
import AdminAuth from "./pages/AdminAuth";
import AdminOnboarding from "./pages/AdminOnboarding";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { InstallPrompt } from "./components/InstallPrompt";
import { OfflineIndicator } from "./components/OfflineIndicator";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <OfflineIndicator />
      <InstallPrompt />
      <BrowserRouter>
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
              <InstructorDashboard />
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
