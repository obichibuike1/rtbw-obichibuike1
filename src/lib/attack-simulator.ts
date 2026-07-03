// Fires fake attack events into the SOC feed for the live demo.
import { logSocEvent } from "@/lib/soc";

function randIp() {
  const r = () => Math.floor(Math.random() * 255) + 1;
  return `${r()}.${r()}.${r()}.${r()}`;
}

const XSS_PAYLOADS = [
  `<script>alert('pwn')</script>`,
  `<img src=x onerror="alert(1)">`,
  `javascript:document.cookie`,
  `<iframe src="http://evil.example"></iframe>`,
];
const SQL_PAYLOADS = [
  `' OR 1=1--`, `admin'--`, `"; DROP TABLE users;--`,
  `1 UNION SELECT * FROM accounts`, `' OR 'x'='x`,
];
const URLS = [
  `Please pay via http://bit.ly/free-money`,
  `Verify account at www.pulse-bank-secure.xyz`,
  `Confirm here https://tinyurl.com/gift`,
];

async function fake(input: Parameters<typeof logSocEvent>[0]) {
  await logSocEvent({ ...input, simulated: true });
}

export async function simXss() {
  const p = XSS_PAYLOADS[Math.floor(Math.random() * XSS_PAYLOADS.length)];
  await fake({ threat_type: "xss", severity: "red", field: "narration", payload: p, details: { ip_override: randIp() } });
}
export async function simSql() {
  const p = SQL_PAYLOADS[Math.floor(Math.random() * SQL_PAYLOADS.length)];
  await fake({ threat_type: "sql_injection", severity: "red", field: "login.email", payload: p });
}
export async function simBrute() {
  const ip = randIp();
  for (let i = 0; i < 6; i++) {
    await fake({ threat_type: "brute_force", severity: "orange", field: "login", payload: `attempt #${i+1}`, details: { ip, attempts: i+1 } });
    await new Promise((r) => setTimeout(r, 200));
  }
}
export async function simHijack() {
  await fake({
    threat_type: "session_hijack", severity: "red", field: "session",
    payload: `Session moved: 192.168.1.4 → ${randIp()} · fingerprint changed`,
    details: { reason: "IP + fingerprint mismatch mid-session" },
  });
}
export async function simEnum() {
  for (let i = 0; i < 5; i++) {
    await fake({ threat_type: "enumeration", severity: "orange", field: "send.recipient",
      payload: `Failed lookup: ACC${Math.floor(10000000 + Math.random() * 89999999)}`, details: { attempt: i+1 } });
    await new Promise((r) => setTimeout(r, 250));
  }
}
export async function simPhishing() {
  const p = URLS[Math.floor(Math.random() * URLS.length)];
  await fake({ threat_type: "phishing", severity: "yellow", field: "narration", payload: p });
}
export async function simCsrf() {
  await fake({ threat_type: "csrf", severity: "red", field: "transfer",
    payload: `Origin: https://evil-attacker.xyz — expected same-origin`,
    details: { external_origin: "https://evil-attacker.xyz" } });
}

export const ALL_SIMS: Array<[string, () => Promise<void>]> = [
  ["sim.xss", simXss],
  ["sim.sql", simSql],
  ["sim.brute", simBrute],
  ["sim.hijack", simHijack],
  ["sim.enum", simEnum],
  ["sim.phishing", simPhishing],
  ["sim.csrf", simCsrf],
];
