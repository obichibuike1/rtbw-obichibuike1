import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useMyAccount } from "@/lib/use-my-account";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, KeyRound, Loader2, LogOut, ShieldQuestion, User } from "lucide-react";
import { toast } from "sonner";
import { getMySecurityQuestion, setSecurityQuestion } from "@/lib/banking.functions";

export const Route = createFileRoute("/app/profile")({ component: Page });

const PRESET_QUESTIONS = [
  "What is the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your primary school?",
  "What is your favourite childhood nickname?",
  "What city were you born in?",
];

function Page() {
  const { user, signOut } = useAuth();
  const { account } = useMyAccount();
  const nav = useNavigate();

  const [existingQ, setExistingQ] = useState<string | null>(null);
  const [q, setQ] = useState(PRESET_QUESTIONS[0]);
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingQ, setLoadingQ] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await getMySecurityQuestion();
        setExistingQ(r.question);
        if (r.question && PRESET_QUESTIONS.includes(r.question)) setQ(r.question);
      } finally { setLoadingQ(false); }
    })();
  }, []);

  const save = async () => {
    if (!a.trim()) { toast.error("Enter an answer"); return; }
    setBusy(true);
    try {
      await setSecurityQuestion({ data: { question: q, answer: a } });
      setExistingQ(q);
      setA("");
      toast.success("Security question saved");
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-5 space-y-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <Card className="p-5 rounded-2xl flex items-center gap-4">
        <div className="size-14 rounded-full bg-primary/15 text-primary flex items-center justify-center"><User className="size-7" /></div>
        <div>
          <div className="font-semibold">{account?.full_name ?? user?.email}</div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
        </div>
      </Card>
      {account && (
        <Card className="p-5 rounded-2xl space-y-3">
          <Row k="Account number" v={account.account_number} />
          <Row k="Account type" v={account.account_type} />
        </Card>
      )}

      <Card className="p-5 rounded-2xl space-y-3">
        <div className="flex items-center gap-2">
          <ShieldQuestion className="size-5 text-primary" />
          <div className="font-semibold">Security question</div>
          {existingQ && <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-success"><Check className="size-3" /> set</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Required for large transfers (80% or more of your balance). Answers are stored hashed and case-insensitive.
        </p>
        {loadingQ ? (
          <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin mr-2" />Loading…</div>
        ) : (
          <>
            {existingQ && (
              <div className="text-xs text-muted-foreground">Current: <span className="text-foreground font-medium">{existingQ}</span></div>
            )}
            <div>
              <Label>Question</Label>
              <Select value={q} onValueChange={setQ}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESET_QUESTIONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Answer</Label>
              <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="Your answer" />
            </div>
            <Button onClick={save} disabled={busy || !a.trim()} className="w-full">
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <KeyRound className="size-4 mr-2" />}
              {existingQ ? "Update security question" : "Save security question"}
            </Button>
          </>
        )}
      </Card>

      <Button variant="outline" className="w-full" onClick={async () => { await signOut(); nav({ to: "/auth" }); }}>
        <LogOut className="size-4 mr-2" /> Sign out
      </Button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}
