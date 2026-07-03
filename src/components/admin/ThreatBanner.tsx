import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, X } from "lucide-react";
import { THREAT_META, SEVERITY_STYLE } from "@/lib/soc";
import { isRuleOn, useSystemSettings } from "@/lib/use-system-settings";

type Evt = {
  id: string; threat_type: string; severity: "red" | "orange" | "yellow" | "blue";
  ip_address: string | null; created_at: string; simulated: boolean; payload: string | null;
};

export function ThreatBanner() {
  const [evt, setEvt] = useState<Evt | null>(null);
  const timerRef = useRef<number | null>(null);
  const settings = useSystemSettings();
  const soundOn = isRuleOn(settings, "ui.sound_alerts", true);

  useEffect(() => {
    const ch = supabase.channel("threat-banner")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "soc_events" }, (payload) => {
        const e = payload.new as Evt;
        setEvt(e);
        if (e.severity === "red" && soundOn) beep();
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setEvt(null), 10000);
      }).subscribe();
    return () => { supabase.removeChannel(ch); if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [soundOn]);

  if (!evt) return null;
  const meta = THREAT_META[evt.threat_type] ?? { label: evt.threat_type };
  const time = new Date(evt.created_at).toLocaleTimeString();
  const bg = evt.severity === "red" ? "bg-red-700" : evt.severity === "orange" ? "bg-orange-600" : evt.severity === "yellow" ? "bg-yellow-500 text-black" : "bg-blue-700";

  return (
    <div className={`fixed top-0 inset-x-0 z-50 ${bg} text-white shadow-2xl border-b-2 border-white/20 threat-banner-slide ${evt.severity === "red" ? "threat-shake" : ""}`}>
      <div className="px-4 py-3 flex items-center gap-3">
        <AlertTriangle className="size-5 shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm uppercase tracking-wider">
            ⚠ THREAT DETECTED: {meta.label} from IP <span className="font-mono">{evt.ip_address ?? "unknown"}</span> at {time}
            {evt.simulated && <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-white/30">SIMULATED</span>}
          </div>
          {evt.payload && <div className="text-xs opacity-90 truncate font-mono mt-0.5">{evt.payload}</div>}
        </div>
        <Link to="/admin/soc" onClick={() => setEvt(null)}
          className="px-3 py-1.5 rounded bg-white/20 hover:bg-white/30 text-xs font-semibold whitespace-nowrap">
          View in SOC Feed
        </Link>
        <button onClick={() => setEvt(null)} className="p-1 hover:bg-white/20 rounded"><X className="size-4" /></button>
      </div>
    </div>
  );
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square"; o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.frequency.setValueAtTime(1200, ctx.currentTime + 0.08);
    o.stop(ctx.currentTime + 0.18);
    setTimeout(() => ctx.close(), 300);
  } catch {}
}
