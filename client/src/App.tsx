import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import Dashboard from "@/pages/Dashboard";
import Verify from "@/pages/Verify";
import BatchVerify from "@/pages/BatchVerify";
import ReviewQueue from "@/pages/ReviewQueue";
import JobDetail from "@/pages/JobDetail";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/verify" component={Verify} />
            <Route path="/batch" component={BatchVerify} />
            <Route path="/queue" component={ReviewQueue} />
            <Route path="/jobs/:id" component={JobDetail} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
