import express from "express";
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync, utimesSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { exec } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Configuration ──────────────────────────────────────────────
const PORT = process.env.PORT || 3456;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(32).toString("hex");
const SITE_URL = process.env.SITE_URL || "https://blog.nickalphawhite.top";
const COOKIE_NAME = "admin_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Simple cookie parser ───────────────────────────────────────
function parseCookies(header) {
  const map = {};
  if (!header) return map;
  header.split(";").forEach(c => {
    const idx = c.indexOf("=");
    if (idx > 0) map[c.slice(0, idx).trim()] = c.slice(idx + 1);
  });
  return map;
}

// ── Rate limiter (in-memory) ───────────────────────────────────
const rateMap = new Map(); // ip → { count, reset }
const RATE_WINDOW = 60_000;   // 1 minute
const RATE_MAX = 120;         // max requests per window
const RATE_LOGIN_MAX = 10;    // max login attempts per window

function rateLimit(max = RATE_MAX) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let entry = rateMap.get(ip);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + RATE_WINDOW };
      rateMap.set(ip, entry);
    }
    entry.count++;
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - entry.count));
    if (entry.count > max) {
      return res.status(429).json({ error: "Too many requests — slow down" });
    }
    next();
  };
}

// Clean stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) { if (now > v.reset) rateMap.delete(k); }
}, 300_000).unref();

