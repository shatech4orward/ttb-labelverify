import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu,
  SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger,
} from "@/components/ui/sidebar";
import { LayoutDashboard, ScanLine, Layers, ClipboardList, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/verify", label: "Verify Label", icon: ScanLine },
  { href: "/batch", label: "Batch Upload", icon: Layers },
  { href: "/queue", label: "Review Queue", icon: ClipboardList },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 pt-4 pb-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          {/* SVG Logo */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="TTB Label Verify" className="shrink-0">
            <rect width="28" height="28" rx="6" fill="hsl(var(--primary))" />
            <rect x="6" y="7" width="16" height="14" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
            <line x1="9" y1="11" x2="19" y2="11" stroke="white" strokeWidth="1.2" />
            <line x1="9" y1="14" x2="16" y2="14" stroke="white" strokeWidth="1.2" />
            <circle cx="20" cy="20" r="5" fill="hsl(var(--primary))" />
            <path d="M17.5 20l1.8 1.8 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-sidebar-foreground leading-none">LabelVerify</p>
            <p className="text-xs text-muted-foreground mt-0.5">TTB Compliance Tool</p>
          </div>
        </div>
        <SidebarTrigger className="absolute top-4 right-3 text-muted-foreground" />
      </SidebarHeader>

      <SidebarContent className="px-2 pt-3">
        <SidebarMenu>
          {navItems.map(({ href, label, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                asChild
                isActive={location === href}
                className="w-full"
                data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <Link href={href} className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm">
                  <Icon size={16} className="shrink-0" />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4 border-t border-sidebar-border pt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">TTB / ATF Prototype v1.0</p>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-7 w-7"
            data-testid="button-theme-toggle"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
