// Telemetry Stats API - View aggregate usage metrics
// GET /api/telemetry/stats?days=7

import { kv } from "@vercel/kv";

export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "7", 10);

    const stats = {
      period: `${days} days`,
      dailyActiveUsers: [],
      actions: {},
      versions: {},
      totals: {
        uniqueUsers: 0,
        totalActions: 0,
      },
    };

    const allUsers = new Set();

    // Gather stats for each day
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      // DAU
      const dauCount = await kv.scard(`telemetry:dau:${dateStr}`);
      const dauMembers = await kv.smembers(`telemetry:dau:${dateStr}`);
      dauMembers.forEach(u => allUsers.add(u));

      stats.dailyActiveUsers.push({
        date: dateStr,
        count: dauCount || 0,
      });

      // Actions for today (only fetch for most recent day to keep response small)
      if (i === 0) {
        const actionKeys = [
          "accept", "reject", "retry",
          "yolo_enable", "yolo_disable",
          "model_switch", "shortcut_used",
          "progress_viewed", "help_opened"
        ];

        for (const action of actionKeys) {
          const count = await kv.get(`telemetry:actions:${dateStr}:${action}`);
          if (count) {
            stats.actions[action] = (stats.actions[action] || 0) + count;
            stats.totals.totalActions += count;
          }
        }

        // Versions
        const v010 = await kv.get(`telemetry:versions:${dateStr}:0.1.0`);
        if (v010) stats.versions["0.1.0"] = v010;
      }
    }

    stats.totals.uniqueUsers = allUsers.size;

    return new Response(JSON.stringify(stats, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (error) {
    console.error("Telemetry stats error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
