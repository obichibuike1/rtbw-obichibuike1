import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CITIES = ["New York","London","Tokyo","Paris","Sydney","Lagos","Dubai","Berlin","Singapore","Toronto"];

export const sendTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      recipientAccountNumber: z.string().trim().min(4).max(32),
      amount: z.number().positive().max(1_000_000),
      note: z.string().trim().max(200).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const location = CITIES[Math.floor(Math.random() * CITIES.length)];
    const { data: result, error } = await context.supabase.rpc("execute_transfer", {
      _recipient_account_number: data.recipientAccountNumber,
      _amount: data.amount,
      _note: data.note ?? null,
      _location: location,
    });
    if (error) throw new Error(error.message);
    return result as { out_tx: string; in_tx: string; status: "normal" | "flagged"; reason: string | null };
  });

export const tickSimulator = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("simulate_tick");
  if (error) throw new Error(error.message);
  return data;
});

export const seedDemo = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const users = [
    { email: "admin@demo.bank", password: "Admin123!", full_name: "Admin User", role: "admin" as const },
    { email: "alice@demo.bank", password: "Customer123!", full_name: "Alice Johnson", role: "customer" as const },
    { email: "bob@demo.bank", password: "Customer123!", full_name: "Bob Martinez", role: "customer" as const },
    { email: "carol@demo.bank", password: "Customer123!", full_name: "Carol Smith", role: "customer" as const },
    { email: "dave@demo.bank", password: "Customer123!", full_name: "Dave Wilson", role: "customer" as const },
    { email: "eve@demo.bank", password: "Customer123!", full_name: "Eve Thompson", role: "customer" as const },
  ];

  const created: { email: string; id: string; role: string }[] = [];

  for (const u of users) {
    // try fetch existing
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let existing = list?.users.find((x) => x.email === u.email);
    if (!existing) {
      const { data: cu, error: ce } = await supabaseAdmin.auth.admin.createUser({
        email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u.full_name },
      });
      if (ce) throw new Error(`createUser ${u.email}: ${ce.message}`);
      existing = cu.user!;
    }
    // role
    await supabaseAdmin.from("user_roles").upsert({ user_id: existing.id, role: u.role }, { onConflict: "user_id,role" });
    // profile
    await supabaseAdmin.from("profiles").upsert({ id: existing.id, full_name: u.full_name });

    if (u.role === "customer") {
      const { data: acc } = await supabaseAdmin.from("accounts").select("id").eq("customer_id", existing.id).maybeSingle();
      if (!acc) {
        const accountNumber = "ACC" + Math.floor(10000000 + Math.random() * 89999999).toString();
        await supabaseAdmin.from("accounts").insert({
          customer_id: existing.id,
          account_number: accountNumber,
          full_name: u.full_name,
          balance: 5000 + Math.floor(Math.random() * 5000),
          account_type: "checking",
        });
      }
    }
    created.push({ email: u.email, id: existing.id, role: u.role });
  }

  return { ok: true, users: created };
});

export const lookupRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ accountNumber: z.string().trim().min(4).max(32) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: acc, error } = await context.supabase
      .from("accounts")
      .select("account_number, full_name, account_type")
      .eq("account_number", data.accountNumber)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return acc;
  });
