import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { seedDemo } from "@/lib/banking.functions";
import { Activity, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const nav = useNavigate();
  const { role, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!loading && role === "admin") nav({ to: "/admin/dashboard" });
    else if (!loading && role === "customer") nav({ to: "/app/dashboard" });
  }, [role, loading, nav]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Welcome back");
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectUrl, data: { full_name: name } },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — signing you in");
  };

  const fillDemo = (em: string) => { setEmail(em); setPassword(em.startsWith("admin") ? "Admin123!" : "Customer123!"); };

  const runSeed = async () => {
    setSeeding(true);
    try { await seedDemo(); toast.success("Demo users ready"); }
    catch (e: any) { toast.error(e.message ?? "Seed failed"); }
    finally { setSeeding(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1"><Activity className="size-5 text-primary" /><span className="font-semibold">PulseBank</span></div>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Sign in to your account or create a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-3 mt-4">
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="size-4 animate-spin mr-2" />}Sign in</Button>
              </form>
              <div className="mt-6 border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Demo accounts</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Button size="sm" variant="outline" onClick={() => fillDemo("admin@demo.bank")}>admin@demo.bank</Button>
                  <Button size="sm" variant="outline" onClick={() => fillDemo("alice@demo.bank")}>alice@demo.bank</Button>
                  <Button size="sm" variant="outline" onClick={() => fillDemo("bob@demo.bank")}>bob@demo.bank</Button>
                  <Button size="sm" variant="outline" onClick={() => fillDemo("carol@demo.bank")}>carol@demo.bank</Button>
                </div>
                <Button size="sm" variant="ghost" className="w-full mt-3" onClick={runSeed} disabled={seeding}>
                  {seeding && <Loader2 className="size-3 animate-spin mr-2" />}
                  {seeding ? "Seeding demo users…" : "Seed demo users (first run)"}
                </Button>
                <p className="mt-2 text-[10px] text-muted-foreground">Admin: Admin123! · Customers: Customer123!</p>
              </div>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-3 mt-4">
                <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
                <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="size-4 animate-spin mr-2" />}Create account</Button>
                <p className="text-xs text-muted-foreground">New sign-ups create a customer account. Admin access is seeded.</p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
