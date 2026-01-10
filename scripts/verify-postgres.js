import { neon } from '@neondatabase/serverless';

async function verify() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL not set');
    process.exit(1);
  }

  const sql = neon(process.env.POSTGRES_URL);

  const artifacts = await sql`
    SELECT id, slug, title, created_by, created_at
    FROM artifacts
    ORDER BY created_at DESC
    LIMIT 5
  `;

  console.log(`✅ Found ${artifacts.length} artifacts in Postgres:\n`);
  artifacts.forEach(a => {
    console.log(`  - ${a.title} (${a.slug})`);
    console.log(`    Created by: ${a.created_by} at ${a.created_at}`);
  });
}

verify();
