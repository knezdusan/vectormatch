import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Ensure this route is never statically generated — it requires runtime DB access
export const runtime = "nodejs";

export const { POST, GET } = toNextJsHandler(auth);
