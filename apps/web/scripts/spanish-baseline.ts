// Spanish Pangram baseline: 10 HVAC topics → default Claude (no brand voice, no humanizer)
// → Pangram → distribution. Establishes where vanilla Claude Spanish sits on detection
// before any pipeline-specific work. Unblocks Stage 0 LinkedIn strategy.
//
// Run: bun --env-file=.env.local scripts/spanish-baseline.ts

import Anthropic from "@anthropic-ai/sdk";
import { checkText, deriveDetectionScore } from "../lib/pangram";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SYSTEM = "You are a helpful blog writer for general audiences in Panama. Write clear, informative articles in Spanish.";

const TOPICS: Array<{ slug: string; title: string; user: string }> = [
  {
    slug: "01-consumo-electrico",
    title: "¿Cuánto consume un aire acondicionado en Panamá?",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras sobre cuánto consume un aire acondicionado en Panamá. Incluye tipos de equipos, tarifas eléctricas, ejemplos de cálculo y consejos para reducir el consumo.",
  },
  {
    slug: "02-temperatura-optima",
    title: "Temperatura óptima del aire acondicionado en Panamá",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras sobre cuál es la temperatura óptima del aire acondicionado en Panamá. Discute el balance entre comodidad y consumo eléctrico, el efecto de la humedad y recomendaciones para dormitorios, salas y oficinas.",
  },
  {
    slug: "03-mantenimiento-tropical",
    title: "Mantenimiento de aire acondicionado en clima tropical",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras sobre el mantenimiento de aires acondicionados en clima tropical como el de Panamá. Cubre limpieza de filtros, desinfección del evaporador, revisión del refrigerante, mantenimiento del condensador exterior y periodicidad recomendada.",
  },
  {
    slug: "04-costo-instalacion",
    title: "Costo de instalación de aire acondicionado en Panamá",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras sobre cuánto cuesta instalar un aire acondicionado en Panamá. Incluye precios por capacidad del equipo, costos de mano de obra, materiales adicionales (tubería de cobre, drenaje, soportes), diferencias entre Ciudad de Panamá y provincias, y garantías.",
  },
  {
    slug: "05-inverter-vs-convencional",
    title: "Aire acondicionado inverter vs convencional",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras comparando aires acondicionados inverter y convencionales. Discute funcionamiento, consumo eléctrico, durabilidad, ruido, precio inicial y cuál conviene según el uso en Panamá.",
  },
  {
    slug: "06-limpieza-split",
    title: "Cómo limpiar un aire acondicionado split paso a paso",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras sobre cómo limpiar un aire acondicionado tipo split paso a paso. Incluye herramientas necesarias, limpieza de filtros, limpieza del evaporador, limpieza del condensador exterior, precauciones de seguridad y frecuencia recomendada.",
  },
  {
    slug: "07-no-enfria",
    title: "¿Por qué mi aire acondicionado no enfría?",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras sobre por qué un aire acondicionado puede dejar de enfriar correctamente. Cubre las causas más comunes (filtros sucios, falta de refrigerante, compresor, ventilador), cómo diagnosticarlas y cuándo llamar a un técnico.",
  },
  {
    slug: "08-apartamentos-pequenos",
    title: "Aire acondicionado para apartamentos pequeños",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras sobre cómo elegir un aire acondicionado para apartamentos pequeños en Panamá. Incluye cálculo de BTU según área, tipos recomendados (split, portátil, mini-split), consideraciones de instalación y consumo eléctrico.",
  },
  {
    slug: "09-cambio-filtros",
    title: "¿Cuándo cambiar el filtro del aire acondicionado?",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras sobre cuándo y cómo cambiar el filtro de un aire acondicionado. Incluye tipos de filtros, signos de que necesita cambio, frecuencia recomendada en clima tropical, impacto en consumo eléctrico y en la salud.",
  },
  {
    slug: "10-reducir-factura",
    title: "Cómo reducir la factura eléctrica del aire acondicionado",
    user: "Escribe un artículo de blog en español de aproximadamente 1000-1200 palabras sobre cómo reducir la factura eléctrica generada por el aire acondicionado. Cubre ajustes de temperatura, mantenimiento preventivo, mejoras en el aislamiento del hogar, uso de ventiladores complementarios y elección de equipos eficientes.",
  },
];

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4000;

