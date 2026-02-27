import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { FileText, Loader2, GitBranch, Search, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FEATURES = [
  { icon: GitBranch, text: "Track decisions from draft to acceptance" },
  { icon: History, text: "Full version history and audit trail" },
  { icon: Search, text: "AI-queryable knowledge across your org" },
];

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, register } = useAuth();
  const { toast } = useToast();

  const { data: setupData, isLoading: setupLoading } = useQuery<{ setupNeeded: boolean }>({
    queryKey: ["/api/auth/setup-needed"],
  });

  const setupNeeded = setupData?.setupNeeded === true;
  const showRegister = !isLogin && setupNeeded;
  const effectiveIsLogin = setupNeeded ? isLogin : true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (effectiveIsLogin && !showRegister) {
        await login(username, password);
      } else {
        await register(username, password, displayName);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const cleaned = msg.replace(/^\d+:\s*/, "").replace(/^"(.*)"$/, "$1");
      let parsed = cleaned;
      try {
        const obj = JSON.parse(cleaned) as { message?: string };
        parsed = obj.message || cleaned;
      } catch {
        // keep cleaned as-is
      }
      toast({
        title: effectiveIsLogin && !showRegister ? "Login failed" : "Registration failed",
        description: parsed,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (setupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 w-full max-w-sm px-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Brand Panel ── */}
      <div
        className="hidden lg:flex flex-[1.1] flex-col relative overflow-hidden"
        style={{
          background: "hsl(234 12% 8%)",
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.055) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      >
        {/* Gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 30% 40%, rgba(99,102,241,0.13) 0%, transparent 70%)",
          }}
        />

        <div className="relative flex flex-col h-full p-10">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-sm tracking-tight">ADR Manager</span>
          </div>

          {/* Main copy */}
          <div className="flex-1 flex flex-col justify-center max-w-xs">
            <h2 className="text-[1.75rem] font-bold text-white leading-[1.25] tracking-tight">
              Every architecture decision,{" "}
              <span className="text-indigo-400">documented and traceable.</span>
            </h2>
            <p className="mt-4 text-white/45 text-sm leading-relaxed">
              Capture the <em>why</em> behind technical choices. Build a knowledge base your
              whole team can trust and query.
            </p>

            <ul className="mt-8 space-y-3.5">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-md bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3 h-3 text-indigo-400" />
                  </div>
                  <span className="text-sm text-white/60">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/20 font-medium tracking-wide uppercase">
            Architecture · Decisions · Records
          </p>
        </div>
      </div>

      {/* ── Form Panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm">ADR Manager</span>
          </div>

          <div className="mb-8">
            <h1
              className="text-2xl font-bold tracking-tight text-foreground"
              data-testid="text-auth-title"
            >
              {setupNeeded && !isLogin ? "Create admin account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {setupNeeded && !isLogin
                ? "Set up the first admin account to get started"
                : "Sign in to access your team's decisions"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {showRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-sm font-medium">
                  Display Name
                </Label>
                <Input
                  id="displayName"
                  placeholder="Jane Architect"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="h-10"
                  data-testid="input-display-name"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-medium">
                Username
              </Label>
              <Input
                id="username"
                placeholder="jane.architect"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="h-10"
                data-testid="input-username"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10"
                data-testid="input-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-10 mt-2 font-medium"
              disabled={isSubmitting}
              data-testid="button-auth-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {showRegister ? "Creating account..." : "Signing in..."}
                </>
              ) : showRegister ? (
                "Create Admin Account"
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          {setupNeeded && (
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {isLogin ? "No accounts exist yet." : "Already have an account?"}{" "}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setUsername("");
                  setPassword("");
                  setDisplayName("");
                }}
                data-testid="button-toggle-auth"
              >
                {isLogin ? "Create first admin" : "Sign in"}
              </button>
            </p>
          )}

          {!setupNeeded && (
            <p className="mt-5 text-xs text-muted-foreground text-center">
              Need an account? Contact your team admin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
