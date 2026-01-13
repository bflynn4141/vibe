/**
 * Docs redirect - sends to llms.txt which has API documentation
 */

export default function handler(req, res) {
  // Redirect to llms.txt which contains API documentation
  res.redirect(302, '/llms.txt');
}
