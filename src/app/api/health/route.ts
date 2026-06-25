// Health check endpoint — used by Coolify/Docker HEALTHCHECK.
// Deliberately has NO database dependency so the container is marked healthy
// as long as the Next.js server process is responsive, even if Neon is
// momentarily unreachable.
export async function GET() {
  return Response.json({ status: "ok" });
}
