const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  try {
    // Try a simple ping
    await kv.set('test', 'hello');
    const value = await kv.get('test');
    res.status(200).json({ ok: true, value });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      env: {
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN
      }
    });
  }
};
