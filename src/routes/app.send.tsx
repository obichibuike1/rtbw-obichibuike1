import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Check, Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { lookupRecipient, sendTransfer } from "@/lib/banking.functions";
import { useMyAccount } from "@/lib/use-my-account";
import { money } from "@/lib/format";

export const Route = createFileRoute("/app/send")({ component: SendMoney });

function SendMoney() {
  const nav = useNavigate();
  const { account } = useMyAccount();
  const [step, setStep] = useState<"form" | "success">("form");
  const [acc, setAcc] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState<{ full_name: string; account_number: string; account_type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);

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
    const amt = Number(amount);
    if (!recipient) { toast.error("Look up the recipient first"); return; }
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (account && amt > Number(account.balance)) { toast.error("Insufficient balance"); return; }
    setBusy(true);
    try {
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
          <Button variant="outline" onClick={() => { setStep("form"); setRecipient(null); setAcc(""); setAmount(""); setNote(""); setReceipt(null); }}>New transfer</Button>
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
        </Card>
      )}

      <form onSubmit={submit} className="space-y-4">
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
          <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-2xl h-14 mt-1 tabular-nums" />
        </div>
        <div>
          <Label>Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's it for?" maxLength={200} />
        </div>
        <Button type="submit" disabled={busy || !recipient} size="lg" className="w-full h-14 rounded-2xl text-base">
          {busy ? <Loader2 className="size-5 animate-spin mr-2" /> : <Send className="size-5 mr-2" />} Send transfer
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
