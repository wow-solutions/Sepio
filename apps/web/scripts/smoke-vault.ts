// Vault smoke test: create → read → update → delete cycle.
// Verifies that public.vault_* RPCs work end-to-end and Zod types match.
// Run: bun --env-file=.env.local scripts/smoke-vault.ts

import { createSecret, readSecret, updateSecret, deleteSecret } from "../lib/vault";

// jsonb does not preserve key order — normalize before comparing.
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

function jsonEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

async function main() {
  console.log("=== Vault smoke test ===");

  // 1. CREATE
  const initial = { hello: "world", n: 42 };
  console.log("\n[1/4] createSecret with:", initial);
  const secretId = await createSecret(initial, `smoke-test-${Date.now()}`, "smoke test");
  console.log("→ id:", secretId);

  // 2. READ
  console.log("\n[2/4] readSecret(id)");
  const read1 = await readSecret(secretId);
  console.log("→", read1);
  if (!jsonEq(read1, initial)) {
    console.error("FAIL: read value does not match initial");
    process.exit(1);
  }

  // 3. UPDATE
  const updated = { hello: "world", n: 100, added: true };
  console.log("\n[3/4] updateSecret(id, updated)");
  await updateSecret(secretId, updated);
  const read2 = await readSecret(secretId);
  console.log("→", read2);
  if (!jsonEq(read2, updated)) {
    console.error("FAIL: read value after update does not match");
    process.exit(1);
  }

  // 4. DELETE
  console.log("\n[4/4] deleteSecret(id)");
  await deleteSecret(secretId);
  const read3 = await readSecret(secretId);
  console.log("→", read3);
  if (read3 !== null) {
    console.error("FAIL: secret still exists after delete");
    process.exit(1);
  }

  console.log("\n✓ ALL PASS");
}

main().catch((err) => {
  console.error("smoke test threw:", err);
  process.exit(1);
});
