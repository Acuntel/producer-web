// Studio status for the UI and for smoke tests: which senses are connected.
export async function GET() {
  return Response.json({
    brain: !!process.env.ANTHROPIC_API_KEY,
    voice: !!process.env.ELEVENLABS_API_KEY,
    model: process.env.PRODUCER_MODEL || "claude-opus-5",
    version: "v8-ears",
  });
}
