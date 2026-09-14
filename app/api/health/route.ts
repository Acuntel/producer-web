// Studio status for the UI and for smoke tests: which senses are connected.
export async function GET() {
  return Response.json({
    brain: !!process.env.ANTHROPIC_API_KEY,
    voice: !!process.env.ELEVENLABS_API_KEY,
    model: process.env.PRODUCER_MODEL || "claude-opus-5",
    accounts: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    version: "v11-stage",
  });
}
