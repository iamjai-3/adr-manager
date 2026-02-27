import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  FileText,
  Plus,
  Users,
  LogOut,
  FolderKanban,
  Settings,
  ChevronLeft,
  Shield,
  ListChecks,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";

function useProjectContext() {
  const [location] = useLocation();
  const match = location.match(/^\/projects\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
      {initials}
    </div>
  );
}

const roleStyles: Record<string, string> = {
  admin: "text-rose-600 dark:text-rose-400",
  editor: "text-blue-600 dark:text-blue-400",
  viewer: "text-muted-foreground",
};

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const projectId = useProjectContext();

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user,
  });

  const { data: currentProject } = useQuery<Project>({
    queryKey: ["/api/projects", String(projectId)],
    enabled: !!projectId,
  });

  const isGlobalAdmin = user?.role === "admin";

  const isActive = (path: string, exact = false) =>
    exact ? location === path : location.startsWith(path);

  const navItem = (
    href: string,
    label: string,
    Icon: React.ElementType,
    active: boolean,
    testId?: string
  ) => (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        data-active={active}
        className="data-[active=true]:bg-primary/8 data-[active=true]:text-primary data-[active=true]:font-medium relative"
      >
        <Link href={href} data-testid={testId}>
          {active && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r-full" />
          )}
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3 border-b border-sidebar-border/60">
        <Link href="/projects">
          <div className="flex items-center gap-2.5 cursor-pointer" data-testid="link-home">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <FileText className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight leading-none">ADR Manager</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                Decision Records
              </p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="pt-2">
        {projectId ? (
          <>
            <SidebarGroup className="pt-1 pb-0">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="text-muted-foreground hover:text-foreground">
                      <Link href="/projects" data-testid="link-all-projects">
                        <ChevronLeft className="w-4 h-4" />
                        <span>All Projects</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold px-2">
                {currentProject?.name ?? "Project"}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItem(
                    `/projects/${projectId}`,
                    "Dashboard",
                    LayoutDashboard,
                    isActive(`/projects/${projectId}`, true),
                    "link-dashboard"
                  )}
                  {navItem(
                    `/projects/${projectId}/adrs/new`,
                    "New ADR",
                    Plus,
                    isActive(`/projects/${projectId}/adrs/new`),
                    "link-create-adr"
                  )}
                  {navItem(
                    `/projects/${projectId}/requirements`,
                    "Requirements",
                    ListChecks,
                    isActive(`/projects/${projectId}/requirements`),
                    "link-requirements"
                  )}
                  {(isGlobalAdmin || currentProject) &&
                    navItem(
                      `/projects/${projectId}/settings`,
                      "Settings",
                      Settings,
                      isActive(`/projects/${projectId}/settings`),
                      "link-project-settings"
                    )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold px-2">
              Projects
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItem("/projects", "All Projects", FolderKanban, isActive("/projects", true), "link-projects")}

                {projectsLoading && (
                  <SidebarMenuItem>
                    <div className="px-2 py-1.5 space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3.5 w-20" />
                    </div>
                  </SidebarMenuItem>
                )}

                {projects?.map((p) => (
                  <SidebarMenuItem key={p.id}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive(`/projects/${p.id}`)}
                      className="data-[active=true]:bg-primary/8 data-[active=true]:text-primary data-[active=true]:font-medium relative"
                    >
                      <Link href={`/projects/${p.id}`} data-testid={`link-project-${p.id}`}>
                        {isActive(`/projects/${p.id}`) && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r-full" />
                        )}
                        <span className="font-mono text-[10px] text-muted-foreground w-8 flex-shrink-0 font-medium">
                          {p.key}
                        </span>
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isGlobalAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold px-2">
              Administration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItem("/users", "Users", Users, isActive("/users"), "link-users")}
                {navItem("/audit", "Audit Log", Shield, isActive("/audit"), "link-audit")}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-sidebar-border/60">
        {user && (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 px-1">
              <UserAvatar name={user.displayName} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate leading-none" data-testid="text-user-name">
                  {user.displayName}
                </p>
                <p className={`text-[10px] mt-0.5 leading-none font-medium capitalize ${roleStyles[user.role] || "text-muted-foreground"}`} data-testid="text-user-role">
                  {user.role}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground h-8 px-2 text-xs"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Sign out
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
