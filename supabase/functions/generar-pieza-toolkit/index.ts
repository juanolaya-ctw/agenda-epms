import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RAILWAY_WORKER_URL = Deno.env.get("GOVTECH_WORKER_URL") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { speaker_id, nombre, cargo, empresa, foto_url } = body;

    if (!speaker_id || !nombre || !foto_url) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos: speaker_id, nombre, foto_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RAILWAY_WORKER_URL) {
      return new Response(
        JSON.stringify({ error: "GOVTECH_WORKER_URL no configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    let workerResp: Response;
    try {
      workerResp = await fetch(${RAILWAY_WORKER_URL}/govtech/fase1, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker_id, nombre, cargo, empresa, foto_url }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!workerResp.ok) {
      const errorText = await workerResp.text();
      return new Response(
        JSON.stringify({ error: Worker error :  }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await workerResp.json();
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort");
    return new Response(
      JSON.stringify({ error: isTimeout ? "Timeout generando la pieza (>90s)" : message }),
      { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
