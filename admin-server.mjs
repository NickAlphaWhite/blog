import express from "express";
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
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

async function gitPush(commitMsg) {
  console.log(`[git] pushing: ${commitMsg}`);
  await runGit("git add -A");
  await runGit(`git commit -m "${commitMsg}" --allow-empty`);
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

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

// Admin page (protected)
app.get(["/", "/:lang"], (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME] !== ADMIN_TOKEN) {
    return res.redirect("/login");
  }
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
    const { title, titleZh, subtitle, date, category, subcategory, lang, group, image, content, featured, tags } = req.body;
    const tagList = (tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const frontmatter = [
      "---",
      `title: "${title}"`,
      titleZh ? `titleZh: "${titleZh}"` : null,
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
    writeFileSync(filePath, frontmatter, "utf-8");
    gitPushAsync(`Update post: ${req.params.file}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Upload image to local public/images
import multer from "multer";
const uploadDir = join(__dirname, "public", "images");
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
const ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"];
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = file.originalname.split(".").pop().toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        return cb(new Error("Invalid file type — allowed: " + ALLOWED_EXTS.join(", ")));
      }
      cb(null, crypto.randomBytes(8).toString("hex") + "." + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (ALLOWED_EXTS.includes(ext)) return cb(null, true);
    cb(new Error("Invalid file type — allowed: " + ALLOWED_EXTS.join(", ")));
  }
});
app.post("/api/upload", sessionAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  gitPushAsync(`Upload image: ${req.file.filename}`);
  res.json({ url: "/images/" + req.file.filename });
});

// API: Publish post
app.post("/api/publish", sessionAuth, (req, res) => {
  try {
    const { title, titleZh, subtitle, date, category, subcategory, lang, group, image, content, featured, tags } = req.body;
    if (!title || !category) {
      return res.status(400).json({ error: "Title and category are required" });
    }

    const base = (group || titleZh || title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug = date + "-" + base + (lang && lang !== "zh" ? "." + lang : "");
    const tagList = (tags || "").split(",").map(t => t.trim()).filter(Boolean);

    const frontmatter = [
      "---",
      `title: "${title}"`,
      titleZh ? `titleZh: "${titleZh}"` : null,
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
        titleZh: fm.match(/titleZh:\s*"(.*)"/)?.[1] || "",
        lang: fm.match(/lang:\s*"?(\w+)"?/)?.[1] || "zh",
        group: fm.match(/group:\s*"?(\S+)"?/)?.[1] || "",
        date: fm.match(/date:\s*"?([^\n"]+)"?/)?.[1] || "",
      };
    });

    // Group by group field (fallback to slug base if no group)
    const groups = {};
    for (const p of raw) {
      const key = p.group || p.slug.replace(/\.\w+$/, "");
      if (!groups[key]) groups[key] = { title: p.title, titleZh: p.titleZh, date: p.date, slug: p.slug, file: p.file, group: key, langs: [] };
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
        const g = fm.match(/group:\s*"?(\S+)"?/)?.[1] || "";
        const base = f.replace(/\.md$/, "").replace(/\.\w+$/, "");
        if (g === group || base === group) {
          unlinkSync(join(postsDir, f));
          deleted++;
        }
      }
      gitPushAsync(`Delete group: ${group} (${deleted} files)`);
      return res.json({ ok: true, deleted });
    }
    const filePath = join(postsDir, req.params.file);
    if (!existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    unlinkSync(filePath);
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
  res.json({ siteUrl: SITE_URL });
});

// ── Startup ────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Admin server running on port ${PORT}`);
  console.log(`   Site: ${SITE_URL}`);
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
