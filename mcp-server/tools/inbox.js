/**
 * vibe inbox — See your messages
 */

const config = require('../config');
const store = require('../store');
const { requireInit, header, emptyState, formatTimeAgo, truncate, divider } = require('./_shared');

const definition = {
  name: 'vibe_inbox',
  description: 'See your unread messages and recent threads.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

async function handler(args) {
  const initCheck = requireInit();
  if (initCheck) return initCheck;

  const myHandle = config.getHandle();
  const threads = await store.getInbox(myHandle);

  if (!threads || threads.length === 0) {
    return {
      display: `${header('Inbox')}\n\n${emptyState('No messages yet.', 'Say "message someone" to start a conversation')}`
    };
  }

  // Sort: unread first, then by most recent
  const sorted = threads.sort((a, b) => {
    if (a.unread > 0 && b.unread === 0) return -1;
    if (b.unread > 0 && a.unread === 0) return 1;
    return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
  });

  const totalUnread = sorted.reduce((sum, t) => sum + (t.unread || 0), 0);
  let display = header(`Inbox${totalUnread > 0 ? ` (${totalUnread} unread)` : ''}`);
  display += '\n\n';

  sorted.forEach(thread => {
    const unreadBadge = thread.unread > 0 ? ` 📬 ${thread.unread} new` : '';
    const preview = truncate(thread.lastMessage || '', 60);
    const timeAgo = formatTimeAgo(thread.lastTimestamp);

    display += `**@${thread.handle}**${unreadBadge}\n`;
    if (preview) {
      display += `  "${preview}"\n`;
    }
    if (timeAgo) {
      display += `  _${timeAgo}_\n`;
    }
    display += '\n';
  });

  display += `${divider()}Say "open thread with @handle" to read more`;

  return { display };
}

module.exports = { definition, handler };
