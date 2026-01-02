#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const bridgeDir = process.env.VIBE_BRIDGE_DIR || path.join(__dirname, '..', '..', 'solienne-vibe-bridge');
const cursorPath = process.env.VIBE_BRIDGE_CURSOR || path.join(bridgeDir, 'cursor.json');

function readJson(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function main() {
  if (!fs.existsSync(bridgeDir)) {
    console.error(`FAIL: bridge dir not found: ${bridgeDir}`);
    process.exit(1);
  }

  const backup = fs.existsSync(cursorPath) ? fs.readFileSync(cursorPath, 'utf8') : null;

  try {
    const testId = `test-${Date.now().toString(36)}`;
    const seed = {
      lastProcessedId: testId,
      processedIds: [testId],
      lastPoll: new Date().toISOString()
    };

    writeJson(cursorPath, seed);
    const loaded = readJson(cursorPath);

    if (!loaded.processedIds || !loaded.processedIds.includes(testId)) {
      throw new Error('cursor did not persist processedIds');
    }

    if (loaded.lastProcessedId !== testId) {
      throw new Error('cursor did not persist lastProcessedId');
    }

    console.log('PASS: bridge cursor persistence');
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (backup !== null) {
      fs.writeFileSync(cursorPath, backup);
    } else if (fs.existsSync(cursorPath)) {
      fs.unlinkSync(cursorPath);
    }
  }
}

main();
