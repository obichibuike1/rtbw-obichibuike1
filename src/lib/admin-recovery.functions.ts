import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

function keysMatch(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const resetAdminCredentials = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        recoveryKey: z.string().trim().min(1).max(512),
        newEmail: z.string().trim().email().max(255),
        newPassword: z.string().min(8).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_RECOVERY_KEY;
    if (!expected) {
      throw new Error(
        "Admin recovery is not configured. Set the ADMIN_RECOVERY_KEY secret.",
      );
    }
    if (!keysMatch(data.recoveryKey, expected)) {
      // Generic failure — do not leak any detail
      return { ok: false as const, reason: "invalid_key" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find an admin user to update. Prefer one that already has the admin role.
    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1);
    if (roleErr) throw new Error(roleErr.message);

    let adminUserId = roleRows?.[0]?.user_id ?? null;

    // If no admin exists yet, create one with the requested email.
    if (!adminUserId) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.newEmail,
        password: data.newPassword,
        email_confirm: true,
      });
      if (createErr) throw new Error(createErr.message);
      adminUserId = created.user!.id;
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: adminUserId, role: "admin" },
          { onConflict: "user_id,role" },
        );
    } else {
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
        adminUserId,
        { email: data.newEmail, password: data.newPassword, email_confirm: true },
      );
      if (updErr) throw new Error(updErr.message);
      // Ensure role is still assigned
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: adminUserId, role: "admin" },
          { onConflict: "user_id,role" },
        );
    }

    // Audit log
    await supabaseAdmin.from("security_events").insert({
      event_type: "admin_credentials_recovered",
      email: data.newEmail,
      user_id: adminUserId,
      details: { via: "recovery_key" },
    });

    return { ok: true as const };
  });