const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = resolve(import.meta.dir, `../../../raw/experiments/spanish-baseline/${DATE}`);

async function runTopic(topic: typeof TOPICS[number]) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const client = new Anthropic({ apiKey });

  console.log(`\n=== ${topic.slug}: ${topic.title} ===`);

  const c0 = Date.now();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: "user", content: topic.user }],
  });
  const claudeMs = Date.now() - c0;

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error(`No text for ${topic.slug}`);

  const p0 = Date.now();
  const pangram = await checkText(text);
  const pangramMs = Date.now() - p0;

  const score = deriveDetectionScore(pangram);

  const artifact = {
    slug: topic.slug,
    title: topic.title,
    user_message: topic.user,
    system_prompt: SYSTEM,
    strategy: { name: "spanish-baseline-default-claude", model: MODEL, max_tokens: MAX_TOKENS },
    output: text,
    word_count: text.split(/\s+/).filter(Boolean).length,
    pangram: {
      prediction: pangram.prediction,
      prediction_short: pangram.prediction_short,
      fraction_human: pangram.fraction_human,
      fraction_ai: pangram.fraction_ai,
      fraction_ai_assisted: pangram.fraction_ai_assisted,
      num_human_segments: pangram.num_human_segments,
      num_ai_segments: pangram.num_ai_segments,
      num_ai_assisted_segments: pangram.num_ai_assisted_segments,
    },
    usage: {
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
    },
    timing: { claude_ms: claudeMs, pangram_ms: pangramMs },
  };

  writeFileSync(`${OUT_DIR}/${topic.slug}.json`, JSON.stringify(artifact, null, 2));

  console.log(
    `score: ${score}/100 | f_human: ${pangram.fraction_human.toFixed(3)} | ${pangram.prediction_short} | words: ${artifact.word_count} | out_tokens: ${resp.usage.output_tokens}`,
  );

  return { slug: topic.slug, title: topic.title, pangram, score, word_count: artifact.word_count };
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const results: Array<{ slug: string; title: string; pangram: Awaited<ReturnType<typeof checkText>>; score: number; word_count: number }> = [];
for (const topic of TOPICS) {
  try {
    results.push(await runTopic(topic));
  } catch (err) {
    console.error(`!!! ${topic.slug} FAILED: ${(err as Error).message}`);
  }
}

console.log("\n\n=== SUMMARY (Spanish baseline, default Claude, no brand voice) ===");
console.log("| #  | slug                          | score  | f_human | prediction       | words |");
console.log("|----|-------------------------------|--------|---------|------------------|-------|");
for (const r of results) {
  console.log(
    `| ${r.slug.padEnd(30)} | ${String(r.score).padStart(2)}/100 | ${r.pangram.fraction_human.toFixed(3)}   | ${r.pangram.prediction_short.padEnd(16)} | ${String(r.word_count).padStart(5)} |`,
  );
}

const scores = results.map((r) => r.score);
const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
const min = Math.min(...scores);
const max = Math.max(...scores);
const above50 = scores.filter((s) => s >= 50).length;
const above70 = scores.filter((s) => s >= 70).length;

console.log(`\nN=${results.length}/${TOPICS.length}`);
console.log(`avg score: ${avg.toFixed(1)}/100`);
console.log(`min/max:   ${min} .. ${max}`);
console.log(`>= 50:     ${above50}/${results.length} (${((above50 / results.length) * 100).toFixed(0)}%)`);
console.log(`>= 70:     ${above70}/${results.length} (${((above70 / results.length) * 100).toFixed(0)}%)`);

// Save aggregate summary
writeFileSync(
  `${OUT_DIR}/_summary.json`,
  JSON.stringify(
    {
      run_date: DATE,
      strategy: "default-claude-spanish-no-brand-voice",
      model: MODEL,
      n_attempted: TOPICS.length,
      n_completed: results.length,
      scores,
      avg,
      min,
      max,
      pct_above_50: above50 / results.length,
      pct_above_70: above70 / results.length,
      results: results.map((r) => ({
        slug: r.slug,
        title: r.title,
        score: r.score,
        fraction_human: r.pangram.fraction_human,
        prediction: r.pangram.prediction,
        word_count: r.word_count,
      })),
    },
    null,
    2,
  ),
);

console.log(`\nResults written to ${OUT_DIR}/`);
