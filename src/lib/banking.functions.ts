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
      confirmDuplicate: z.boolean().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const location = CITIES[Math.floor(Math.random() * CITIES.length)];
    const { data: result, error } = await (context.supabase.rpc as any)("execute_transfer", {
      _recipient_account_number: data.recipientAccountNumber,
      _amount: data.amount,
      _note: data.note ?? null,
      _location: location,
      _confirm_duplicate: data.confirmDuplicate ?? false,
    });
    if (error) {
      // surface duplicate detection specially so client can show its modal
      if (error.message?.includes("DUPLICATE_DETECTED")) {
        const m = error.message.match(/DUPLICATE_DETECTED:(\d+)/);
        const err: any = new Error("DUPLICATE_DETECTED");
        err.code = "DUPLICATE_DETECTED";
        err.secondsAgo = m ? Number(m[1]) : 0;
        throw err;
      }
      throw new Error(error.message);
    }
    return result as { out_tx: string; in_tx: string; status: "normal" | "flagged"; reason: string | null; duplicate_confirmed?: boolean };
  });

export const checkDuplicateTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    recipientAccountNumber: z.string().trim().min(4).max(32),
    amount: z.number().positive(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (context.supabase.rpc as any)("check_duplicate_transfer", {
      _recipient_account_number: data.recipientAccountNumber,
      _amount: data.amount,
    });
    if (error) throw new Error(error.message);
    return r as { found: boolean; seconds_ago?: number; recipient_name?: string; recipient_account?: string; amount?: number };
  });

export const logDuplicateAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    recipientAccountNumber: z.string().trim().min(4).max(32),
    amount: z.number().positive(),
    resolution: z.enum(["confirmed", "cancelled"]),
    secondsAgo: z.number().int().nonnegative(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as any)("log_duplicate_attempt", {
      _recipient_account_number: data.recipientAccountNumber,
      _amount: data.amount,
      _resolution: data.resolution,
      _seconds_ago: data.secondsAgo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Security question ----

export const getMySecurityQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase.rpc as any)("get_my_security_question");
    if (error) throw new Error(error.message);
    return { question: (data as string | null) ?? null };
  });

export const setSecurityQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    question: z.string().trim().min(3).max(200),
    answer: z.string().trim().min(1).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as any)("set_security_question", {
      _question: data.question,
      _answer: data.answer,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifySecurityAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    answer: z.string().trim().min(1).max(200),
    amount: z.number().nonnegative(),
    balance: z.number().nonnegative(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (context.supabase.rpc as any)("verify_security_answer", {
      _answer: data.answer,
      _amount: data.amount,
      _balance: data.balance,
    });
    if (error) throw new Error(error.message);
    return r as { ok: boolean; locked?: boolean; until?: string; attempts?: number; remaining?: number };
  });

export const logSecurityChallengeTriggered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    amount: z.number().nonnegative(),
    balance: z.number().nonnegative(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as any)("log_security_challenge_triggered", {
      _amount: data.amount,
      _balance: data.balance,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Password reset logging (server-side, uses admin client) ----

export const logPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.rpc as any)("log_password_reset", { _email: data.email });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const tickSimulator = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.rpc as any)("simulate_tick");
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

  for (const u of users) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let existing = list?.users.find((x) => x.email === u.email);
    if (!existing) {
      const { data: cu, error: ce } = await supabaseAdmin.auth.admin.createUser({
        email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u.full_name },
      });
      if (ce) throw new Error(`createUser ${u.email}: ${ce.message}`);
      existing = cu.user!;
    }
    await supabaseAdmin.from("user_roles").upsert({ user_id: existing.id, role: u.role }, { onConflict: "user_id,role" });
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
  }

  // Do NOT return the user list — keeps demo emails out of the client/network response.
  return { ok: true };
});

export const lookupRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ accountNumber: z.string().trim().min(4).max(32) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase.rpc as any)("lookup_recipient", {
      _account_number: data.accountNumber,
    });
    if (error) throw new Error(error.message);
    const acc = Array.isArray(rows) ? rows[0] ?? null : rows;
    return acc as { account_number: string; full_name: string; account_type: string } | null;
  });

// ---- Security: login lockout ----

export const checkLoginLock = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await (supabaseAdmin.rpc as any)("check_login_lock", { _email: data.email });
    if (error) throw new Error(error.message);
    return r as { locked: boolean; until?: string };
  });

export const registerFailedLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await (supabaseAdmin.rpc as any)("register_failed_login", { _email: data.email });
    if (error) throw new Error(error.message);
    return r as { attempts: number; locked: boolean; until?: string };
  });

export const registerSuccessfulLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase.rpc as any)("register_successful_login");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Security: PIN lockout ----

export const verifyTransferPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pin: z.string().trim().min(4).max(12) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (context.supabase.rpc as any)("verify_transfer_pin", { _pin: data.pin });
    if (error) throw new Error(error.message);
    return r as { ok: boolean; locked?: boolean; until?: string; attempts?: number; remaining?: number };
  });

export const changeTransferPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    oldPin: z.string().trim().min(4).max(12),
    newPin: z.string().trim().min(4).max(12).regex(/^\d+$/, "PIN must be digits only"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (context.supabase.rpc as any)("change_transfer_pin", {
      _old_pin: data.oldPin,
      _new_pin: data.newPin,
    });
    if (error) throw new Error(error.message);
    return r as { ok: boolean; locked?: boolean; until?: string; reason?: string };
  });

// ---- Security: 90% cap rejection log ----

export const logCapRejection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      attemptedAmount: z.number().nonnegative(),
      balance: z.number().nonnegative(),
      cap: z.number().nonnegative(),
      recipient: z.string().trim().max(64).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as any)("log_cap_rejection", {
      _attempted_amount: data.attemptedAmount,
      _balance: data.balance,
      _cap: data.cap,
      _recipient: data.recipient ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
