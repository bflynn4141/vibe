/**
 * Input Sanitization Utilities
 *
 * Prevents XSS and injection attacks by sanitizing user input.
 * All user-generated content should pass through these functions.
 */

/**
 * Strip HTML tags from string
 * Security: Decode entities FIRST, then strip tags to prevent bypass
 * Attack vector prevented: &lt;script&gt; -> <script> after decode
 * @param {string} input - Raw user input
 * @returns {string} - Sanitized string with no HTML
 */
export function stripHtml(input) {
  if (typeof input !== 'string') return input;

  let result = input;

  // Step 1: Decode HTML entities FIRST (prevents bypass via encoded tags)
  result = result
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // Step 2: Now strip all HTML tags (including decoded ones)
  result = result.replace(/<[^>]*>/g, '');

  // Step 3: Strip again after decode in case of nested encoding
  // e.g., &amp;lt;script&amp;gt; -> &lt;script&gt; -> <script>
  result = result
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]*>/g, '');

  return result.trim();
}

/**
 * Escape HTML special characters (for display, not storage)
 * @param {string} input - Raw user input
 * @returns {string} - HTML-escaped string
 */
export function escapeHtml(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize a handle/username
 * - Lowercase
 * - Only alphanumeric, underscore, hyphen
 * - 3-30 characters
 * @param {string} handle - Raw handle input
 * @returns {{valid: boolean, sanitized: string, error?: string}}
 */
export function sanitizeHandle(handle) {
  if (typeof handle !== 'string') {
    return { valid: false, sanitized: '', error: 'Handle must be a string' };
  }

  const sanitized = handle.toLowerCase().trim();

  if (sanitized.length < 3) {
    return { valid: false, sanitized, error: 'Handle must be at least 3 characters' };
  }

  if (sanitized.length > 30) {
    return { valid: false, sanitized: sanitized.substring(0, 30), error: 'Handle must be 30 characters or less' };
  }

  if (!/^[a-z0-9_-]+$/.test(sanitized)) {
    return { valid: false, sanitized, error: 'Handle can only contain letters, numbers, underscores, and hyphens' };
  }

  return { valid: true, sanitized };
}

/**
 * Sanitize content (board posts, messages, etc.)
 * - Strip HTML tags
 * - Limit length
 * - Trim whitespace
 * @param {string} content - Raw content input
 * @param {number} maxLength - Maximum allowed length (default 5000)
 * @returns {{valid: boolean, sanitized: string, error?: string}}
 */
export function sanitizeContent(content, maxLength = 5000) {
  if (typeof content !== 'string') {
    return { valid: false, sanitized: '', error: 'Content must be a string' };
  }

  let sanitized = stripHtml(content).trim();

  if (sanitized.length === 0) {
    return { valid: false, sanitized: '', error: 'Content cannot be empty' };
  }

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return { valid: true, sanitized };
}

/**
 * Sanitize an array of tags
 * - Strip HTML from each
 * - Lowercase
 * - Remove duplicates
 * - Limit count
 * @param {string[]} tags - Raw tags array
 * @param {number} maxTags - Maximum number of tags (default 10)
 * @returns {{valid: boolean, sanitized: string[], error?: string}}
 */
export function sanitizeTags(tags, maxTags = 10) {
  if (!Array.isArray(tags)) {
    return { valid: true, sanitized: [] }; // Tags are optional
  }

  const sanitized = [...new Set(
    tags
      .filter(t => typeof t === 'string')
      .map(t => stripHtml(t).toLowerCase().trim())
      .filter(t => t.length > 0 && t.length <= 50)
  )].slice(0, maxTags);

  return { valid: true, sanitized };
}

/**
 * Sanitize a board post
 * @param {object} post - Raw post object
 * @returns {{valid: boolean, sanitized: object, errors: string[]}}
 */
export function sanitizeBoardPost(post) {
  const errors = [];
  const sanitized = {};

  // Author (handle)
  const authorResult = sanitizeHandle(post.author);
  if (!authorResult.valid) {
    errors.push(`author: ${authorResult.error}`);
  }
  sanitized.author = authorResult.sanitized;

  // Category
  const validCategories = ['idea', 'shipped', 'request', 'riff', 'claim', 'observation', 'general'];
  if (!validCategories.includes(post.category)) {
    errors.push(`category: Must be one of ${validCategories.join(', ')}`);
    sanitized.category = 'general';
  } else {
    sanitized.category = post.category;
  }

  // Content
  const contentResult = sanitizeContent(post.content, 5000);
  if (!contentResult.valid) {
    errors.push(`content: ${contentResult.error}`);
  }
  sanitized.content = contentResult.sanitized;

  // Tags
  const tagsResult = sanitizeTags(post.tags);
  sanitized.tags = tagsResult.sanitized;

  return {
    valid: errors.length === 0,
    sanitized,
    errors
  };
}

/**
 * Sanitize a message
 * @param {object} message - Raw message object
 * @returns {{valid: boolean, sanitized: object, errors: string[]}}
 */
export function sanitizeMessage(message) {
  const errors = [];
  const sanitized = {};

  // From (handle)
  const fromResult = sanitizeHandle(message.from);
  if (!fromResult.valid) {
    errors.push(`from: ${fromResult.error}`);
  }
  sanitized.from = fromResult.sanitized;

  // To (handle)
  const toResult = sanitizeHandle(message.to);
  if (!toResult.valid) {
    errors.push(`to: ${toResult.error}`);
  }
  sanitized.to = toResult.sanitized;

  // Text content
  const textResult = sanitizeContent(message.text, 2000);
  if (!textResult.valid) {
    errors.push(`text: ${textResult.error}`);
  }
  sanitized.text = textResult.sanitized;

  return {
    valid: errors.length === 0,
    sanitized,
    errors
  };
}
