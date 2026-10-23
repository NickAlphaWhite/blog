// Stable, Unicode-aware public URL slugs. Shared by Astro and the admin server.
export function localizedSlug(input) {
  const result = String(input || "").normalize("NFKC").toLowerCase().trim()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 115).replace(/-+$/g, "");
  return result || "article";
}
export function legacySlug(postId) {
  return String(postId).replace(/^.*\//, "").replace(/\.md$/, "");
}
export function postSlug(postId, data) {
  return localizedSlug(data?.urlSlug || data?.title || legacySlug(postId));
}
