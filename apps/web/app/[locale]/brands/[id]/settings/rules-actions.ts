"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_RULE_CAP, findRuleConflict } from "@/lib/brand-rules/rule-validation";

// Editorial Memory rule management (T7): toggle + delete. Inline edit is
// soft-deferred (design S2) — toggle/delete cover the demoed loop. All writes are
// RLS owner-scoped via brand_rules → brands.account_id.

export type RuleActionResult = { ok: true } | { ok: false; error: string };

export async function toggleBrandRule(
  ruleId: string,
  active: boolean,
): Promise<RuleActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: rule } = await supabase
    .from("brand_rules")
    .select("id, brand_id, rule_type, rule_text")
    .eq("id", ruleId)
    .maybeSingle();
  if (!rule) return { ok: false, error: "Rule not found" };

  // Re-activating re-enters the rule into the generation prompt, so re-check the
  // cap and the conflict it could reintroduce (same guards as apply).
  if (active) {
    const { data: others, error } = await supabase
      .from("brand_rules")
      .select("rule_type, rule_text, human_label")
      .eq("brand_id", rule.brand_id)
      .eq("active", true)
      .neq("id", ruleId);
    if (error) return { ok: false, error: error.message };
    const activeOthers = others ?? [];
    if (activeOthers.length >= ACTIVE_RULE_CAP) {
      return {
        ok: false,
        error: `You're at ${ACTIVE_RULE_CAP} active rules — deactivate one first`,
      };
    }
    const conflict = findRuleConflict(rule, activeOthers);
    if (conflict) {
      return {
        ok: false,
        error: `Conflicts with an active rule: "${conflict.human_label ?? conflict.rule_text}"`,
      };
    }
  }

  const { error: updErr } = await supabase
    .from("brand_rules")
    .update({ active })
    .eq("id", ruleId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/brands/${rule.brand_id}`);
  return { ok: true };
}

export async function deleteBrandRule(ruleId: string): Promise<RuleActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: rule } = await supabase
    .from("brand_rules")
    .select("id, brand_id")
    .eq("id", ruleId)
    .maybeSingle();
  if (!rule) return { ok: false, error: "Rule not found" };

  const { error } = await supabase.from("brand_rules").delete().eq("id", ruleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/brands/${rule.brand_id}`);
  return { ok: true };
}
