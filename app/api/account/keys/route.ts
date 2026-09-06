// The user's API keys. GET = hints only (last 4 chars), POST = validate + save encrypted, DELETE = remove.
import { keyHints, saveKeys } from "@/lib/account/keys";

export async function GET(req: Request) {
  const hints = await keyHints(req);
  if (!hints) return Response.json({ signedIn: false, anthropic: null, elevenlabs: null });
  return Response.json({ signedIn: true, ...hints, houseKey: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { anthropic?: string | null; elevenlabs?: string | null };
  const anthropic = typeof body.anthropic === "string" ? body.anthropic.trim() : body.anthropic;
  const elevenlabs = typeof body.elevenlabs === "string" ? body.elevenlabs.trim() : body.elevenlabs;
  if (anthropic && !/^sk-ant-/.test(anthropic)) return Response.json({ ok: false, error: "An Anthropic key starts with sk-ant-." }, { status: 400 });
  const r = await saveKeys(req, { anthropic, elevenlabs });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}

export async function DELETE(req: Request) {
  const { which } = (await req.json().catch(() => ({}))) as { which?: "anthropic" | "elevenlabs" };
  const r = await saveKeys(req, which === "elevenlabs" ? { elevenlabs: null } : { anthropic: null });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
