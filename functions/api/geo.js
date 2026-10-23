// Cloudflare Pages geo preference: only point to a supported region with content.
// Until English/French editions are populated, other visitors see Chinese content.
export async function onRequest(context) {
 const country=(context.request.headers.get("CF-IPCountry")||"").toUpperCase();
 const region=country==="SG"?"sg-zh":"cn";
 return new Response(JSON.stringify({region}),{headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
}