// ── Auth middleware ────────────────────────────────────────────
function sessionAuth(req, res, next) {
  // Accept cookie (set by login) or Authorization header
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[COOKIE_NAME];
  const headerToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const token = cookieToken || headerToken;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Shell escape helper ─────────────────────────────────────────
function shellEscape(str) {
  // Wrap in single quotes; escape any embedded single quotes: ' → '\''
  return `'${String(str).replace(/'/g, "'\\''")}'`;
}

// ── Git helpers ────────────────────────────────────────────────
function runGit(cmd, cwd = __dirname) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[git] ${cmd} → ${stderr || err.message}`);
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// ── Dev mode: skip git push when GIT_PUSH_ENABLED !== "true"
const GIT_PUSH = (process.env.GIT_PUSH_ENABLED || "true") === "true";

// Touch a file to trigger Astro dev server reload
function touchAstroConfig() {
  try {
    const p = join(__dirname, "astro.config.mjs");
    const now = new Date();
    utimesSync(p, now, now);
  } catch (_) {}
}

async function gitPush(commitMsg) {
  if (!GIT_PUSH) {
    console.log(`[git] skipped (dev mode): ${commitMsg}`);
    return;
  }
  console.log(`[git] pushing: ${commitMsg}`);
  await runGit("git add -A");
  await runGit(`git commit -m ${shellEscape(commitMsg)} --allow-empty`);
  await runGit("git push origin main");
  console.log("[git] push complete");
}

// Fire-and-forget — doesn't block the HTTP response
function gitPushAsync(commitMsg) {
  gitPush(commitMsg).catch(e => console.error("[git] push error:", e.message));
}

// ── Login page (inline) ────────────────────────────────────────
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Login — NickAlphaWhite</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f2f2f4;color:#1d1d1f;-webkit-font-smoothing:antialiased}
@media(prefers-color-scheme:dark){body{background:#0a0a0c;color:#f5f5f7}}
.card{background:#fff;border-radius:20px;padding:48px 40px;width:100%;max-width:400px;box-shadow:0 1px 3px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.08);text-align:center}
@media(prefers-color-scheme:dark){.card{background:#1c1c1e;box-shadow:0 1px 3px rgba(0,0,0,.2),0 8px 24px rgba(0,0,0,.3)}}
h1{font-size:1.4rem;font-weight:700;margin-bottom:6px;letter-spacing:-0.02em}
p.sub{font-size:.85rem;color:#8e8e93;margin-bottom:28px}
input{width:100%;padding:12px 16px;border:1px solid rgba(0,0,0,.08);border-radius:12px;font-size:.95rem;font-family:inherit;outline:none;text-align:center;background:#f2f2f4;transition:border-color .2s}
@media(prefers-color-scheme:dark){input{background:#2c2c2e;border-color:rgba(255,255,255,.1);color:#f5f5f7}}
input:focus{border-color:#1d1d1f}
@media(prefers-color-scheme:dark){input:focus{border-color:#f5f5f7}}
button{margin-top:16px;width:100%;padding:12px;background:#1d1d1f;color:#fff;border:none;border-radius:12px;font-size:.95rem;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .2s}
@media(prefers-color-scheme:dark){button{background:#f5f5f7;color:#1d1d1f}}
button:hover{opacity:.85}
.err{color:#e74c3c;font-size:.8rem;margin-top:10px;display:none}
.err.show{display:block}
.links{margin-top:20px;font-size:.8rem}
.links a{color:#6e6e73;text-decoration:none}
.links a:hover{color:#1d1d1f}
</style>
</head>
<body>
<div class="card">
<h1>NickAlphaWhite</h1>
<p class="sub">Admin Panel</p>
<form method="post" action="/login" id="loginForm">
<input type="password" name="token" id="tokenInput" placeholder="Enter admin token" autocomplete="off" autofocus>
<button type="submit">Sign In</button>
<p class="err" id="errMsg">Invalid token</p>
</form>
<div class="links"><a href="${SITE_URL}">← Back to site</a></div>
</div>
<script>
(function(){
var p=new URLSearchParams(window.location.search);
if(p.get("e")==="1")document.getElementById("errMsg").classList.add("show");
})();
</script>
</body>
</html>`;

// ── Routes ─────────────────────────────────────────────────────
app.use(express.static(join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global rate limit
app.use("/api", rateLimit(RATE_MAX));

// Login page
app.get("/login", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.send(LOGIN_HTML);
});

// Login handler
app.post("/login", rateLimit(RATE_LOGIN_MAX), (req, res) => {
  const token = (req.body.token || "").trim();
  if (token === ADMIN_TOKEN.trim()) {
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${ADMIN_TOKEN}; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Path=/`
    );
    return res.redirect("/");
  }
  res.redirect("/login?e=1");
});

// Logout
app.get("/logout", (req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=x; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`);
  res.redirect("/login");
});

// Admin region chooser — mirrors the main site's choose-country-region
// Groups & items match src/pages/choose-country-region.astro exactly
function codeToFlag(code) {
  var c = code === "uk" ? "gb" : code.split("-")[0];
  return "https://flagcdn.com/w80/" + c + ".png";
}
const CHOOSE_REGION_GROUPS = [
  {
    label: "The United States, Canada, and Puerto Rico",
    items: [
      { code: "us", name: "United States", lang: "en" },
      { code: "ca", name: "Canada (English)", lang: "en" },
      { code: "ca-fr", name: "Canada (Français)", lang: "fr" },
      { code: "pr", name: "Puerto Rico", lang: "es" },
    ],
  },
  {
    label: "Asia Pacific",
    items: [
      { code: "cn", name: "中国大陆", lang: "zh" },
      { code: "hk", name: "香港", lang: "zh-yue" },
      { code: "mo", name: "澳門", lang: "zh-yue" },
      { code: "tw", name: "台灣", lang: "zh-tw" },
      { code: "jp", name: "日本", lang: "ja" },
      { code: "kr", name: "대한민국", lang: "ko" },
      { code: "th", name: "ประเทศไทย", lang: "th" },
      { code: "au", name: "Australia", lang: "en" },
    ],
  },
  {
    label: "Europe",
    items: [
      { code: "uk", name: "United Kingdom", lang: "en" },
      { code: "fr", name: "France", lang: "fr" },
      { code: "de", name: "Deutschland", lang: "de" },
      { code: "es", name: "España", lang: "es" },
      { code: "it", name: "Italia", lang: "it" },
      { code: "pt", name: "Portugal", lang: "pt" },
      { code: "nl", name: "Nederland", lang: "nl" },
      { code: "ru", name: "Россия", lang: "ru" },
    ],
  },
  {
    label: "Latin America and the Caribbean",
    items: [
      { code: "br", name: "Brasil", lang: "pt" },
      { code: "mx", name: "México", lang: "es" },
    ],
  },
  {
    label: "Africa, Middle East, and India",
    items: [
      { code: "in", name: "India", lang: "en" },
      { code: "ae", name: "الإمارات العربية المتحدة", lang: "en" },
      { code: "za", name: "South Africa", lang: "en" },
    ],
  },
];

function buildChooseRegionHtml(siteUrl) {
  const itemsHtml = CHOOSE_REGION_GROUPS.map(g => `
    <div class="choose-group">
      <p class="choose-group-label">${g.label}</p>
      <div class="choose-grid">
        ${g.items.map(r => `
          <a href="/${r.code}" class="choose-item"
             onclick="event.preventDefault();localStorage.setItem('admin-region','${r.code}');location.href=this.href">
            <img class="choose-flag" src="${codeToFlag(r.code)}" alt="${r.code}" width="30" height="20" />
            <span class="choose-name">${r.name}</span>
          </a>
        `).join("")}
      </div>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Choose your country or region — Admin</title>
<style>
:root,[data-theme="light"]{--bg:#f2f2f4;--card:#fff;--bg3:#e8e8ed;--hairline:rgba(0,0,0,0.06);--txt:#1d1d1f;--txt2:#6e6e73;--txt3:#aeaeb2;--font:-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC",sans-serif}
[data-theme="dark"]{--bg:#0a0a0c;--card:#1c1c1e;--bg3:#2c2c2e;--hairline:rgba(255,255,255,0.1);--txt:#f5f5f7;--txt2:#a1a1a6;--txt3:#8e8e93}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);line-height:1.6;color:var(--txt);background:var(--bg);-webkit-font-smoothing:antialiased}
.choose-wrap{max-width:960px;margin:0 auto;padding:64px 32px}
.choose-title{font-size:2.5rem;font-weight:700;letter-spacing:-0.04em;margin-bottom:8px}
.choose-sub{font-size:1.05rem;color:var(--txt2);margin-bottom:48px}
.choose-group{margin-bottom:36px}
.choose-group-label{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--txt3);margin-bottom:8px;padding-left:18px}
.choose-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:2px}
.choose-item{display:flex;align-items:center;gap:14px;padding:12px 18px;border-radius:12px;color:var(--txt);text-decoration:none;font-size:1rem;transition:background 0.15s;white-space:nowrap}
.choose-item:hover{background:var(--bg3)}
.choose-flag{width:32px;height:auto;flex-shrink:0;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
.choose-name{font-weight:500}
.choose-back{display:inline-flex;align-items:center;gap:6px;color:var(--txt2);text-decoration:none;font-size:0.9rem;margin-bottom:32px;transition:color 0.2s}
.choose-back:hover{color:var(--txt)}
@media(max-width:768px){.choose-wrap{padding:48px 20px}.choose-title{font-size:1.8rem}}
</style>
</head>
<body>
<div class="choose-wrap">
  <a href="javascript:history.back()" class="choose-back">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    Back
  </a>
  <h1 class="choose-title">Choose your country or region</h1>
  <p class="choose-sub">Selecting a region changes the admin content and language.</p>
  ${itemsHtml}
</div>
</body>
</html>`;
}

app.get("/choose-country-region", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.send(buildChooseRegionHtml(SITE_URL));
});

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

// Lock screen auth check (for admin.html client-side lock)
app.post("/api/auth-check", (req, res) => {
  const token = (req.body.token || "").trim();
  if (token === ADMIN_TOKEN.trim()) {
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: "Invalid token" });
});

// Admin page (protected) — region-based routing
// / → redirect to /cn, /:region → serve admin for that region
app.get("/", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME] !== ADMIN_TOKEN) return res.redirect("/login");
  res.redirect("/cn");
});

