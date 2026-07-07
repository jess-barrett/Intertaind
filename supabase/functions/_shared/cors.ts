// Shared CORS headers for Intertaind Edge Functions.
//
// Both clients call functions cross-origin: the web app from its own domain
// and the mobile app via `supabase.functions.invoke` (which sends the
// authorization / apikey / x-client-info headers). We allow all origins
// because Edge Functions are a public read-through cache in front of TMDB —
// there is nothing origin-sensitive here, and the only privileged action
// (writing rows) uses the service-role key held server-side, never sent by
// the client.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
