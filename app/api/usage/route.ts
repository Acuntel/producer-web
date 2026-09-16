// Today's spend on the house key for the signed-in user, and the allowance, for the meter.
import { spendToday, HOUSE_USER_DAILY_USD } from "@/lib/brain/usage";

export async function GET(req: Request) {
  const s = await spendToday(req);
  return Response.json({ today: s.mine, cap: HOUSE_USER_DAILY_USD, signedIn: !!s.userId });
}
