// Build Cloudflare Pages 301 rules for pre-migration and previously used URLs.
// The old Markdown filename remains an internal, stable identifier (also used by Waline).
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { localizedSlug } from "../src/lib/permalinks.mjs";

const root = join(process.cwd(), "src", "content", "posts");
const lines = [];
const seen = new Set();
for (const region of readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory())) {
  for (const name of readdirSync(join(root, region.name)).filter(x => x.endsWith(".md"))) {
    const raw = readFileSync(join(root, region.name, name), "utf8");
    const front = raw.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] || "";
    const field = key => {
      const found = front.match(new RegExp("^" + key + ":\\s*(.*)$", "m"))?.[1]?.trim() || "";
      if (found.startsWith('"')) { try { return JSON.parse(found); } catch { return found.slice(1, -1); } }
      return found.replace(/^'|'$/g, "");
    };
    const canonical = localizedSlug(field("urlSlug") || field("title") || name.replace(/\.md$/, ""));
    const oldFilename = name.replace(/\.md$/, "");
    const aliases = [];
    try {
      const text = field("urlAliases");
      const value = text ? JSON.parse(text) : [];
      if (Array.isArray(value)) aliases.push(...value);
    } catch {}
    for (const previous of [oldFilename, ...aliases]) {
      const legacy = localizedSlug(previous);
      // The filename can include date and punctuation, so preserve its exact route.
      const old = previous === oldFilename ? oldFilename : legacy;
      if (old === canonical) continue;
      const source = "/" + region.name + "/" + encodeURIComponent(old) + "/";
      const target = "/" + region.name + "/" + encodeURIComponent(canonical) + "/";
      if (seen.has(source)) continue;
      seen.add(source);
      lines.push(source + " " + target + " 301");
      lines.push(source.slice(0, -1) + " " + target + " 301");
    }
  }
}
if (!existsSync("dist")) throw new Error("Astro build must complete before redirects generation");
writeFileSync(join("dist", "_redirects"), lines.join("\n") + "\n", "utf8");
console.log("Cloudflare legacy article redirects:", seen.size);
