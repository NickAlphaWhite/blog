# Country/region editions

The blog is **region-first**, not language-first. A URL edition chooses the
country/region and (when necessary) a language variant. A separate `lang`
attribute controls interface strings, labels, and article language.

## Canonical URLs

- `/cn/` — mainland China (Simplified Chinese, `lang: zh`)
- `/us/` — United States (English, `lang: en`)
- `/sg-cn/` — Singapore, Simplified Chinese (the site-specific `cn` suffix is
  **not** an ISO language tag; its underlying language is `zh`)
- `/sg-en/` — Singapore, English
- `/ca-en/` — Canada, English
- `/ca-fr/` — Canada, French
- Other one-language country editions use their established country codes.

Legacy edition paths `/sg/`, `/sg-zh/` and `/ca/` redirect to
`/sg-en/`, `/sg-cn/` and `/ca-en/`, respectively. The admin also recognizes
those aliases; `/zh` redirects to `/cn` for previously shared admin links.

## Single source of truth

**Edit only `src/config/regions.json` to add or rename a region edition.**
It feeds:

- `src/lib/utils.ts` for static Astro routes and locale labels
- `src/pages/choose-country-region.astro` for country/region selection
- `src/components/Layout.astro` for browser-side region and language display
- `admin-server.mjs` for valid routes and the admin region selector
- `admin.html` through `/api/regions.js`

`functions/api/geo.js` separately maps Cloudflare's inferred country to the
**default edition** for that country (for example, `SG -> sg-en`). If new
countries are added, update that default map too.

## Content is region-specific

Article markdown belongs under `src/content/posts/<edition>/`. An article's
frontmatter `lang` must match the language associated with that edition in
`regions.json`. For example:

- `src/content/posts/cn/example.md` + `lang: zh`
- `src/content/posts/sg-cn/example.md` + `lang: zh`
- `src/content/posts/sg-en/example.md` + `lang: en`

Regional listings and article detail pages both select markdown by **edition
folder**, rather than borrowing all posts in the same language. A new edition
with no posts will remain empty until content is authored for that edition.
Existing `cn` articles are not automatically copied or translated.

## Admin routes

The Express admin backend is at `admin.bynaw.top/<edition>`, such as
`/cn`, `/sg-cn`, and `/sg-en`, while `/login` is a shared login page.
The public Astro blog at `blog.bynaw.top/<edition>/` uses the same edition
code.

Do not use `/zh`, `/en`, etc. as region routes. They are languages, not
regional editions. The legacy admin alias `/zh -> /cn` exists only to avoid
breaking previously shared links.
