import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Check, Loader2, Search, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { logCapRejection, lookupRecipient, sendTransfer, verifyTransferPin } from "@/lib/banking.functions";
import { useMyAccount } from "@/lib/use-my-account";
import { money } from "@/lib/format";

export const Route = createFileRoute("/app/send")({ component: SendMoney });

const PIN_LOCK_KEY = "pulsebank.pin_locked_until";

function SendMoney() {
  const nav = useNavigate();
  const { account } = useMyAccount();
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

  // PIN lockout — also persisted so refresh respects it
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(PIN_LOCK_KEY);
    if (!v) return null;
    const n = Number(v);
    return n > Date.now() ? n : null;
  });
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pinLockedUntil) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 250);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [pinLockedUntil]);
  useEffect(() => {
    if (pinLockedUntil && now >= pinLockedUntil) {
      setPinLockedUntil(null);
      window.localStorage.removeItem(PIN_LOCK_KEY);
    }
  }, [now, pinLockedUntil]);
  const pinSecondsLeft = pinLockedUntil ? Math.max(0, Math.ceil((pinLockedUntil - now) / 1000)) : 0;
  const pinLocked = !!pinLockedUntil && pinSecondsLeft > 0;

  const balance = account ? Number(account.balance) : 0;
  const cap = Math.floor(balance * 0.9 * 100) / 100;

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

  const doLookup = async () => {
    if (!acc.trim()) return;
    try {
      const r = await lookupRecipient({ data: { accountNumber: acc.trim() } });
      if (!r) { toast.error("No account found"); setRecipient(null); return; }
      setRecipient(r as any);
    } catch (e: any) { toast.error(e.message ?? "Lookup failed"); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinLocked) return;
    const amt = Number(amount);
    if (!recipient) { toast.error("Look up the recipient first"); return; }
    if (!amt || amt <= 0) { setAmountError("Enter a valid amount"); return; }

    // 90% rule — block client-side BEFORE any DB write
    if (amt > cap) {
      setAmountError(`You can only transfer up to 90% of your available balance. Maximum allowed: ${money(cap)}`);
      try {
        await logCapRejection({ data: { attemptedAmount: amt, balance, cap, recipient: recipient.account_number } });
      } catch {}
      toast.error("Transfer blocked by 90% cap rule");
      return;
    }

    if (pin.length < 4) { setPinError("Enter your 4-digit PIN"); return; }

    setBusy(true);
    setPinError(null);
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
        return;
      }

      const res = await sendTransfer({ data: { recipientAccountNumber: recipient.account_number, amount: amt, note } });
      setReceipt({ ...res, recipient, amount: amt, note });
      setStep("success");
      if ((res as any).status === "flagged") toast.warning("Transfer completed but flagged for review");
      else toast.success("Transfer sent");
    } catch (e: any) { toast.error(e.message ?? "Transfer failed"); }
    finally { setBusy(false); }
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
          <Button variant="outline" onClick={() => { setStep("form"); setRecipient(null); setAcc(""); setAmount(""); setNote(""); setPin(""); setReceipt(null); }}>New transfer</Button>
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

      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={pinLocked} className="space-y-4 disabled:opacity-60">
          <div>
            <Label>Recipient account number</Label>
            <div className="flex gap-2 mt-1">
              <Input value={acc} onChange={(e) => { setAcc(e.target.value); setRecipient(null); }} placeholder="ACC12345678" />
              <Button type="button" variant="outline" onClick={doLookup}><Search className="size-4" /></Button>
            </div>
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
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's it for?" maxLength={200} />
          </div>
          <div>
            <Label>Transfer PIN</Label>
            <Input type="password" inputMode="numeric" pattern="\d*" maxLength={6}
              value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(null); }}
              placeholder="••••" className="tracking-[0.4em] text-center text-lg h-12 mt-1" />
            {pinError && <p className="mt-1 text-xs text-destructive">{pinError}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">Default demo PIN is <span className="font-mono">1234</span>. 3 wrong PINs lock transfers for 2 minutes.</p>
          </div>
        </fieldset>
        <Button type="submit" disabled={busy || pinLocked || !recipient || !!amountError} size="lg" className="w-full h-14 rounded-2xl text-base">
          {busy ? <Loader2 className="size-5 animate-spin mr-2" /> : <Send className="size-5 mr-2" />}
          {pinLocked ? `Locked · ${Math.floor(pinSecondsLeft/60)}:${String(pinSecondsLeft%60).padStart(2,"0")}` : "Send transfer"}
        </Button>
      </form>
    </div>
  );
}

function Row({ k, v, mono, big }: { k: string; v: string; mono?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className={`${mono ? "font-mono" : ""} ${big ? "text-xl font-semibold" : "font-medium"}`}>{v}</span>
    </div>
  );
}
