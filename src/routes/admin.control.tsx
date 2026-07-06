import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isRuleOn, setSetting, useSystemSettings } from "@/lib/use-system-settings";
import { supabase } from "@/integrations/supabase/client";
import { ALL_SIMS } from "@/lib/attack-simulator";
import { Info, Activity, Zap, Bug, ShieldAlert, Rocket, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/control")({ component: ControlPanel });

const RULES: Array<{ key: string; label: string; help: string }> = [
  { key: "rule.transaction_simulator", label: "Transaction Simulator", help: "Background random transaction generator." },
  { key: "rule.xss_detection", label: "XSS Detection", help: "Scan text inputs for cross-site scripting payloads." },
  { key: "rule.sql_injection_detection", label: "SQL Injection Detection", help: "Detect classic SQLi patterns in inputs." },
  { key: "rule.brute_force_detection", label: "Brute Force Detection", help: "Rapid login attempts from one IP." },
  { key: "rule.csrf_detection", label: "CSRF Detection", help: "Reject transfer requests with foreign origins." },
  { key: "rule.enumeration_detection", label: "Account Enumeration Detection", help: "Repeated failed recipient lookups." },
  { key: "rule.session_hijack_detection", label: "Session Hijack Detection", help: "IP + fingerprint changed mid-session." },
  { key: "rule.phishing_detection", label: "Phishing URL Detection", help: "URLs in transfer narration." },
  { key: "rule.duplicate_transfer", label: "Duplicate Transfer Detection", help: "Same recipient + amount within 2 minutes." },
  { key: "rule.cap_90", label: "90% Balance Cap", help: "Block transfers over 90% of available balance." },
  { key: "rule.security_challenge_80", label: "80% Security Question Challenge", help: "Ask security question for transfers ≥80% balance." },
  { key: "rule.dormant_account", label: "Dormant Account Detection", help: "Activity on inactive accounts." },
  { key: "rule.night_activity", label: "Night Activity Detection", help: "Transactions between 00:00–05:00." },
  { key: "rule.micro_transaction", label: "Micro-Transaction Detection", help: "Small probing transfers." },
  { key: "rule.new_recipient_large", label: "New Recipient Large Transfer", help: "Large transfer to first-time recipient." },
  { key: "rule.multiple_recipients", label: "Multiple Recipients Detection", help: "Rapid transfers to many recipients." },
  { key: "rule.daily_balance_drop", label: "Daily Balance Drop Alert", help: "Large drop within a single day." },
  { key: "rule.login_lockout", label: "Login Lockout", help: "Lock account after 3 wrong passwords." },
  { key: "rule.pin_lockout", label: "PIN Lockout", help: "Lock transfers after 3 wrong PINs." },
];

const SIMS: Array<{ key: string; label: string }> = [
  { key: "sim.xss", label: "Simulate XSS Attack" },
  { key: "sim.sql", label: "Simulate SQL Injection" },
  { key: "sim.brute", label: "Simulate Brute Force" },
  { key: "sim.hijack", label: "Simulate Session Hijack" },
  { key: "sim.enum", label: "Simulate Enumeration" },
  { key: "sim.phishing", label: "Simulate Phishing" },
  { key: "sim.csrf", label: "Simulate CSRF" },
];

function ControlPanel() {
  const settings = useSystemSettings();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [resetting, setResetting] = useState(false);

  const runReset = async () => {
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc("admin_reset_demo" as any);
      if (error) throw error;
      const r = (data ?? {}) as any;
      toast.success(`Demo reset — ${r.soc_cleared ?? 0} SOC events, ${r.ips_cleared ?? 0} IPs cleared, ${r.accounts_reset ?? 0} accounts reset`);
    } catch (e: any) {
      toast.error(e.message ?? "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { data } = await supabase.from("soc_events").select("threat_type").gte("created_at", since.toISOString());
      const c: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { c[r.threat_type] = (c[r.threat_type] ?? 0) + 1; });
      setCounts(c);
    };
    load();
    const ch = supabase.channel("ctrl-counts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "soc_events" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Fire the enabled simulators on interval
  useEffect(() => {
    const running: Record<string, number> = {};
    const speeds: Record<string, number> = { "sim.xss": 30000, "sim.sql": 45000, "sim.brute": 60000, "sim.hijack": 40000, "sim.enum": 50000, "sim.phishing": 35000, "sim.csrf": 42000 };
    for (const [key, fn] of ALL_SIMS) {
      if (isRuleOn(settings, key, false) || isRuleOn(settings, "sim.full_demo", false)) {
        const delay = isRuleOn(settings, "sim.full_demo", false) ? 5000 + Math.random() * 8000 : speeds[key] ?? 30000;
        running[key] = window.setInterval(() => { fn(); }, delay) as any;
      }
    }
    return () => { Object.values(running).forEach((id) => window.clearInterval(id)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(Object.fromEntries(ALL_SIMS.map(([k]) => [k, settings[k]]))), settings["sim.full_demo"]]);

  const ruleKeyToThreat: Record<string, string[]> = useMemo(() => ({
    "rule.xss_detection": ["xss"], "rule.sql_injection_detection": ["sql_injection"],
    "rule.brute_force_detection": ["brute_force", "credential_stuffing"], "rule.csrf_detection": ["csrf"],
    "rule.enumeration_detection": ["enumeration"], "rule.session_hijack_detection": ["session_hijack"],
    "rule.phishing_detection": ["phishing"], "rule.duplicate_transfer": ["duplicate_transfer", "duplicate_attack"],
    "rule.dormant_account": ["dormant"], "rule.night_activity": ["night_activity"], "rule.micro_transaction": ["micro_transaction"],
  }), []);

  const countFor = (key: string) => (ruleKeyToThreat[key] ?? []).reduce((s, t) => s + (counts[t] ?? 0), 0);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Activity className="size-6 text-primary" /> System Control Panel</h1>
            <p className="text-sm text-muted-foreground">Master switches for every detection rule and simulator. Changes persist and apply live.</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={resetting}>
                {resetting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RotateCcw className="size-4 mr-2" />}
                Reset Demo Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all demo data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This clears every SOC event, blocked IP, security event, and transaction, resets every customer balance to $50,000, and clears all lockouts and failed-attempt counters. Detection-rule toggles are kept as-is. Use this between demo runs.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={runReset}>Reset everything</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="size-4 text-primary" /> Detection Rules</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {RULES.map((r) => {
              const on = isRuleOn(settings, r.key, true);
              return (
                <div key={r.key} className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-block size-2 rounded-full ${on ? "bg-emerald-400 shadow-[0_0_8px_theme(colors.emerald.400)]" : "bg-red-500"}`} />
                    <span className="text-sm font-medium truncate">{r.label}</span>
                    <Tooltip><TooltipTrigger asChild><Info className="size-3 text-muted-foreground shrink-0 cursor-help" /></TooltipTrigger><TooltipContent side="top" className="max-w-xs">{r.help}</TooltipContent></Tooltip>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="tabular-nums text-[10px] px-1.5">{countFor(r.key)}</Badge>
                    <Switch checked={on} onCheckedChange={(v) => setSetting(r.key, v)} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Zap className="size-4 text-primary" /> Notification Preferences</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3 p-4">
            <span className={`inline-block size-2 rounded-full ${isRuleOn(settings, "ui.sound_alerts", true) ? "bg-emerald-400" : "bg-red-500"}`} />
            <span className="text-sm font-medium flex-1">Sound Alerts (beep on RED threats)</span>
            <Switch checked={isRuleOn(settings, "ui.sound_alerts", true)} onCheckedChange={(v) => setSetting("ui.sound_alerts", v)} />
          </CardContent>
        </Card>

        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Bug className="size-4 text-orange-400" /> Attack Simulator</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Fires demo threats into the SOC feed marked with a grey <span className="px-1 border rounded bg-muted">SIMULATED</span> tag.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg border border-primary/40 bg-primary/10 flex items-center gap-3">
              <Rocket className="size-5 text-primary" />
              <div className="flex-1">
                <div className="font-semibold text-sm">Run Full Demo Mode</div>
                <div className="text-xs text-muted-foreground">Fires all simulators in staggered sequence.</div>
              </div>
              <Switch checked={isRuleOn(settings, "sim.full_demo", false)} onCheckedChange={(v) => setSetting("sim.full_demo", v)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {SIMS.map((s) => (
                <div key={s.key} className="flex items-center justify-between p-3 rounded-lg border bg-card/40">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block size-2 rounded-full ${isRuleOn(settings, s.key, false) ? "bg-orange-400 shadow-[0_0_8px_theme(colors.orange.400)]" : "bg-muted-foreground/40"}`} />
                    <span className="text-sm">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => ALL_SIMS.find(([k]) => k === s.key)?.[1]()}>Fire once</Button>
                    <Switch checked={isRuleOn(settings, s.key, false)} onCheckedChange={(v) => setSetting(s.key, v)} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
