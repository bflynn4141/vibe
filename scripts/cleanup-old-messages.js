#!/usr/bin/env node
const DEFAULT_DAYS = 30;
const BATCH_SIZE = 500;

function parseArgs(argv) {
  const args = { days: DEFAULT_DAYS, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--days' && argv[i + 1]) {
      args.days = Number(argv[i + 1]);
      i++;
    }
  }
  return args;
}

async function main() {
  const { days, dryRun } = parseArgs(process.argv);
  if (!Number.isFinite(days) || days <= 0) {
    console.error('Invalid --days value');
    process.exit(1);
  }

  const { kv } = await import('@vercel/kv');

  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const keys = await kv.keys('msg:*');

  if (!keys || keys.length === 0) {
    console.log('No message keys found.');
    return;
  }

  let scanned = 0;
  let eligible = 0;
  let deleted = 0;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batchKeys = keys.slice(i, i + BATCH_SIZE);
    const messages = await kv.mget(...batchKeys);
    scanned += batchKeys.length;

    const toDelete = [];
    for (let j = 0; j < batchKeys.length; j++) {
      const message = messages[j];
      if (!message || !message.createdAt) {
        continue;
      }
      const createdAt = new Date(message.createdAt).getTime();
      if (Number.isFinite(createdAt) && createdAt < cutoff) {
        eligible++;
        toDelete.push(batchKeys[j]);
      }
    }

    if (toDelete.length > 0) {
      if (!dryRun) {
        await kv.del(...toDelete);
        deleted += toDelete.length;
      }
    }
  }

  if (dryRun) {
    console.log(`Dry run: scanned ${scanned}, eligible ${eligible}`);
    return;
  }

  console.log(`Cleanup complete: scanned ${scanned}, deleted ${deleted}`);
}

main().catch(err => {
  console.error(`Cleanup failed: ${err.message}`);
  process.exit(1);
});
