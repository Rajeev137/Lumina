import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";
import { LayoutDashboard, FileText, Database, Sparkles } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/rfp", label: "RFP Processing", icon: FileText },
  { to: "/knowledge", label: "Knowledge Base", icon: Database },
] as const;

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border bg-surface">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-6 h-16 border-b border-border">
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
          <Sparkles className="size-4" />
        </div>
        <span className="text-lg font-bold tracking-tight text-heading">
          Lumina
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-heading",
              )
            }
          >
            <Icon className="size-4.5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border text-xs text-muted-foreground">
        Lumina v1.0 — RFP Automator
      </div>
    </aside>
  );
}
