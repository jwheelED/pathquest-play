import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import InstructorAuth from "./pages/InstructorAuth";
import InstructorOnboarding from "./pages/InstructorOnboarding";
import InstructorDashboard from "./pages/InstructorDashboard";
import AdminAuth from "./pages/AdminAuth";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard" element={
            <ProtectedRoute requiredRole="student" redirectTo="/auth">
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/instructor/auth" element={<InstructorAuth />} />
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
