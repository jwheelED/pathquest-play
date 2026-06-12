import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings, MessageSquare, Video, CheckSquare, Plug, CreditCard, Lock } from "lucide-react";
import { toast } from "sonner";
import { QuestionFormatSettings } from "@/components/instructor/QuestionFormatSettings";
import { AutoGradeSettings } from "@/components/instructor/AutoGradeSettings";
import { QuestionDifficultySettings } from "@/components/instructor/QuestionDifficultySettings";
import { LMSIntegrationSettings } from "@/components/instructor/LMSIntegrationSettings";
import { AdaptiveTutoringSettings } from "@/components/instructor/AdaptiveTutoringSettings";
import { BillingSettings } from "@/components/instructor/BillingSettings";
import { ChangePasswordSettings } from "@/components/instructor/ChangePasswordSettings";


import { QuestionPreviewSettings } from "@/components/instructor/QuestionPreviewSettings";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const TABS = [
  { key: "questions", label: "Question Generation", icon: MessageSquare },
  { key: "pre-recorded", label: "Pre-Recorded Lectures", icon: Video },
  { key: "grading", label: "Grading", icon: CheckSquare },
  { key: "integrations", label: "Integrations", icon: Plug },
] as const;

const ACCOUNT_TABS = [
  { key: "billing", label: "Plan & Billing", icon: CreditCard },
  { key: "security", label: "Security", icon: Lock },
] as const;


type TabKey = (typeof TABS)[number]["key"] | (typeof ACCOUNT_TABS)[number]["key"];

export default function InstructorSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) || "questions";
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [professorType, setProfessorType] = useState<"stem" | "humanities" | "medical" | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    checkAuth();
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
      .select("professor_type")
      .eq("id", session.user.id)
      .single();

    setCurrentUser(session.user);
    setProfessorType(profile?.professor_type || null);
    setLoading(false);
  };

  const setTab = (tab: TabKey) => {
    setSearchParams({ tab });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const renderNavItem = (item: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }, isActive: boolean) => (
    <button
      key={item.key}
      onClick={() => setTab(item.key as TabKey)}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left w-full",
        "hover:bg-accent/50",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground"
      )}
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      <span className={cn(isMobile && "whitespace-nowrap")}>{item.label}</span>
    </button>
  );

  const renderMobileNavItem = (item: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }, isActive: boolean) => (
    <button
      key={item.key}
      onClick={() => setTab(item.key as TabKey)}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0",
        "hover:bg-accent/50",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground"
      )}
    >
      <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span>{item.label}</span>
    </button>
  );

  const renderContent = () => {
    if (!currentUser) return null;

    switch (activeTab) {
      case "questions":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Question Generation</h2>
              <p className="text-sm text-muted-foreground mt-1">Configure how questions are generated, previewed, and what difficulty level to use.</p>
            </div>
            <QuestionFormatSettings instructorId={currentUser.id} professorType={professorType} />
            <QuestionPreviewSettings />
            <QuestionDifficultySettings />
          </div>
        );
      case "pre-recorded":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Pre-Recorded Lectures</h2>
              <p className="text-sm text-muted-foreground mt-1">Control question presets, difficulty mix, and style balance for pre-recorded lecture content.</p>
            </div>
            <AdaptiveTutoringSettings />
          </div>
        );
      case "grading":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Grading</h2>
              <p className="text-sm text-muted-foreground mt-1">Configure auto-grading behavior for short answers, coding questions, and multiple choice.</p>
            </div>
            <AutoGradeSettings />
          </div>
        );
      case "integrations":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
              <p className="text-sm text-muted-foreground mt-1">Connect external platforms like your LMS to sync grades and content.</p>
            </div>
            <LMSIntegrationSettings />
          </div>
        );
      case "billing":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Plan & Billing</h2>
              <p className="text-sm text-muted-foreground mt-1">Manage your subscription and usage limits.</p>
            </div>
            <BillingSettings />
          </div>
        );
      case "security":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Security</h2>
              <p className="text-sm text-muted-foreground mt-1">Manage your password and account security.</p>
            </div>
            <ChangePasswordSettings />
          </div>
        );
      default:

        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Settings className="w-6 h-6 sm:w-7 sm:h-7 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">Instructor Settings</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Configure your teaching preferences and integrations</p>
            </div>
          </div>
          <Button onClick={() => navigate("/instructor/dashboard")} variant="outline" size="sm" className="gap-1 sm:gap-2 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
        </div>
      </header>

      {/* Mobile: horizontal tab bar */}
      {isMobile && (
        <div className="border-b bg-card/30">
          <ScrollArea className="w-full">
            <div className="flex items-center gap-1 px-3 py-2">
              {TABS.map((item) => renderMobileNavItem(item, activeTab === item.key))}
              <div className="w-px h-6 bg-border flex-shrink-0 mx-1" />
              {ACCOUNT_TABS.map((item) => renderMobileNavItem(item, activeTab === item.key))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* Body */}
      <div className="container mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div className="flex gap-8">
          {/* Desktop sidebar */}
          {!isMobile && (
            <nav className="w-56 flex-shrink-0">
              <div className="sticky top-24 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">Teaching</p>
                {TABS.map((item) => renderNavItem(item, activeTab === item.key))}
                <Separator className="my-3" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">Account</p>
                {ACCOUNT_TABS.map((item) => renderNavItem(item, activeTab === item.key))}
              </div>
            </nav>
          )}

          {/* Content panel */}
          <div className="flex-1 min-w-0 max-w-3xl">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
