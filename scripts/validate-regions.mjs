import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("../src/config/regions.json", import.meta.url), "utf8"));
const editions = cfg.groups.flatMap(group => group.items);
const ids = editions.map(entry => entry.code);
const byId = Object.fromEntries(editions.map(entry => [entry.code, entry]));

assert.equal(new Set(ids).size, ids.length, "Duplicate region edition codes");
for (const entry of editions) {
  assert.match(entry.code, /^[a-z]+(?:-[a-z]+)*$/, `Invalid URL edition: ${entry.code}`);
  assert.ok(entry.lang && entry.name, `Edition needs a display name and language: ${entry.code}`);
}
for (const [oldCode, newCode] of Object.entries(cfg.aliases)) {
  assert.ok(!byId[oldCode], `Legacy alias collides with a canonical edition: ${oldCode}`);
  assert.ok(byId[newCode], `Alias ${oldCode} points to an unknown edition ${newCode}`);
}
assert.equal(byId["sg-zh"].lang, "zh");
assert.equal(byId["sg-en"].lang, "en");
assert.equal(byId["ca-en"].lang, "en");
assert.equal(byId["ca-fr"].lang, "fr");
assert.equal(cfg.aliases["sg-cn"], "sg-zh");
console.log(`Region config OK: ${ids.length} regional editions, ${Object.keys(cfg.aliases).length} aliases.`);
