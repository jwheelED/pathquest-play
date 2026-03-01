import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import { Button } from "@/components/ui/button";
import { LogOut, Users, Shield } from "lucide-react";
import { EdvanaIcon } from "@/components/ui/EdvanaIcon";

interface DashboardShellProps {
  children: ReactNode;
  role: "student" | "instructor" | "admin";
  userName: string;
  userEmail: string;
  userId?: string;
  onLogout: () => void;
  stats?: {
    level?: number;
    streak?: number;
    classCode?: string;
  };
  headerActions?: ReactNode;
  title?: string;
  subtitle?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function DashboardShell({
  children,
  role,
  userName,
  userEmail,
  userId,
  onLogout,
  stats,
  headerActions,
  title,
  subtitle,
  activeTab,
  onTabChange,
}: DashboardShellProps) {
  const navigate = useNavigate();

  const getRoleIcon = () => {
    switch (role) {
      case "instructor":
        return <Users className="w-4 h-4 text-primary-foreground" />;
      case "admin":
        return <Settings className="w-4 h-4 text-primary-foreground" />;
      default:
        return <EdvanaIcon className="w-4 h-4" />;
    }
  };

  const getDefaultTitle = () => {
    switch (role) {
      case "instructor":
        return "Instructor Dashboard";
      case "admin":
        return "Admin Dashboard";
      default:
        return "Edvana";
    }
  };

  return (
    <div className="min-h-screen mastery-bg pb-24 md:pb-0">
      {/* Mobile Header */}
      <MobileHeader
        userName={userName}
        userEmail={userEmail}
        role={role}
        onLogout={onLogout}
        userId={userId}
        stats={stats}
      />

      {/* Desktop Header */}
      <header className="hidden md:block bg-card/80 backdrop-blur-sm sticky top-0 z-40 border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                <EdvanaIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">
                  {title || getDefaultTitle()}
                </h1>
                {subtitle && (
                  <p className="text-xs text-muted-foreground">{subtitle}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {headerActions}

              <div className="h-6 w-px bg-border" />

              <span className="text-sm text-muted-foreground hidden lg:block">
                {userName || userEmail}
              </span>

              <Button
                onClick={onLogout}
                variant="ghost"
                size="icon"
                className="rounded-full w-8 h-8 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav role={role} activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  );
}
