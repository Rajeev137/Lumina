import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";
import {
  Menu,
  X,
  LayoutDashboard,
  FileText,
  Database,
  Sparkles,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/rfp", label: "RFP Processing", icon: FileText },
  { to: "/knowledge", label: "Knowledge Base", icon: Database },
] as const;

function pageTitleFromPath(pathname: string) {
  if (pathname.startsWith("/rfp")) return "RFP Processing";
  if (pathname.startsWith("/knowledge")) return "Knowledge Base";
  return "Dashboard";
}

export function Header() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-surface/80 backdrop-blur-md px-4 lg:px-8">
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden flex items-center justify-center size-9 rounded-lg hover:bg-muted transition-colors"
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {/* Mobile brand */}
      <div className="lg:hidden flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-accent text-white">
          <Sparkles className="size-3.5" />
        </div>
        <span className="font-bold text-heading">Lumina</span>
      </div>

      {/* Page title (desktop only) */}
      <h1 className="hidden lg:block text-lg font-semibold text-heading">
        {pageTitleFromPath(pathname)}
      </h1>

      <div className="flex-1" />

      {/* Status dot (indicates API health visually) */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        API Connected
      </div>

      {/* Mobile slide-out nav */}
      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-50 bg-background/95 backdrop-blur-sm lg:hidden animate-in fade-in slide-in-from-left-2 duration-200">
          <nav className="flex flex-col gap-1 p-4">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:bg-muted hover:text-heading",
                  )
                }
              >
                <Icon className="size-4.5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