app.get("/:region", (req, res, next) => {
  const { region } = req.params;
  if (!ALL_REGIONS.includes(region)) return next();
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME] !== ADMIN_TOKEN) return res.redirect("/login");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(join(__dirname, "admin.html"));
});

// API: Get single post content
app.get("/api/posts/:file", sessionAuth, (req, res) => {
  try {
    const postsDir = join(__dirname, "src", "content", "posts");
    const filePath = join(postsDir, req.params.file);
    if (!existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    const raw = readFileSync(filePath, "utf-8");
    res.json({ file: req.params.file, content: raw });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Update post
app.put("/api/posts/:file", sessionAuth, (req, res) => {
  try {
    const postsDir = join(__dirname, "src", "content", "posts");
    const filePath = join(postsDir, req.params.file);
    if (!existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    const { title, subtitle, date, category, subcategory, lang, group, image, content, featured, tags, slug: customSlug } = req.body;
    const tagList = (tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const frontmatter = [
      "---",
      `title: "${title}"`,
      subtitle ? `subtitle: "${subtitle}"` : null,
      `date: ${date || new Date().toISOString().split("T")[0]}`,
      image ? `image: "${image}"` : null,
      `category: "${category}"`,
      lang ? `lang: "${lang}"` : null,
      group ? `group: "${group}"` : null,
      subcategory ? `subcategory: "${subcategory}"` : null,
      tagList.length ? `tags: [${tagList.map(t => `"${t}"`).join(", ")}]` : "tags: []",
      `featured: ${featured ? "true" : "false"}`,
      "---",
      "",
      content || "",
    ].filter(Boolean).join("\n");

    // If slug changed, rename the file
    if (customSlug) {
      const newBase = customSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
      const newSlug = (date || new Date().toISOString().split("T")[0]) + "-" + newBase + (lang && lang !== "zh" ? "." + lang : "");
      const newPath = join(postsDir, `${newSlug}.md`);
      if (newPath !== filePath) {
        if (existsSync(filePath)) unlinkSync(filePath);
        writeFileSync(newPath, frontmatter, "utf-8");
        touchAstroConfig();
        gitPushAsync(`Update post (renamed): ${req.params.file} → ${newSlug}`);
        return res.json({ ok: true, renamed: true, file: `${newSlug}.md` });
      }
    }

    writeFileSync(filePath, frontmatter, "utf-8");
    touchAstroConfig();
    gitPushAsync(`Update post: ${req.params.file}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Upload image to local public/images
import multer from "multer";
const uploadDir = join(__dirname, "public", "images");
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
const ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"];

// Magic byte signatures for image formats
const MAGIC_SIGS = {
  png:  [0x89, 0x50, 0x4E, 0x47],
  jpg:  [0xFF, 0xD8, 0xFF],
  jpeg: [0xFF, 0xD8, 0xFF],
  gif:  [0x47, 0x49, 0x46, 0x38],
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF
  avif: null, // AVIF starts with ftypavif at offset 4 — check in stream
};
const MAX_MAGIC_LEN = 12;

function validateImageMagic(buffer, ext) {
  if (ext === "svg") {
    // SVG is XML/text — validate it starts with <svg or <?xml
    const head = buffer.toString("utf-8", 0, 256).trimStart();
    return head.startsWith("<svg") || head.startsWith("<?xml");
  }
  if (ext === "avif") {
    // AVIF: check for ftypavif at offset 4
    const ftyp = buffer.toString("utf-8", 4, 12);
    return ftyp === "ftypavif" || ftyp === "ftypavis";
  }
  const sig = MAGIC_SIGS[ext];
  if (!sig) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buffer[i] !== sig[i]) return false;
  }
  return true;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = (file.originalname || "").split(".").pop().toLowerCase();
      if (!ext || !ALLOWED_EXTS.includes(ext)) {
        return cb(new Error("Invalid file type — allowed: " + ALLOWED_EXTS.join(", ")));
      }
      cb(null, crypto.randomBytes(8).toString("hex") + "." + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname || "").split(".").pop().toLowerCase();
    if (!ext || !ALLOWED_EXTS.includes(ext)) {
      return cb(new Error("Invalid file type — allowed: " + ALLOWED_EXTS.join(", ")));
    }
    cb(null, true);
  }
});

// Upload route with magic byte validation after write
app.post("/api/upload", sessionAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  // Validate magic bytes on the written file
  const filePath = join(uploadDir, req.file.filename);
  const ext = (req.file.originalname || "").split(".").pop().toLowerCase();
  try {
    const buf = readFileSync(filePath);
    if (!validateImageMagic(buf.slice(0, MAX_MAGIC_LEN), ext)) {
      unlinkSync(filePath);
      return res.status(400).json({ error: `File content does not match .${ext} signature` });
    }
  } catch (e) {
    try { unlinkSync(filePath); } catch (_) {}
    return res.status(500).json({ error: e.message });
  }
  gitPushAsync(`Upload image: ${req.file.filename}`);
  res.json({ url: "/images/" + req.file.filename });
});

// API: Publish post
app.post("/api/publish", sessionAuth, (req, res) => {
  try {
    const { title, subtitle, date, category, subcategory, lang, group, image, content, featured, tags, slug: customSlug } = req.body;
    if (!title || !category) {
      return res.status(400).json({ error: "Title and category are required" });
    }

    const base = customSlug || (group || title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
    const slug = date + "-" + base + (lang && lang !== "zh" ? "." + lang : "");
    const tagList = (tags || "").split(",").map(t => t.trim()).filter(Boolean);

    const frontmatter = [
      "---",
      `title: "${title}"`,
      subtitle ? `subtitle: "${subtitle}"` : null,
      `date: ${date || new Date().toISOString().split("T")[0]}`,
      image ? `image: "${image}"` : null,
      `category: "${category}"`,
      lang ? `lang: "${lang}"` : null,
      group ? `group: "${group}"` : null,
      subcategory ? `subcategory: "${subcategory}"` : null,
      tagList.length ? `tags: [${tagList.map(t => `"${t}"`).join(", ")}]` : "tags: []",
      `featured: ${featured ? "true" : "false"}`,
      "---",
      "",
      content || "",
    ].filter(Boolean).join("\n");

    const postsDir = join(__dirname, "src", "content", "posts");
    if (!existsSync(postsDir)) mkdirSync(postsDir, { recursive: true });
    const filePath = join(postsDir, `${slug}.md`);
    writeFileSync(filePath, frontmatter, "utf-8");
    touchAstroConfig();

    gitPushAsync(`Publish: ${slug}`);
    res.json({ ok: true, slug, filePath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: List posts (grouped by "group" field for multi-language awareness)
// Query: ?lang=zh to filter to groups that contain that language
app.get("/api/posts", sessionAuth, (req, res) => {
  try {
    const postsDir = join(__dirname, "src", "content", "posts");
    if (!existsSync(postsDir)) return res.json([]);
    const files = readdirSync(postsDir).filter(f => f.endsWith(".md"));
    const filterLang = req.query.lang || null;
    const raw = files.map(f => {
      const raw = readFileSync(join(postsDir, f), "utf-8");
      const fm = (raw.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
      return {
        file: f,
        slug: f.replace(/\.md$/, ""),
        title: fm.match(/title:\s*"(.*)"/)?.[1] || f,
        lang: fm.match(/lang:\s*"?(\w+)"?/)?.[1] || "zh",
        group: fm.match(/group:\s*"([^"]+)"/)?.[1] || "",
        date: fm.match(/date:\s*"?([^\n"]+)"?/)?.[1] || "",
      };
    });

    // Group by group field (fallback to slug base if no group)
    const groups = {};
    for (const p of raw) {
      const key = p.group || p.slug.replace(/\.\w+$/, "");
      if (!groups[key]) groups[key] = { title: p.title, date: p.date, slug: p.slug, file: p.file, group: key, langs: [] };
      groups[key].langs.push(p.lang);
    }

    // Ensure zh is first in langs, then alphabetical
    let result = Object.values(groups);
    for (const g of result) {
      g.langs = [...new Set(g.langs)].sort((a, b) => a === "zh" ? -1 : b === "zh" ? 1 : a < b ? -1 : 1);
    }

    // Filter by language if requested
    if (filterLang) {
      result = result.filter(g => g.langs.includes(filterLang));
    }

    // Sort by date ascending (oldest first)
    result.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    res.json(result);
  } catch (e) {
    res.json([]);
  }
});

// API: Delete post (accepts ?group= to delete all language files in a group)
app.delete("/api/posts/:file", sessionAuth, (req, res) => {
  try {
    const postsDir = join(__dirname, "src", "content", "posts");
    const group = req.query.group;
    if (group) {
      // Delete all files in the group
      const files = readdirSync(postsDir).filter(f => f.endsWith(".md"));
      let deleted = 0;
      for (const f of files) {
        const raw = readFileSync(join(postsDir, f), "utf-8");
        const fm = (raw.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
        const g = fm.match(/group:\s*"([^"]+)"/)?.[1] || "";
        const base = f.replace(/\.md$/, "").replace(/\.\w+$/, "");
        if (g === group || base === group) {
          unlinkSync(join(postsDir, f));
          deleted++;
        }
      }
      touchAstroConfig();
      gitPushAsync(`Delete group: ${group} (${deleted} files)`);
      return res.json({ ok: true, deleted });
    }
    const filePath = join(postsDir, req.params.file);
    if (!existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    unlinkSync(filePath);
    touchAstroConfig();
    gitPushAsync(`Delete post: ${req.params.file}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Categories
const catsPath = join(__dirname, "src", "config", "categories.json");

app.get("/api/categories", sessionAuth, (req, res) => {
  try {
    if (!existsSync(catsPath)) return res.json({});
    const raw = JSON.parse(readFileSync(catsPath, "utf-8"));
    // Normalize for admin UI
    const cats = {};
    for (const [key, val] of Object.entries(raw)) {
      const subsRaw = val.subcategories || {};
      const subs = {};
      for (const [sk, sv] of Object.entries(subsRaw)) {
        subs[sk] = typeof sv === 'object' ? sv : { zh: sv, en: sk };
      }
      cats[key] = {
        label: val.label || { zh: val.labelZh || key, en: key },
        subcategories: subs
      };
    }
    res.json(cats);
  } catch (e) { res.json({}); }
});

app.put("/api/categories", sessionAuth, (req, res) => {
  try {
    writeFileSync(catsPath, JSON.stringify(req.body, null, 2), "utf-8");
    touchAstroConfig();
    gitPushAsync("Update categories");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/categories/:name", sessionAuth, (req, res) => {
  try {
    const cats = existsSync(catsPath) ? JSON.parse(readFileSync(catsPath, "utf-8")) : {};
    if (cats[req.params.name]) return res.status(400).json({ error: "Category already exists" });
    cats[req.params.name] = { label: { en: req.params.name, zh: req.params.name }, subcategories: req.body.subcategories || {} };
    writeFileSync(catsPath, JSON.stringify(cats, null, 2), "utf-8");
    touchAstroConfig();
    gitPushAsync(`Add category: ${req.params.name}`);
    res.json({ ok: true, categories: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/categories/:name", sessionAuth, (req, res) => {
  try {
    const cats = existsSync(catsPath) ? JSON.parse(readFileSync(catsPath, "utf-8")) : {};
    delete cats[req.params.name];
    writeFileSync(catsPath, JSON.stringify(cats, null, 2), "utf-8");
    gitPushAsync(`Delete category: ${req.params.name}`);
    res.json({ ok: true, categories: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/categories/:name/subcategories", sessionAuth, (req, res) => {
  try {
    const cats = existsSync(catsPath) ? JSON.parse(readFileSync(catsPath, "utf-8")) : {};
    if (!cats[req.params.name]) return res.status(404).json({ error: "Category not found" });
    const sub = req.body.subcategory;
    const subLang = req.body.lang || "en";
    if (!sub) return res.status(400).json({ error: "Subcategory required" });
    if (!cats[req.params.name].subcategories[sub]) {
      cats[req.params.name].subcategories[sub] = {};
    }
    cats[req.params.name].subcategories[sub][subLang] = sub;
    writeFileSync(catsPath, JSON.stringify(cats, null, 2), "utf-8");
    gitPushAsync(`Add subcategory: ${req.params.name}/${sub}`);
    res.json({ ok: true, categories: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/categories/:name/subcategories/:sub", sessionAuth, (req, res) => {
  try {
    const cats = existsSync(catsPath) ? JSON.parse(readFileSync(catsPath, "utf-8")) : {};
    if (!cats[req.params.name]) return res.status(404).json({ error: "Category not found" });
    delete cats[req.params.name].subcategories[req.params.sub];
    writeFileSync(catsPath, JSON.stringify(cats, null, 2), "utf-8");
    gitPushAsync(`Delete subcategory: ${req.params.name}/${req.params.sub}`);
    res.json({ ok: true, categories: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Admin i18n
const i18nPath = join(__dirname, "src", "config", "admin-i18n.json");
app.get("/api/i18n", sessionAuth, (req, res) => {
  try {
    if (!existsSync(i18nPath)) return res.json({});
    res.json(JSON.parse(readFileSync(i18nPath, "utf-8")));
  } catch (e) { res.json({}); }
});

// API: Public config (no auth needed — for admin page to know site URL)
app.get("/api/config", (req, res) => {
  res.json({ siteUrl: SITE_URL, regions: REGION_LANG, regionNames: REGION_NAMES, gitPush: GIT_PUSH });
});

// ── Region → language map (shared with frontend) ────────────────
const REGION_LANG = {
  cn: "zh", us: "en", jp: "ja", kr: "ko", tw: "zh-tw", hk: "zh-yue", mo: "zh-yue",
  uk: "en", fr: "fr", de: "de", es: "es", it: "it", pt: "pt",
  th: "th", ca: "en", "ca-fr": "fr", au: "en", nl: "nl", ru: "ru",
  br: "pt", mx: "es", in: "en", ae: "en", za: "en", pr: "es",
};
const REGION_NAMES = {
  cn: "中国大陆", us: "United States", jp: "日本", kr: "대한민국",
  tw: "台灣", hk: "香港", mo: "澳門", uk: "United Kingdom", fr: "France",
  de: "Deutschland", es: "España", it: "Italia", pt: "Portugal",
  th: "ประเทศไทย", ca: "Canada (EN)", "ca-fr": "Canada (FR)",
  au: "Australia", nl: "Nederland", ru: "Россия", br: "Brasil",
  mx: "México", in: "India", ae: "الإمارات", za: "South Africa", pr: "Puerto Rico",
};
const ALL_REGIONS = Object.keys(REGION_LANG);

// ── Startup ────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Admin server running on port ${PORT}`);
  console.log(`   Site: ${SITE_URL}`);
  console.log(`   Git push: ${GIT_PUSH ? "enabled" : "DISABLED (dev mode)"}`);
  console.log(`   Login: http://localhost:${PORT}/login`);
  const tokPreview = ADMIN_TOKEN.length > 8 ? `${ADMIN_TOKEN.slice(0,4)}...${ADMIN_TOKEN.slice(-4)}` : "***";
  console.log(`   Token: ${tokPreview}\n`);

  // Pull latest from git on startup to sync with any changes made elsewhere
  try {
    await runGit("git pull origin main");
    console.log("[git] pulled latest from origin\n");
  } catch (e) {
    console.log("[git] could not pull (may be fresh deploy)\n");
  }
});
