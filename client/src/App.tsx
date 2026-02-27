import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import AdrCreate from "@/pages/adr-create";
import AdrDetail from "@/pages/adr-detail";
import AdrEdit from "@/pages/adr-edit";
import AuthPage from "@/pages/auth";
import UserManagement from "@/pages/user-management";
import Projects from "@/pages/projects";
import ProjectSettings from "@/pages/project-settings";
import AuditLog from "@/pages/audit-log";
import ProjectRequirements from "@/pages/project-requirements";
import DiagramEditor from "@/pages/diagram-editor";
import AdrView from "@/pages/adr-view";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/projects" />
      </Route>
      <Route path="/projects" component={Projects} />
      <Route path="/projects/:projectId" component={Dashboard} />
      <Route path="/projects/:projectId/adrs/new" component={AdrCreate} />
      <Route path="/projects/:projectId/adrs/:id/edit" component={AdrEdit} />
      <Route path="/projects/:projectId/adrs/:id/view" component={AdrView} />
      <Route path="/projects/:projectId/adrs/:id" component={AdrDetail} />
      <Route path="/projects/:projectId/settings" component={ProjectSettings} />
      <Route path="/projects/:projectId/requirements" component={ProjectRequirements} />
      <Route path="/projects/:projectId/adrs/:adrId/diagram" component={DiagramEditor} />
      <Route path="/users" component={UserManagement} />
      <Route path="/audit" component={AuditLog} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-lg mx-auto" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-1 px-3 py-2 border-b border-border/60 sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-1.5">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProvider>
              <AuthenticatedApp />
            </AuthProvider>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
