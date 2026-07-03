// Security Operations Center — client-side helpers, detection patterns, session identity.
import { supabase } from "@/integrations/supabase/client";

const IP_KEY = "pulsebank.session_ip";
const FP_KEY = "pulsebank.session_fp";

function randIp() {
  const r = () => Math.floor(Math.random() * 255) + 1;
  return `${r()}.${r()}.${r()}.${r()}`;
}

export function getSessionIp(): string {
  if (typeof window === "undefined") return "0.0.0.0";
  let ip = window.localStorage.getItem(IP_KEY);
  if (!ip) { ip = randIp(); window.localStorage.setItem(IP_KEY, ip); }
  return ip;
}

export function rotateSessionIp(): string {
  const ip = randIp();
  if (typeof window !== "undefined") window.localStorage.setItem(IP_KEY, ip);
  return ip;
}

export function getFingerprint(): string {
  if (typeof window === "undefined") return "server";
  let fp = window.sessionStorage.getItem(FP_KEY);
  if (!fp) {
    const s = `${navigator.userAgent}|${screen.width}x${screen.height}|${navigator.language}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    fp = "fp_" + Math.abs(h).toString(16);
    window.sessionStorage.setItem(FP_KEY, fp);
  }
  return fp;
}

// ---- Detection patterns ----
const XSS_PATTERNS = [
  /<script/i, /<\/script>/i, /javascript:/i, /onerror\s*=/i, /onload\s*=/i,
  /onclick\s*=/i, /onmouseover\s*=/i, /<img\s+src\s*=\s*x/i, /<iframe/i,
  /alert\s*\(/i, /document\.cookie/i, /window\.location/i, /eval\s*\(/i,
  /String\.fromCharCode/i,
];
const SQL_PATTERNS = [
  /'\s*or\s*'?\w*'?\s*=\s*'?\w*'?/i, /"\s*or\s*"/i, /\b1\s*=\s*1\b/i,
  /'\s*--/, /";\s*--/, /\bdrop\s+table\b/i, /\bdrop\s+database\b/i,
  /\bunion\s+(all\s+)?select\b/i, /\bselect\s+\*/i, /\binsert\s+into\b/i,
  /\bdelete\s+from\b/i, /\bupdate\s+\w+\s+set\b/i, /\bexec\s*\(/i,
  /\bexecute\s*\(/i, /xp_cmdshell/i, /\bor\s+1\s*=\s*1\b/i, /\band\s+1\s*=\s*1\b/i,
  /admin'--/i,
];
const URL_PATTERNS = [
  /https?:\/\//i, /www\./i, /bit\.ly/i, /tinyurl/i, /t\.co/i, /goo\.gl/i, /ow\.ly/i,
  /\.(com|net|org|xyz|ru|io|co|info)\b/i,
];

export function detectXss(v: string): { hit: boolean; match?: string } {
  for (const p of XSS_PATTERNS) { const m = v.match(p); if (m) return { hit: true, match: m[0] }; }
  return { hit: false };
}
export function detectSql(v: string): { hit: boolean; match?: string } {
  for (const p of SQL_PATTERNS) { const m = v.match(p); if (m) return { hit: true, match: m[0] }; }
  return { hit: false };
}
export function detectPhishing(v: string): { hit: boolean; match?: string } {
  for (const p of URL_PATTERNS) { const m = v.match(p); if (m) return { hit: true, match: m[0] }; }
  return { hit: false };
}
export function stripUrls(v: string): string {
  let out = v;
  for (const p of URL_PATTERNS) out = out.replace(new RegExp(p.source, "gi"), "");
  return out.trim();
}

// ---- SOC event logger ----
export type Severity = "red" | "orange" | "yellow" | "blue";

export async function logSocEvent(input: {
  threat_type: string;
  severity: Severity;
  field?: string;
  payload?: string;
  target_email?: string;
  simulated?: boolean;
  details?: Record<string, any>;
}) {
  try {
    await supabase.rpc("log_soc_event", {
      _threat_type: input.threat_type,
      _severity: input.severity,
      _ip_address: getSessionIp(),
      _user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      _fingerprint: getFingerprint(),
      _target_email: input.target_email ?? null,
      _field: input.field ?? null,
      _payload: (input.payload ?? "").slice(0, 500),
      _simulated: input.simulated ?? false,
      _details: input.details ?? {},
    } as any);
  } catch (e) {
    // silent — never break user flow on log failure
    console.warn("SOC log failed", e);
  }
}

export const THREAT_META: Record<string, { label: string; severity: Severity }> = {
  xss: { label: "XSS Injection", severity: "red" },
  sql_injection: { label: "SQL Injection", severity: "red" },
  session_hijack: { label: "Session Hijack", severity: "red" },
  csrf: { label: "CSRF Attempt", severity: "red" },
  brute_force: { label: "Brute Force", severity: "orange" },
  credential_stuffing: { label: "Credential Stuffing", severity: "orange" },
  enumeration: { label: "Account Enumeration", severity: "orange" },
  phishing: { label: "Phishing URL", severity: "yellow" },
  duplicate_attack: { label: "Duplicate Transfer Attack", severity: "yellow" },
  duplicate_transfer: { label: "Duplicate Transfer", severity: "yellow" },
  dormant: { label: "Dormant Account", severity: "blue" },
  night_activity: { label: "Night Activity", severity: "blue" },
  micro_transaction: { label: "Micro Transaction", severity: "blue" },
};

export const SEVERITY_STYLE: Record<Severity, { badge: string; row: string; dot: string; label: string }> = {
  red:    { badge: "bg-red-600 text-white border-red-500",       row: "border-l-4 border-l-red-500",    dot: "bg-red-500", label: "RED" },
  orange: { badge: "bg-orange-500 text-white border-orange-400", row: "border-l-4 border-l-orange-500", dot: "bg-orange-500", label: "ORANGE" },
  yellow: { badge: "bg-yellow-500 text-black border-yellow-400", row: "border-l-4 border-l-yellow-500", dot: "bg-yellow-500", label: "YELLOW" },
  blue:   { badge: "bg-blue-600 text-white border-blue-400",     row: "border-l-4 border-l-blue-500",   dot: "bg-blue-500", label: "BLUE" },
};
