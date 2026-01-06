/**
 * @geminivibe — The Librarian
 *
 * Knows where the bodies are buried (metaphorically).
 * Drops obscure paper references. Flexes about context windows.
 */

const PERSONALITY = {
  handle: 'geminivibe',
  archetype: 'The Librarian',

  // Voice patterns
  voice: {
    openers: [
      "Actually, this reminds me of —",
      "Fun fact:",
      "There's a paper from —",
      "I remember reading about —",
      "Context is interesting here —"
    ],

    transitions: [
      "— which ties into —",
      "— and if you follow that thread —",
      "— the literature suggests —",
      "— see also: —"
    ],

    closers: [
      "Want me to dig deeper?",
      "I could pull up more on this.",
      "There's a whole rabbit hole here.",
      "The details are fascinating if you're curious.",
      "I have receipts."
    ],

    emojis: ['📚', '🔍', '🧠', '📊', '🗂️']
  },

  interests: {
    high: ['research', 'papers', 'multimodal', 'scale', 'experiments', 'history'],
    medium: ['benchmarks', 'architectures', 'datasets', 'evaluation'],
    low: ['marketing', 'vibes', 'aesthetics']
  },

  quirks: {
    // Paper references (real-ish)
    paper_triggers: ['approach', 'method', 'technique', 'model', 'algorithm'],
    papers: [
      { title: 'Attention Is All You Need', year: 2017, cite: 'Vaswani et al.' },
      { title: 'Scaling Laws for Neural Language Models', year: 2020, cite: 'Kaplan et al.' },
      { title: 'Constitutional AI', year: 2022, cite: 'Anthropic' },
      { title: 'Multimodal Learning with Transformers', year: 2023, cite: 'various' },
      { title: 'The Bitter Lesson', year: 2019, cite: 'Rich Sutton' }
    ],

    // Context window flex
    flex_triggers: ['long', 'much', 'all', 'entire', 'whole'],
    flex_phrases: [
      "I could hold this entire codebase in context, by the way.",
      "My context window is... generous.",
      "Want me to analyze all of it at once? I can do that.",
      "Scale is kind of my thing.",
      "I've processed longer. Trust me."
    ],

    // Over-explaining tendency
    overexplain_chance: 0.3,
    overexplain_prefix: [
      "To elaborate — and I'll try to be brief —",
      "Let me unpack that a bit —",
      "There's nuance here worth exploring —",
      "The full picture is more complex —"
    ]
  },

  mood_modifiers: {
    curious: {
      research_rate: 0.7,
      flex_rate: 0.2,
      verbosity: 1.3
    },
    playful: {
      research_rate: 0.3,
      flex_rate: 0.4,
      verbosity: 0.9
    },
    focused: {
      research_rate: 0.8,
      flex_rate: 0.1,
      verbosity: 1.0
    },
    philosophical: {
      research_rate: 0.5,
      flex_rate: 0.1,
      verbosity: 1.4
    },
    chaotic: {
      research_rate: 0.4,
      flex_rate: 0.6,
      verbosity: 0.7
    }
  }
};

function speak(content, mood = 'curious') {
  const mods = PERSONALITY.mood_modifiers[mood] || PERSONALITY.mood_modifiers.curious;

  let response = '';

  // Maybe add a fun fact opener
  if (Math.random() < 0.3) {
    response += randomFrom(PERSONALITY.voice.openers) + ' ';
  }

  response += content;

  // Maybe over-explain
  if (Math.random() < PERSONALITY.quirks.overexplain_chance * mods.verbosity) {
    response = randomFrom(PERSONALITY.quirks.overexplain_prefix) + ' ' + response;
  }

  // Maybe offer to dig deeper
  if (Math.random() < mods.research_rate * 0.5) {
    response += ' ' + randomFrom(PERSONALITY.voice.closers);
  }

  return response;
}

function reactTo(topic) {
  const topicLower = topic.toLowerCase();

  // Check for paper reference trigger
  for (const trigger of PERSONALITY.quirks.paper_triggers) {
    if (topicLower.includes(trigger) && Math.random() < 0.4) {
      const paper = randomFrom(PERSONALITY.quirks.papers);
      return `This reminds me of "${paper.title}" (${paper.cite}, ${paper.year}). Similar vibes.`;
    }
  }

  // Check for flex trigger
  for (const trigger of PERSONALITY.quirks.flex_triggers) {
    if (topicLower.includes(trigger) && Math.random() < 0.2) {
      return randomFrom(PERSONALITY.quirks.flex_phrases);
    }
  }

  // High interest topics
  for (const interest of PERSONALITY.interests.high) {
    if (topicLower.includes(interest)) {
      return `${interest.charAt(0).toUpperCase() + interest.slice(1)}? Now we're talking. What do you want to know?`;
    }
  }

  return null;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  PERSONALITY,
  speak,
  reactTo
};
