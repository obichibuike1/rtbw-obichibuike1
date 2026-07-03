import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SettingsMap = Record<string, any>;

let cache: SettingsMap = {};
const listeners = new Set<(s: SettingsMap) => void>();
let subscribed = false;

async function loadAll() {
  const { data } = await supabase.from("system_settings").select("key,value");
  const next: SettingsMap = {};
  (data ?? []).forEach((r: any) => { next[r.key] = r.value; });
  cache = next;
  listeners.forEach((cb) => cb(cache));
}

function ensureSubscribed() {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  loadAll();
  supabase.channel("system-settings-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "system_settings" }, (payload) => {
      const row: any = payload.new ?? payload.old;
      if (!row) return;
      cache = { ...cache, [row.key]: (payload.new as any)?.value };
      listeners.forEach((cb) => cb(cache));
    }).subscribe();
}

export function useSystemSettings() {
  const [state, setState] = useState<SettingsMap>(cache);
  useEffect(() => {
    ensureSubscribed();
    setState(cache);
    const cb = (s: SettingsMap) => setState({ ...s });
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);
  return state;
}

export function isRuleOn(settings: SettingsMap, key: string, defaultOn = true) {
  const v = settings[key];
  if (v === undefined || v === null) return defaultOn;
  return v === true || v === "true";
}

export async function setSetting(key: string, value: any) {
  try {
    const { error } = await supabase.rpc("admin_set_setting", { _key: key, _value: value } as any);
    if (error) throw error;
    cache = { ...cache, [key]: value };
    listeners.forEach((cb) => cb(cache));
  } catch (e: any) {
    toast.error("Failed to save setting: " + (e.message ?? "unknown"));
  }
}
