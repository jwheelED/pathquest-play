import { Home, BookOpen, MessageSquare, Trophy } from "lucide-react";
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
    { icon: BookOpen, label: "Lessons", path: "/dashboard#lessons" },
    { icon: Trophy, label: "Badges", path: "/dashboard#badges" },
    { icon: MessageSquare, label: "Chat", path: "/dashboard#chat" },
  ];

  const instructorNavItems = [
    { icon: Home, label: "Dashboard", path: "/instructor/dashboard" },
    { icon: BookOpen, label: "Content", path: "/instructor/dashboard#content" },
    { icon: MessageSquare, label: "Students", path: "/instructor/dashboard#students" },
  ];

  const navItems = role === "student" ? studentNavItems : instructorNavItems;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 safe-bottom">
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.path.split("#")[0];
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full min-w-0 gap-1 transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="text-xs font-medium truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
