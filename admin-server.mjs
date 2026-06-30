import express from "express";
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3456;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "nickadmin2026";

// ── Auth middleware ────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.query.token || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized — provide ?token= or Authorization: Bearer" });
  }
  next();
}

app.use(express.json());

// Serve admin page
app.get(["/admin", "/admin/:lang"], (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(join(__dirname, "admin.html"));
});

// API: Get single post content
app.get("/api/posts/:file", (req, res) => {
  try {
    const postsDir = join(__dirname, "src", "content", "posts");
    const filePath = join(postsDir, req.params.file);
    if (!existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    const raw = readFileSync(filePath, "utf-8");
    res.json({ file: req.params.file, content: raw });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Update post
app.put("/api/posts/:file", auth, (req, res) => {
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
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Upload image to local public/images
import multer from "multer"; import crypto from "node:crypto";
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
app.post("/api/upload", auth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({ url: "/images/" + req.file.filename });
});

// API: Publish post
app.post("/api/publish", auth, (req, res) => {
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

    res.json({ ok: true, slug, filePath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: List posts
app.get("/api/posts", (req, res) => {
  try {
    const postsDir = join(__dirname, "src", "content", "posts");
    if (!existsSync(postsDir)) return res.json([]);
    const files = readdirSync(postsDir).filter(f => f.endsWith(".md"));
    const posts = files.map(f => {
      const raw = readFileSync(join(postsDir, f), "utf-8");
      const match = raw.match(/^---\n([\s\S]*?)\n---/);
      const fm = match ? match[1] : "";
      const title = fm.match(/title:\s*"(.*)"/)?.[1] || f;
      const lang = fm.match(/lang:\s*"?(\w+)"?/)?.[1] || "zh";
      return { slug: f.replace(/\.md$/, ""), title, lang, file: f };
    });
    res.json(posts);
  } catch (e) {
    res.json([]);
  }
});

// API: Delete post
app.delete("/api/posts/:file", auth, (req, res) => {
  try {
    const postsDir = join(__dirname, "src", "content", "posts");
    const filePath = join(postsDir, req.params.file);
    if (!existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    unlinkSync(filePath);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Categories
const catsPath = join(__dirname, "src", "config", "categories.json");

app.get("/api/categories", (req, res) => {
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

app.put("/api/categories", auth, (req, res) => {
  try {
    writeFileSync(catsPath, JSON.stringify(req.body, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/categories/:name", auth, (req, res) => {
  try {
    const cats = existsSync(catsPath) ? JSON.parse(readFileSync(catsPath, "utf-8")) : {};
    if (cats[req.params.name]) return res.status(400).json({ error: "Category already exists" });
    cats[req.params.name] = { label: { en: req.params.name, zh: req.params.name }, subcategories: req.body.subcategories || {} };
    writeFileSync(catsPath, JSON.stringify(cats, null, 2), "utf-8");
    res.json({ ok: true, categories: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/categories/:name", auth, (req, res) => {
  try {
    const cats = existsSync(catsPath) ? JSON.parse(readFileSync(catsPath, "utf-8")) : {};
    delete cats[req.params.name];
    writeFileSync(catsPath, JSON.stringify(cats, null, 2), "utf-8");
    res.json({ ok: true, categories: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/categories/:name/subcategories", auth, (req, res) => {
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
    res.json({ ok: true, categories: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/categories/:name/subcategories/:sub", auth, (req, res) => {
  try {
    const cats = existsSync(catsPath) ? JSON.parse(readFileSync(catsPath, "utf-8")) : {};
    if (!cats[req.params.name]) return res.status(404).json({ error: "Category not found" });
    delete cats[req.params.name].subcategories[req.params.sub];
    writeFileSync(catsPath, JSON.stringify(cats, null, 2), "utf-8");
    res.json({ ok: true, categories: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Admin i18n
const i18nPath = join(__dirname, "src", "config", "admin-i18n.json");
app.get("/api/i18n", (req, res) => {
  try {
    if (!existsSync(i18nPath)) return res.json({});
    res.json(JSON.parse(readFileSync(i18nPath, "utf-8")));
  } catch (e) { res.json({}); }
});

app.listen(PORT, () => {
  console.log(`\nAdmin: http://localhost:${PORT}/admin`);
  console.log(`API:   http://localhost:${PORT}/api/publish\n`);
});
