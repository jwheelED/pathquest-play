import { Menu, LogOut, Bell } from "lucide-react";
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
    <header className="md:hidden sticky top-0 z-30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-b border-border">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold truncate">{userName}</span>
            {stats?.level !== undefined && (
              <span className="text-xs text-muted-foreground">
                Level {stats.level} {stats.streak ? `• ${stats.streak}🔥` : ""}
              </span>
            )}
            {stats?.classCode && (
              <span className="text-xs text-muted-foreground truncate">
                Class: {stats.classCode}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Bell className="h-4 w-4" />
          </Button>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{userName}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {userEmail}
                    </p>
                    <Badge variant="secondary" className="mt-1 capitalize">
                      {role}
                    </Badge>
                  </div>
                </div>

                {stats && (
                  <div className="space-y-2 p-3 rounded-lg border">
                    {stats.level !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Level</span>
                        <span className="text-sm font-medium">{stats.level}</span>
                      </div>
                    )}
                    {stats.streak !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Streak</span>
                        <span className="text-sm font-medium">{stats.streak} days 🔥</span>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  variant="destructive"
                  className="w-full"
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
