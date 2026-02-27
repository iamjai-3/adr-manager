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
import { Badge } from "@/components/ui/badge";
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

  const roleColors: Record<string, string> = {
    admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    editor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  };

  const isActive = (path: string, exact = false) =>
    exact ? location === path : location.startsWith(path);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/projects">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">ADR Manager</h1>
              <p className="text-xs text-muted-foreground">Decision Records</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {projectId ? (
          // ── Inside a project ──────────────────────────────────────────────
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
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
              <SidebarGroupLabel>
                {currentProject?.name ?? "Project"}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive(`/projects/${projectId}`, true)}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={`/projects/${projectId}`} data-testid="link-dashboard">
                        <LayoutDashboard className="w-4 h-4" />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={
                        isActive(`/projects/${projectId}/adrs`) &&
                        !isActive(`/projects/${projectId}/adrs/new`) &&
                        !location.includes("/edit")
                      }
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={`/projects/${projectId}/adrs/new`} data-testid="link-create-adr">
                        <Plus className="w-4 h-4" />
                        <span>New ADR</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive(`/projects/${projectId}/requirements`)}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={`/projects/${projectId}/requirements`} data-testid="link-requirements">
                        <ListChecks className="w-4 h-4" />
                        <span>Requirements</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {(isGlobalAdmin || currentProject) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive(`/projects/${projectId}/settings`)}
                        className="data-[active=true]:bg-sidebar-accent"
                      >
                        <Link href={`/projects/${projectId}/settings`} data-testid="link-project-settings">
                          <Settings className="w-4 h-4" />
                          <span>Settings</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          // ── Projects list view ────────────────────────────────────────────
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive("/projects", true)}
                    className="data-[active=true]:bg-sidebar-accent"
                  >
                    <Link href="/projects" data-testid="link-projects">
                      <FolderKanban className="w-4 h-4" />
                      <span>All Projects</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {projectsLoading && (
                  <SidebarMenuItem>
                    <div className="px-2 py-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </SidebarMenuItem>
                )}

                {projects?.map((p) => (
                  <SidebarMenuItem key={p.id}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive(`/projects/${p.id}`)}
                      className="data-[active=true]:bg-sidebar-accent"
                    >
                      <Link href={`/projects/${p.id}`} data-testid={`link-project-${p.id}`}>
                        <span className="font-mono text-xs text-muted-foreground w-8 flex-shrink-0">
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
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive("/users")}
                    className="data-[active=true]:bg-sidebar-accent"
                  >
                    <Link href="/users" data-testid="link-users">
                      <Users className="w-4 h-4" />
                      <span>Users</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive("/audit")}
                    className="data-[active=true]:bg-sidebar-accent"
                  >
                    <Link href="/audit" data-testid="link-audit">
                      <Shield className="w-4 h-4" />
                      <span>Audit Log</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        {user && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate" data-testid="text-user-name">
                {user.displayName}
              </span>
              <Badge className={`text-[10px] px-1.5 py-0 ${roleColors[user.role]}`} data-testid="text-user-role">
                {user.role}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
