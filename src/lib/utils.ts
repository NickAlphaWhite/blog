import { getCollection } from "astro:content";

// ── Region ↔ Language ──────────────────────────────────────────
export const regionMap: Record<string, string> = {
  cn: "zh", us: "en", jp: "ja", kr: "ko", tw: "zh-tw", hk: "zh-yue", mo: "zh-yue",
  uk: "en", fr: "fr", de: "de", es: "es", it: "it", pt: "pt", th: "th",
  ca: "en", "ca-fr": "fr", au: "en", nl: "nl", ru: "ru", br: "pt", mx: "es",
  in: "en", ae: "en", za: "en", pr: "es",
};

export const allRegions = Object.keys(regionMap);

// Deduplicated language codes
export const allLangs = [...new Set(Object.values(regionMap))];

// Language labels (for chooser pages)
export const langLabels: Record<string, string> = {
  zh: "简体中文", "zh-tw": "繁體中文", "zh-yue": "粵語",
  en: "English", ja: "日本語", ko: "한국어",
  fr: "Français", de: "Deutsch", es: "Español",
  it: "Italiano", pt: "Português", nl: "Nederlands",
  ru: "Русский", th: "ไทย",
};

/**
 * zh-yue / zh-tw should also match zh posts (fallback).
 * Returns a predicate so getCollection can filter correctly.
 */
export function langMatcher(langCode: string): (postLang: string) => boolean {
  return (l: string) => l === langCode;
}

// ── Categories ──────────────────────────────────────────────────
export async function getCatsConfig(): Promise<Record<string, any>> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "src/config/categories.json"), "utf-8"),
  );
}

export function catLabel(
  key: string,
  langCode: string,
  catsConfig: Record<string, any>,
): string {
  return catsConfig[key]?.label?.[langCode]
    || catsConfig[key]?.label?.zh
    || catsConfig[key]?.label?.en
    || key;
}

export function subLabel(
  catKey: string,
  subKey: string,
  langCode: string,
  catsConfig: Record<string, any>,
): string {
  const sc = catsConfig[catKey]?.subcategories?.[subKey];
  return typeof sc === "object" ? (sc[langCode] || sc.zh || sc.en || subKey) : (sc || subKey);
}

// ── Dropdown data builder ───────────────────────────────────────
export function buildDdObj(
  categories: string[],
  catsConfig: Record<string, any>,
  langCode: string,
  lang: string,
  byCategory: (cat: string) => any[],
) {
  return Object.fromEntries(
    categories.map((cat) => {
      const subs = catsConfig[cat]?.subcategories || {};
      return [
        cat,
        {
          label: catLabel(cat, langCode, catsConfig),
          all: `/${lang}/category/${cat}`,
          posts: byCategory(cat)
            .slice(0, 3)
            .map((p: any) => ({
              title: p.data.title,
              url: `/${lang}/${p.id.replace(/\.md$/, "")}`,
            })),
          subcategories: Object.entries(subs).map(([key, val]: [string, any]) => ({
            name: typeof val === "object" ? (val[langCode] || val.zh || val.en || key) : (val || key),
            url: `/${lang}/category/${cat}?sub=${key}`,
          })),
        },
      ];
    }),
  );
}

// ── Search data builder ─────────────────────────────────────────
export function buildSearchPosts(
  posts: any[],
  lang: string,
  catsConfig: Record<string, any>,
  langCode: string,
) {
  return posts.map((p) => ({
    title: p.data.title,
    excerpt: p.data.titleZh || p.body?.slice(0, 160) || "",
    category: catLabel(p.data.category, langCode, catsConfig),
    url: `/${lang}/${p.id.replace(/\.md$/, "")}`,
  }));
}
