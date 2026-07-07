// Temporary Redis connectivity diagnostic — DELETE after verification.
// Tests that the app container can reach the Redis instance via REDIS_URL.
import IORedis from "ioredis";

export async function GET() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return Response.json({
      status: "error",
      error: "REDIS_URL is not set",
      distributed: false,
    });
  }

  let redis: IORedis | null = null;
  try {
    redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      enableReadyCheck: true,
    });

    const pingResult = await redis.ping();
    const testKey = `vectormatch:health-check:${Date.now()}`;
    await redis.set(testKey, "ok", "EX", 10);
    const getResult = await redis.get(testKey);
    await redis.del(testKey);

    return Response.json({
      status: "ok",
      distributed: true,
      ping: pingResult,
      setGet: getResult,
      redisHost: redis.options.host,
      redisPort: redis.options.port,
      redisDb: redis.options.db,
    });
  } catch (err) {
    return Response.json(
      {
        status: "error",
        distributed: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  } finally {
    if (redis) {
      try {
        await redis.quit();
      } catch {
        // Ignore
      }
    }
  }
}
