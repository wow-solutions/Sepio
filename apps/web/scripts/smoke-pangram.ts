// Run the latest Claude smoke draft through Pangram.
// Cost: $0.0075 per check.

import { checkText, deriveDetectionScore } from "../lib/pangram";

const draft = `Panama's humidity doesn't forgive neglected AC units.

At 80%+ relative humidity for months on end, your system isn't just cooling air — it's working overtime to pull moisture out of it. That extra load accelerates wear on components that most people never think about until something fails on the hottest day of July.

Here's the one maintenance task that matters most in this climate: your condensate drain line.

In Panama's humidity, that line can clog with mold and algae in as little as 4-6 weeks. When it blocks, water backs up into the unit, damages the drain pan, and can trigger a shutdown — right when you need the system most. A simple flush with diluted bleach every month prevents 80% of the humidity-related failures we see during the rainy season.

Beyond that, here's what a solid pre-summer checklist looks like:

→ Clean or replace air filters every 3-4 weeks (not monthly like temperate climates)
→ Inspect evaporator coils for mold buildup
→ Check refrigerant levels — low refrigerant forces longer run cycles and kills compressors early
→ Verify drain pan isn't holding standing water

The goal is simple: you shouldn't have to think about your AC. A unit that gets proper attention twice a year in this climate can run reliably for a decade.

What's the most common issue you've seen with AC systems during Panama's rainy season?`;

const start = Date.now();
const result = await checkText(draft);
const ms = Date.now() - start;

console.log("---PANGRAM---");
console.log(`time:            ${ms}ms`);
console.log(`headline:        ${result.headline}`);
console.log(`prediction:      ${result.prediction_short}`);
console.log(`fraction_human:  ${result.fraction_human.toFixed(3)}`);
console.log(`fraction_ai:     ${result.fraction_ai.toFixed(3)}`);
console.log(`AI segments:     ${result.num_ai_segments}`);
console.log(`human segments:  ${result.num_human_segments}`);
console.log(`derived score:   ${deriveDetectionScore(result)}/100`);
