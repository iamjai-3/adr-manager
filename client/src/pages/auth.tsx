import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    } catch (err: any) {
      const msg = err.message || "Something went wrong";
      const cleaned = msg.replace(/^\d+:\s*/, "").replace(/^"(.*)"$/, "$1");
      let parsed = cleaned;
      try {
        const obj = JSON.parse(cleaned);
        parsed = obj.message || cleaned;
      } catch {}
      toast({ title: effectiveIsLogin && !showRegister ? "Login failed" : "Registration failed", description: parsed, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (setupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-96 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-xl" data-testid="text-auth-title">
              {setupNeeded && !isLogin
                ? "Create Admin Account"
                : "Sign in to ADR Manager"}
            </CardTitle>
            <CardDescription>
              {setupNeeded && !isLogin
                ? "Set up the first admin account to get started"
                : "Enter your credentials to access your team's decisions"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {showRegister && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    placeholder="Jane Architect"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    data-testid="input-display-name"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="jane.architect"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  data-testid="input-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-auth-submit">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {showRegister ? "Creating admin account..." : "Signing in..."}
                  </>
                ) : (
                  showRegister ? "Create Admin Account" : "Sign In"
                )}
              </Button>
            </form>

            {setupNeeded && (
              <div className="mt-4 text-center text-sm">
                <span className="text-muted-foreground">
                  {isLogin ? "No accounts exist yet." : "Already have an account?"}
                </span>{" "}
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
              </div>
            )}

            {!setupNeeded && (
              <p className="mt-4 text-xs text-muted-foreground text-center">
                Need an account? Contact your team admin.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="hidden lg:flex flex-1 bg-muted items-center justify-center p-12">
        <div className="max-w-md space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">
            Architecture Decision Records
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Capture the "why" behind technical decisions. Track proposals, reviews,
            and approvals with full version history and team collaboration.
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm">Track decisions from draft to acceptance</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm">Full version history and audit trail</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm">Admin-managed team access with role-based permissions</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
