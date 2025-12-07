import { Home, BookOpen, Radio, Trophy } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  role: "student" | "instructor";
}

export function BottomNav({ role }: BottomNavProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  const studentNavItems = [
    { icon: Home, label: "Home", path: "/dashboard" },
    { icon: Radio, label: "Join Live", path: "/join" },
    { icon: BookOpen, label: "Train", path: "/training" },
    { icon: Trophy, label: "Badges", path: "/dashboard#badges" },
  ];

  const instructorNavItems = [
    { icon: Home, label: "Dashboard", path: "/instructor/dashboard" },
    { icon: BookOpen, label: "Content", path: "/instructor/dashboard#content" },
  ];

  const navItems = role === "student" ? studentNavItems : instructorNavItems;

  return (
    <nav className="md:hidden fixed bottom-4 left-4 right-4 z-50">
      <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl border border-border/50 px-2 py-2 safe-bottom">
        <div className="flex justify-around items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path.split("#")[0];
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 py-2 px-3 rounded-xl transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className={cn("h-5 w-5 mb-0.5", isActive && "animate-float")} />
                <span className="text-[11px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
