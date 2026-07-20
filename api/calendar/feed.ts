import { eq } from "drizzle-orm";

import { users } from "../../db/schema";
import {
  buildIcalFeedForUser,
  verifyCalendarFeedToken,
} from "../_lib/calendar-feed";
import { db } from "../_lib/db";
import { ApiError } from "../_lib/errors";
import { json, methodNotAllowed } from "../_lib/http";
import { userHasPro } from "../_lib/pro";

// GET /api/calendar/feed?token=… — personal iCal feed, subscribed from
// Apple/Google Calendar via webcal://. Token-authed (no session), Pro-gated
// on every poll so lapsed subscriptions stop syncing.
export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(res);
  }

  try {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const token =
      typeof req.query?.token === "string"
        ? req.query.token
        : requestUrl.searchParams.get("token") ?? "";
    const userId = verifyCalendarFeedToken(token);

    const rows = await db
      .select({ proUntil: users.proUntil })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!rows[0]) {
      throw new ApiError(404, "user_not_found", "Account no longer exists");
    }
    if (!userHasPro(rows[0])) {
      throw new ApiError(403, "pro_required", "Plotlist Pro required");
    }

    const ics = await buildIcalFeedForUser(userId);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="plotlist.ics"');
    res.setHeader("Cache-Control", "private, max-age=1800");
    res.end(ics);
    return;
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(500, "feed_failed", "Could not build calendar feed");
    return json(res, apiError.status, {
      error: { code: apiError.code, message: apiError.message },
    });
  }
}
