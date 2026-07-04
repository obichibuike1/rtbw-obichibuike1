import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Check, Copy, Loader2, Search, Send, ShieldAlert, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import {
  checkDuplicateTransfer,
  getMySecurityQuestion,
  logCapRejection,
  logDuplicateAttempt,
  logSecurityChallengeTriggered,
  lookupRecipient,
  sendTransfer,
  verifySecurityAnswer,
  verifyTransferPin,
} from "@/lib/banking.functions";
import { useMyAccount } from "@/lib/use-my-account";
import { money } from "@/lib/format";
import { detectPhishing, detectSql, detectXss, logSocEvent, stripUrls } from "@/lib/soc";

export const Route = createFileRoute("/app/send")({ component: SendMoney });

const PIN_LOCK_KEY = "pulsebank.pin_locked_until";
const SEND_LOCK_KEY = "pulsebank.send_locked_until";

function SendMoney() {
  const nav = useNavigate();
  const { account, reload: reloadAccount } = useMyAccount();
  const [step, setStep] = useState<"form" | "success">("form");
  const [acc, setAcc] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [recipient, setRecipient] = useState<{ full_name: string; account_number: string; account_type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const failedLookupsRef = useRef<number>(0);
  const dupAttemptRef = useRef<Array<{ acc: string; amt: number; t: number }>>([]);

  // Duplicate detection modal
  const [dupInfo, setDupInfo] = useState<{ secondsAgo: number; amount: number } | null>(null);

  // Security question modal
  const [securityOpen, setSecurityOpen] = useState(false);
  const [securityQ, setSecurityQ] = useState<string | null>(null);
  const [securityA, setSecurityA] = useState("");
  const [securityErr, setSecurityErr] = useState<string | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityPassed, setSecurityPassed] = useState(false);

  // Live clock
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  // PIN lockout — persisted so refresh respects it
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(PIN_LOCK_KEY);
    if (!v) return null;
    const n = Number(v);
    return n > Date.now() ? n : null;
  });

  // Send lockout (security question) — also persisted + backed by DB column
  const [sendLockedUntil, setSendLockedUntil] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(SEND_LOCK_KEY);
    if (!v) return null;
    const n = Number(v);
    return n > Date.now() ? n : null;
  });

  // Sync DB send lock into local state whenever account loads
  useEffect(() => {
    if (account?.send_locked_until) {
      const t = new Date(account.send_locked_until).getTime();
      if (t > Date.now()) {
        setSendLockedUntil(t);
        window.localStorage.setItem(SEND_LOCK_KEY, String(t));
      }
    }
  }, [account]);

  useEffect(() => {
    if (!pinLockedUntil && !sendLockedUntil) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 250);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [pinLockedUntil, sendLockedUntil]);

  useEffect(() => {
    if (pinLockedUntil && now >= pinLockedUntil) {
      setPinLockedUntil(null);
      window.localStorage.removeItem(PIN_LOCK_KEY);
    }
    if (sendLockedUntil && now >= sendLockedUntil) {
      setSendLockedUntil(null);
      window.localStorage.removeItem(SEND_LOCK_KEY);
    }
  }, [now, pinLockedUntil, sendLockedUntil]);

  const pinSecondsLeft = pinLockedUntil ? Math.max(0, Math.ceil((pinLockedUntil - now) / 1000)) : 0;
  const sendSecondsLeft = sendLockedUntil ? Math.max(0, Math.ceil((sendLockedUntil - now) / 1000)) : 0;
  const pinLocked = !!pinLockedUntil && pinSecondsLeft > 0;
  const sendLocked = !!sendLockedUntil && sendSecondsLeft > 0;
  const anyLocked = pinLocked || sendLocked;

  const balance = account ? Number(account.balance) : 0;
  const cap = Math.floor(balance * 0.9 * 100) / 100;
  const parsedAmount = Number(amount) || 0;
  const percentOfBalance = balance > 0 ? (parsedAmount / balance) * 100 : 0;

  // Live 90% cap validation
  useEffect(() => {
    const amt = Number(amount);
    if (!amount) { setAmountError(null); return; }
    if (!isFinite(amt) || amt <= 0) { setAmountError("Enter a valid amount"); return; }
    if (account && amt > cap) {
      setAmountError(`You can only transfer up to 90% of your available balance. Maximum allowed: ${money(cap)}`);
    } else {
      setAmountError(null);
    }
  }, [amount, cap, account]);

  // Reset security pass if amount/recipient change
  useEffect(() => { setSecurityPassed(false); }, [amount, acc]);

  const doLookup = async () => {
    if (!acc.trim()) return;
    setLookupError(null);
    // XSS/SQL scan on the account number field
    const xss = detectXss(acc); const sql = detectSql(acc);
    if (xss.hit || sql.hit) {
      await logSocEvent({
        threat_type: xss.hit ? "xss" : "sql_injection", severity: "red",
        field: "send.recipient", payload: (xss.match ?? sql.match) as string,
      });
      setLookupError("Invalid characters detected. Please enter plain text only.");
      return;
    }
    try {
      const r = await lookupRecipient({ data: { accountNumber: acc.trim() } });
      if (!r) {
        failedLookupsRef.current++;
        await logSocEvent({
          threat_type: "enumeration", severity: "orange", field: "send.recipient",
          payload: `Failed lookup: ${acc.trim()}`, details: { attempts: failedLookupsRef.current },
        });
        if (failedLookupsRef.current >= 3) {
          setLookupError("Too many failed searches. Please try again in 5 minutes.");
          setTimeout(() => { failedLookupsRef.current = 0; setLookupError(null); }, 5 * 60_000);
        } else {
          toast.error("No account found");
        }
        setRecipient(null);
        return;
      }
      failedLookupsRef.current = 0;
      setRecipient(r as any);
    } catch (e: any) { toast.error(e.message ?? "Lookup failed"); }
  };


  // Actually run the transfer (called by submit or by "Yes, Send Anyway")
  const performTransfer = async (opts: { confirmDuplicate?: boolean } = {}) => {
    if (!recipient) return;
    const amt = Number(amount);
    setBusy(true);
    setPinError(null);
    try {
      const res: any = await sendTransfer({
        data: {
          recipientAccountNumber: recipient.account_number,
          amount: amt,
          note,
          confirmDuplicate: opts.confirmDuplicate ?? false,
        },
      });
      setReceipt({ ...res, recipient, amount: amt, note });
      setStep("success");
      if (res.duplicate_confirmed) toast.warning("Duplicate transfer sent — flagged for review");
      else if (res.status === "flagged") toast.warning("Transfer completed but flagged for review");
      else toast.success("Transfer sent");
    } catch (e: any) {
      if (e.code === "DUPLICATE_DETECTED") {
        setDupInfo({ secondsAgo: e.secondsAgo ?? 0, amount: amt });
      } else {
        toast.error(e.message ?? "Transfer failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (anyLocked) return;
    const amt = Number(amount);
    if (!recipient) { toast.error("Look up the recipient first"); return; }
    if (!amt || amt <= 0) { setAmountError("Enter a valid amount"); return; }

    // XSS/SQL scan on note
    const xssNote = detectXss(note);
    const sqlNote = detectSql(note);
    if (xssNote.hit) {
      await logSocEvent({ threat_type: "xss", severity: "red", field: "narration", payload: xssNote.match });
      setNoteError("Invalid characters detected. Please enter plain text only.");
      setNote("");
      return;
    }
    if (sqlNote.hit) {
      await logSocEvent({ threat_type: "sql_injection", severity: "red", field: "narration", payload: sqlNote.match });
      setNoteError("Invalid characters detected. Please enter plain text only.");
      setNote("");
      return;
    }
    // Phishing URL scan — strip, warn, escalate if large
    const phish = detectPhishing(note);
    if (phish.hit) {
      const isLarge = amt >= balance * 0.5;
      await logSocEvent({
        threat_type: "phishing", severity: isLarge ? "red" : "yellow", field: "narration",
        payload: phish.match, details: { amount: amt, large: isLarge },
      });
      setNote(stripUrls(note));
      setNoteError("URLs are not allowed in transfer notes.");
      return;
    }

    // Duplicate-attack detection (4+ same tx to same recipient within 5min)
    const nowT = Date.now();
    dupAttemptRef.current = dupAttemptRef.current.filter((r) => nowT - r.t < 5 * 60_000);
    dupAttemptRef.current.push({ acc: recipient.account_number, amt, t: nowT });
    const repeats = dupAttemptRef.current.filter((r) => r.acc === recipient.account_number && r.amt === amt).length;
    if (repeats >= 4) {
      await logSocEvent({
        threat_type: "duplicate_attack", severity: "red", field: "send",
        payload: `${repeats} identical transfers to ${recipient.account_number} within 5min`,
        details: { recipient: recipient.account_number, amount: amt },
      });
      toast.error("Automated duplicate transfer attack detected. Transfers blocked for 10 minutes.");
      return;
    }

    // 90% rule — block client-side BEFORE any DB write
    if (amt > cap) {
      setAmountError(`You can only transfer up to 90% of your available balance. Maximum allowed: ${money(cap)}`);
      try {
        await logCapRejection({ data: { attemptedAmount: amt, balance, cap, recipient: recipient.account_number } });
      } catch {}
      toast.error("Transfer blocked by 90% cap rule");
      return;
    }


    // 80% security-question challenge (BEFORE PIN)
    if (!securityPassed && balance > 0 && amt / balance >= 0.8 && amt <= cap) {
      setBusy(true);
      try {
        const q = await getMySecurityQuestion();
        if (!q.question) {
          toast.error("Set a security question in your Profile to send this amount.");
          setBusy(false);
          return;
        }
        setSecurityQ(q.question);
        setSecurityA("");
        setSecurityErr(null);
        setSecurityOpen(true);
        try { await logSecurityChallengeTriggered({ data: { amount: amt, balance } }); } catch {}
      } finally { setBusy(false); }
      return; // wait for modal to complete
    }

    if (pin.length < 4) { setPinError("Enter your 4-digit PIN"); return; }

    setBusy(true);
    try {
      // PIN verification (server tracks attempts + lockout)
      const pinRes = await verifyTransferPin({ data: { pin } });
      if (!pinRes.ok) {
        if (pinRes.locked && pinRes.until) {
          const until = new Date(pinRes.until).getTime();
          setPinLockedUntil(until);
          window.localStorage.setItem(PIN_LOCK_KEY, String(until));
          toast.error("Transfers locked for 2 minutes due to repeated incorrect PIN");
        } else {
          setPinError(`Incorrect PIN${pinRes.remaining != null ? ` · ${pinRes.remaining} attempt${pinRes.remaining===1?"":"s"} left` : ""}`);
        }
        setPin("");
        setBusy(false);
        return;
      }

      // Pre-check duplicate so we can show modal without a failed insert
      const dup = await checkDuplicateTransfer({ data: { recipientAccountNumber: recipient.account_number, amount: amt } });
      setBusy(false);
      if (dup.found) {
        setDupInfo({ secondsAgo: dup.seconds_ago ?? 0, amount: amt });
        return;
      }

      await performTransfer({ confirmDuplicate: false });
    } catch (e: any) {
      toast.error(e.message ?? "Transfer failed");
      setBusy(false);
    }
  };

  const onSecuritySubmit = async () => {
    if (!securityA.trim() || securityBusy) return;
    setSecurityBusy(true);
    setSecurityErr(null);
    try {
      const r = await verifySecurityAnswer({ data: { answer: securityA, amount: parsedAmount, balance } });
      if (r.ok) {
        setSecurityPassed(true);
        setSecurityOpen(false);
        toast.success("Security question passed — enter your PIN");
      } else if (r.locked && r.until) {
        const until = new Date(r.until).getTime();
        setSendLockedUntil(until);
        window.localStorage.setItem(SEND_LOCK_KEY, String(until));
        setSecurityOpen(false);
        reloadAccount();
        toast.error("Send Money locked for 5 minutes — high-value transfer alert raised");
      } else {
        setSecurityErr(`Incorrect answer. You have ${r.remaining ?? 0} attempt${r.remaining === 1 ? "" : "s"} remaining.`);
        setSecurityA("");
      }
    } catch (e: any) {
      setSecurityErr(e.message ?? "Verification failed");
    } finally {
      setSecurityBusy(false);
    }
  };

  if (step === "success" && receipt) {
    return (
      <div className="p-5 space-y-5">
        <div className="flex justify-center pt-6">
          <div className="size-16 rounded-full bg-success/15 text-success flex items-center justify-center"><Check className="size-8" /></div>
        </div>
        <h1 className="text-center text-xl font-semibold">Transfer sent</h1>
        <Card className="p-5 rounded-2xl space-y-3">
          <Row k="Amount" v={money(receipt.amount)} big />
          <Row k="To" v={receipt.recipient.full_name} />
          <Row k="Account" v={receipt.recipient.account_number} mono />
          {receipt.note && <Row k="Note" v={receipt.note} />}
          <Row k="Status" v={receipt.status === "flagged" ? "Flagged for review" : "Completed"} />
          {receipt.reason && <Row k="Reason" v={receipt.reason} />}
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => { setStep("form"); setRecipient(null); setAcc(""); setAmount(""); setNote(""); setPin(""); setReceipt(null); setSecurityPassed(false); }}>New transfer</Button>
          <Button onClick={() => nav({ to: "/app/dashboard" })}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost"><Link to="/app/dashboard"><ArrowLeft className="size-5" /></Link></Button>
        <h1 className="text-xl font-semibold">Send Money</h1>
      </div>

      {account && (
        <Card className="p-4 rounded-2xl bg-muted/50">
          <div className="text-xs text-muted-foreground">Available balance</div>
          <div className="text-lg font-semibold tabular-nums">{money(account.balance)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">90% transfer cap: <span className="font-medium">{money(cap)}</span></div>
          {parsedAmount > 0 && balance > 0 && (
            <div className={`text-[11px] mt-1 ${percentOfBalance >= 80 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              This is {percentOfBalance.toFixed(1)}% of your balance{percentOfBalance >= 80 && percentOfBalance < 90 ? " — security question required" : ""}.
            </div>
          )}
        </Card>
      )}

      {pinLocked && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          <ShieldAlert className="size-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Transfers temporarily locked due to repeated incorrect PIN.</div>
            <div className="tabular-nums">Try again in {Math.floor(pinSecondsLeft/60)}:{String(pinSecondsLeft%60).padStart(2,"0")}</div>
          </div>
        </div>
      )}

      {sendLocked && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          <ShieldQuestion className="size-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Send Money locked — 3 failed security answers on a high-value transfer.</div>
            <div className="tabular-nums">Try again in {Math.floor(sendSecondsLeft/60)}:{String(sendSecondsLeft%60).padStart(2,"0")}</div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={anyLocked} className="space-y-4 disabled:opacity-60">
          <div>
            <Label>Recipient account number</Label>
            <div className="flex gap-2 mt-1">
              <Input value={acc} onChange={(e) => { setAcc(e.target.value); setRecipient(null); }} placeholder="ACC12345678" />
              <Button type="button" variant="outline" onClick={doLookup}><Search className="size-4" /></Button>
            </div>
            {lookupError && <p className="mt-1 text-xs text-destructive">{lookupError}</p>}
            {recipient && (
              <div className="mt-2 p-3 rounded-xl bg-accent text-sm">
                Sending to <span className="font-semibold">{recipient.full_name}</span> · <span className="font-mono">{recipient.account_number}</span>
              </div>
            )}
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
              className={`text-2xl h-14 mt-1 tabular-nums ${amountError ? "border-destructive focus-visible:ring-destructive" : ""}`} />
            {amountError && <p className="mt-1 text-xs text-destructive">{amountError}</p>}
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => { setNote(e.target.value); setNoteError(null); }} placeholder="What's it for?" maxLength={200}
              className={noteError ? "border-destructive focus-visible:ring-destructive" : ""} />
            {noteError && <p className="mt-1 text-xs text-destructive">{noteError}</p>}
          </div>

          <div>
            <Label>Transfer PIN</Label>
            <PasswordInput inputMode="numeric" pattern="\d*" maxLength={6}
              value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(null); }}
              placeholder="••••" className="tracking-[0.4em] text-center text-lg h-12 mt-1" />

            {pinError && <p className="mt-1 text-xs text-destructive">{pinError}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">Default demo PIN is <span className="font-mono">1234</span>. 3 wrong PINs lock transfers for 2 minutes.</p>
          </div>
        </fieldset>
        <Button type="submit" disabled={busy || anyLocked || !recipient || !!amountError} size="lg" className="w-full h-14 rounded-2xl text-base">
          {busy ? <Loader2 className="size-5 animate-spin mr-2" /> : <Send className="size-5 mr-2" />}
          {pinLocked ? `PIN Locked · ${Math.floor(pinSecondsLeft/60)}:${String(pinSecondsLeft%60).padStart(2,"0")}` :
           sendLocked ? `Send Locked · ${Math.floor(sendSecondsLeft/60)}:${String(sendSecondsLeft%60).padStart(2,"0")}` :
           "Send transfer"}
        </Button>
      </form>

      {/* Duplicate transfer modal */}
      <Dialog open={!!dupInfo} onOpenChange={(o) => { if (!o) setDupInfo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Copy className="size-5" /> Duplicate transfer detected
            </DialogTitle>
            <DialogDescription>
              You already sent <span className="font-semibold">{dupInfo ? money(dupInfo.amount) : ""}</span> to{" "}
              <span className="font-semibold">{recipient?.full_name ?? recipient?.account_number}</span>{" "}
              {dupInfo ? formatAgo(dupInfo.secondsAgo) : ""} ago. Are you sure you want to send again?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!recipient || !dupInfo) { setDupInfo(null); return; }
                try {
                  await logDuplicateAttempt({
                    data: {
                      recipientAccountNumber: recipient.account_number,
                      amount: dupInfo.amount,
                      resolution: "cancelled",
                      secondsAgo: dupInfo.secondsAgo,
                    },
                  });
                } catch {}
                setDupInfo(null);
                toast.info("Duplicate transfer cancelled");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setDupInfo(null);
                await performTransfer({ confirmDuplicate: true });
              }}
            >
              Yes, Send Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Security question modal */}
      <Dialog open={securityOpen} onOpenChange={(o) => { if (!o) setSecurityOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldQuestion className="size-5 text-primary" /> Security check
            </DialogTitle>
            <DialogDescription>
              You are about to send a large portion of your balance. Please answer your security question to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-muted text-sm font-medium">{securityQ}</div>
            <Input
              autoFocus
              value={securityA}
              onChange={(e) => { setSecurityA(e.target.value); setSecurityErr(null); }}
              placeholder="Your answer"
              onKeyDown={(e) => { if (e.key === "Enter") onSecuritySubmit(); }}
            />
            {securityErr && <p className="text-xs text-destructive">{securityErr}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setSecurityOpen(false)}>Cancel</Button>
            <Button onClick={onSecuritySubmit} disabled={securityBusy || !securityA.trim()}>
              {securityBusy && <Loader2 className="size-4 animate-spin mr-2" />}Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatAgo(seconds: number) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} minute${m === 1 ? "" : "s"}` : `${m}m ${s}s`;
}

function Row({ k, v, mono, big }: { k: string; v: string; mono?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className={`${mono ? "font-mono" : ""} ${big ? "text-xl font-semibold" : "font-medium"}`}>{v}</span>
    </div>
  );
}
