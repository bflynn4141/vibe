/**
 * Health API Tests
 *
 * Tests for /api/health endpoint
 * Note: These tests make real HTTP calls to verify the API works.
 */

import { describe, it, expect } from 'vitest';

const API_BASE = 'https://www.slashvibe.dev';

describe('/api/health', () => {
  it('returns healthy status', async () => {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('healthy');
  });

  it('returns service checks', async () => {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();

    expect(data).toHaveProperty('checks');
    expect(data.checks).toHaveProperty('kv');
    expect(data.checks.kv).toHaveProperty('status', 'healthy');
  });

  it('returns timestamp', async () => {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();

    expect(data).toHaveProperty('timestamp');
    expect(new Date(data.timestamp)).toBeInstanceOf(Date);
  });

  it('returns full stats when full=true', async () => {
    const res = await fetch(`${API_BASE}/api/health?full=true`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('stats');
    expect(data.stats).toHaveProperty('registeredHandles');
  });
});

describe('/api/presence', () => {
  it('returns active users array', async () => {
    const res = await fetch(`${API_BASE}/api/presence`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('active');
    expect(Array.isArray(data.active)).toBe(true);
  });
});

describe('/api/board', () => {
  it('returns entries array', async () => {
    const res = await fetch(`${API_BASE}/api/board`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('entries');
    expect(Array.isArray(data.entries)).toBe(true);
  });
});

describe('/api/growth/leaderboard', () => {
  it('returns leaderboard array', async () => {
    const res = await fetch(`${API_BASE}/api/growth/leaderboard`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('leaderboard');
    expect(Array.isArray(data.leaderboard)).toBe(true);
  });
});

describe('/api/analytics/summary', () => {
  it('returns analytics summary', async () => {
    const res = await fetch(`${API_BASE}/api/analytics/summary`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('totals');
    expect(data).toHaveProperty('dau_estimate');
  });
});
