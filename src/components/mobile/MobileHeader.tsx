import { Menu, LogOut, Bell, Flame, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface MobileHeaderProps {
  userName: string;
  userEmail: string;
  role: "student" | "instructor" | "admin";
  onLogout: () => void;
  stats?: {
    level?: number;
    streak?: number;
    classCode?: string;
  };
}

export function MobileHeader({
  userName,
  userEmail,
  role,
  onLogout,
  stats,
}: MobileHeaderProps) {
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="md:hidden sticky top-0 z-40 glass border-b border-border/50">
      <div className="flex items-center justify-between h-16 px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-primary/20">
            <AvatarFallback className="text-sm font-medium bg-gradient-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold truncate text-foreground">{userName}</span>
            <div className="flex items-center gap-2">
              {stats?.level !== undefined && (
                <span className="stat-pill text-xs py-0.5 px-2 bg-primary/10 text-primary">
                  <Trophy className="w-3 h-3" />
                  Lvl {stats.level}
                </span>
              )}
              {stats?.streak !== undefined && stats.streak > 0 && (
                <span className="stat-pill text-xs py-0.5 px-2 bg-streak/10 text-streak">
                  <Flame className="w-3 h-3" />
                  {stats.streak}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </Button>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl">
                <Menu className="h-5 w-5 text-muted-foreground" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 bg-card">
              <SheetHeader className="text-left">
                <SheetTitle className="text-lg">Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                {/* User Profile Card */}
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/50">
                  <Avatar className="h-14 w-14 ring-2 ring-primary/20">
                    <AvatarFallback className="text-lg font-medium bg-gradient-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{userName}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {userEmail}
                    </p>
                    <Badge variant="secondary" className="mt-2 capitalize text-xs font-normal">
                      {role}
                    </Badge>
                  </div>
                </div>

                {/* Stats */}
                {stats && (
                  <div className="grid grid-cols-2 gap-3">
                    {stats.level !== undefined && (
                      <div className="flex flex-col items-center p-4 rounded-2xl bg-primary/5 border border-primary/10">
                        <Trophy className="w-5 h-5 text-primary mb-1" />
                        <span className="text-2xl font-bold text-foreground">{stats.level}</span>
                        <span className="text-xs text-muted-foreground">Level</span>
                      </div>
                    )}
                    {stats.streak !== undefined && (
                      <div className="flex flex-col items-center p-4 rounded-2xl bg-streak/5 border border-streak/10">
                        <Flame className="w-5 h-5 text-streak mb-1" />
                        <span className="text-2xl font-bold text-foreground">{stats.streak}</span>
                        <span className="text-xs text-muted-foreground">Day Streak</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Logout Button */}
                <Button
                  variant="outline"
                  className="w-full rounded-xl h-12"
                  onClick={onLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
