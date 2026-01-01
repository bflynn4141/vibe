/**
 * vibe inbox — See your messages
 */

const config = require('../config');
const store = require('../store');

const definition = {
  name: 'vibe_inbox',
  description: 'See your unread messages and recent threads.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

async function handler(args) {
  if (!config.isInitialized()) {
    return {
      display: 'Run `vibe init` first to set your identity.'
    };
  }

  const myHandle = config.getHandle();
  const threads = await store.getInbox(myHandle);

  if (!threads || threads.length === 0) {
    return {
      display: `## Inbox

_No messages yet._

Send one with \`vibe dm @someone "hello"\``
    };
  }

  // Sort: unread first, then by most recent
  const sorted = threads.sort((a, b) => {
    if (a.unread > 0 && b.unread === 0) return -1;
    if (b.unread > 0 && a.unread === 0) return 1;
    return (b.latest?.timestamp || 0) - (a.latest?.timestamp || 0);
  });

  let display = `## Inbox\n\n`;

  sorted.forEach(thread => {
    const unreadBadge = thread.unread > 0 ? ` (${thread.unread} new)` : '';
    const preview = thread.preview || '';

    display += `**@${thread.handle}**${unreadBadge}\n`;
    display += `  "${preview}" — _${thread.last_seen}_\n\n`;
  });

  display += `---\n\`vibe open @handle\` to see full thread`;

  return { display };
}

module.exports = { definition, handler };
