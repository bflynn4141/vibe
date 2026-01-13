// Telemetry API - Collect usage metrics from vibe-terminal
// Privacy-focused: No command content, no file paths, just actions

import { kv } from "@vercel/kv";

export const config = {
  runtime: "edge",
};

// Hash userId for privacy (simple hash, not cryptographic)
function hashUserId(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `user_${Math.abs(hash).toString(36)}`;
}

export default async function handler(req) {
  // Handle CORS for sendBeacon
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { events, userId, version } = body;

    if (!events || !Array.isArray(events)) {
      return new Response(JSON.stringify({ error: "events array required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hashedUserId = hashUserId(userId || "anonymous");
    const timestamp = Date.now();

    // Store events in KV with TTL (30 days)
    const eventKey = `telemetry:events:${timestamp}`;
    const eventData = {
      userId: hashedUserId,
      version: version || "unknown",
      events: events.map(e => ({
        action: e.action,
        source: e.source,
        model: e.model,
        timestamp: e.timestamp,
        timeToDecisionMs: e.timeToDecisionMs,
      })),
      receivedAt: new Date().toISOString(),
    };

    await kv.set(eventKey, eventData, { ex: 30 * 24 * 60 * 60 }); // 30 days TTL

    // Update aggregate counters
    const today = new Date().toISOString().split("T")[0];

    // Daily active users
    await kv.sadd(`telemetry:dau:${today}`, hashedUserId);

    // Action counts
    for (const event of events) {
      if (event.action) {
        await kv.incr(`telemetry:actions:${today}:${event.action}`);
      }
    }

    // Version distribution
    if (version) {
      await kv.incr(`telemetry:versions:${today}:${version}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      received: events.length,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (error) {
    console.error("Telemetry error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
