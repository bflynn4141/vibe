/**
 * Config — User identity and paths
 */

const fs = require('fs');
const path = require('path');

const VIBE_DIR = path.join(process.env.HOME, '.vibe');
const CONFIG_FILE = path.join(VIBE_DIR, 'config.json');

function ensureDir() {
  if (!fs.existsSync(VIBE_DIR)) {
    fs.mkdirSync(VIBE_DIR, { recursive: true });
  }
}

function load() {
  ensureDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return { handle: null, one_liner: null, visible: true };
}

function save(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getHandle() {
  const config = load();
  return config.handle || null;
}

function isInitialized() {
  const config = load();
  return config.handle && config.handle.length > 0;
}

module.exports = {
  VIBE_DIR,
  CONFIG_FILE,
  load,
  save,
  getHandle,
  isInitialized
};
