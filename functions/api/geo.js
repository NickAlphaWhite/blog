// Cloudflare Pages Function — suggests a region based on visitor country
// Reads the CF-IPCountry header that Cloudflare adds automatically.

const COUNTRY_TO_REGION = {
  CN: "cn", HK: "hk", MO: "mo", TW: "tw",
  JP: "jp", KR: "kr", TH: "th", SG: "sg",
  US: "us", CA: "ca", PR: "pr",
  GB: "uk", FR: "fr", DE: "de", ES: "es",
  IT: "it", PT: "pt", NL: "nl", RU: "ru",
  BR: "br", MX: "mx",
  IN: "in", AE: "ae", ZA: "za",
  AU: "au",
};

export async function onRequest(context) {
  const country = context.request.headers.get("CF-IPCountry") || "";
  const region = COUNTRY_TO_REGION[country.toUpperCase()] || "cn";

  return new Response(JSON.stringify({ region }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
