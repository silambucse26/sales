import { createServerFn } from "@tanstack/react-start";

type DemoUser = {
  name: string;
  phone: string;
  password: string;
  role: "business_head" | "sales_head" | "sales_member";
};

const DEMOS: DemoUser[] = [
  { name: "Demo Business Head", phone: "9000000001", password: "sales@chimer2026", role: "business_head" },
  { name: "Demo Sales Head", phone: "9000000002", password: "demo1234", role: "sales_head" },
  { name: "Demo Sales Member", phone: "9000000003", password: "demo1234", role: "sales_member" },
  { name: "Sales Head", phone: "9790929442", password: "Saleshead@2026", role: "sales_head" },
];

function phoneToEmail(phone: string) {
  return `${phone.replace(/\D/g, "")}@chimertech.app`;
}

export const seedDemoUsers = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const results: Array<{ phone: string; password: string; role: string; status: string }> = [];

  for (const u of DEMOS) {
    const email = phoneToEmail(u.phone);
    let userId: string | null = null;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: u.password,
      email_confirm: true,
      user_metadata: { name: u.name, phone: u.phone },
    });
    if (createErr) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users.find((x) => x.email === email);
      userId = found?.id ?? null;
    } else {
      userId = created.user?.id ?? null;
    }
    if (!userId) {
      results.push({ phone: u.phone, password: u.password, role: u.role, status: "failed" });
      continue;
    }
    await supabaseAdmin.auth.admin.updateUserById(userId, { password: u.password });
    await supabaseAdmin.from("profiles").upsert({ id: userId, name: u.name, phone: u.phone });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: u.role });
    results.push({ phone: u.phone, password: u.password, role: u.role, status: "ready" });
  }

  return { users: results };
});
