/**
 * GET /style-demo - PET Green aesthetic showcase
 * Serves the /vibe house style demo page
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function handler(req, res) {
  try {
    const htmlPath = path.join(__dirname, 'style-demo.html');
    const html = await fs.readFile(htmlPath, 'utf-8');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Error serving style demo:', error);
    return res.status(500).send('Failed to load style demo');
  }
}
