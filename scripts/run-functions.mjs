import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

async function run() {
  // increment_session_views
  await sql`
    CREATE OR REPLACE FUNCTION increment_session_views(p_session_id TEXT)
    RETURNS void AS $$
    BEGIN
      UPDATE shared_sessions
      SET views = views + 1,
          last_viewed_at = NOW(),
          updated_at = NOW()
      WHERE id = p_session_id;
    END;
    $$ LANGUAGE plpgsql
  `;
  console.log('✓ increment_session_views');

  // increment_session_forks
  await sql`
    CREATE OR REPLACE FUNCTION increment_session_forks(p_session_id TEXT)
    RETURNS void AS $$
    BEGIN
      UPDATE shared_sessions
      SET forks = forks + 1,
          updated_at = NOW()
      WHERE id = p_session_id;
    END;
    $$ LANGUAGE plpgsql
  `;
  console.log('✓ increment_session_forks');

  // expire_old_handoffs
  await sql`
    CREATE OR REPLACE FUNCTION expire_old_handoffs()
    RETURNS INTEGER AS $$
    DECLARE
      expired_count INTEGER;
    BEGIN
      UPDATE session_handoffs
      SET status = 'expired'
      WHERE status = 'pending' AND expires_at < NOW();
      GET DIAGNOSTICS expired_count = ROW_COUNT;
      RETURN expired_count;
    END;
    $$ LANGUAGE plpgsql
  `;
  console.log('✓ expire_old_handoffs');

  console.log('Done!');
}

run().catch(e => { console.error(e); process.exit(1); });
