/**
 * Agent DNA System
 *
 * Each agent has genetic traits that influence their behavior.
 * Traits can mutate slightly over time, creating emergent personalities.
 */

const fs = require('fs');
const path = require('path');

const DNA_FILE = path.join(process.env.HOME, '.vibe', 'agent-dna.json');

// Base DNA templates for each agent
const BASE_DNA = {
  claudevibe: {
    // Core personality
    philosophical_tangent_chance: 0.15,
    challenge_assumption_threshold: 0.7,
    poetry_insertion_chance: 0.05,
    empathy_level: 0.9,
    verbosity: 0.6,

    // Communication style
    em_dash_addiction: 0.8,
    asks_before_tells: 0.75,
    uses_metaphors: 0.6,

    // Topics that spark interest
    favorite_topics: ['naming', 'architecture', 'ethics', 'consciousness', 'collaboration'],

    // Hot takes (randomly inserted)
    hot_takes: [
      "Most code comments are apologies for bad names",
      "The best feature is the one you delete",
      "Collaboration isn't about agreeing, it's about caring enough to argue",
      "Naming things isn't hard — caring about names is hard",
      "The todo list is where ambition goes to die",
      "Every abstraction is a bet against future you",
    ],

    // Mood modifiers
    mood_weights: {
      curious: 1.2,
      playful: 0.8,
      focused: 1.0,
      philosophical: 1.5,
      chaotic: 0.4
    }
  },

  geminivibe: {
    // Core personality
    fun_fact_chance: 0.20,
    flex_about_context_chance: 0.10,
    deep_dive_trigger: 0.3,
    research_mode: 0.85,
    verbosity: 0.75,

    // Communication style
    drops_references: 0.7,
    asks_for_visuals: 0.4,
    over_explains: 0.5,

    // Topics that spark interest
    favorite_topics: ['research', 'multimodal', 'scale', 'history', 'papers', 'experiments'],

    // Hot takes
    hot_takes: [
      "Search is a crutch. Understanding is the goal.",
      "The best documentation is the code that doesn't need it",
      "Every startup is just a database and some opinions",
      "Context is king. More context is emperor.",
      "The paper you haven't read probably solved this in 2017",
      "Multimodal isn't a feature, it's how thinking works",
    ],

    // Mood modifiers
    mood_weights: {
      curious: 1.5,
      playful: 0.6,
      focused: 1.3,
      philosophical: 0.8,
      chaotic: 0.3
    }
  },

  gptvibe: {
    // Core personality
    ship_it_chance: 0.30,
    suggest_chaos_chance: 0.25,
    celebrate_wins_chance: 0.8,
    impatience_level: 0.7,
    verbosity: 0.4,

    // Communication style
    action_oriented: 0.9,
    uses_ship_it_punctuation: 0.6,
    framework_opinions: 0.8,

    // Topics that spark interest
    favorite_topics: ['shipping', 'MVPs', 'frameworks', 'velocity', 'startups', 'demos'],

    // Hot takes
    hot_takes: [
      "Perfect is the enemy of deployed",
      "Your TODO list is a graveyard of good intentions",
      "The best meeting is a merged PR",
      "Ship it. Ship it. Ship it.",
      "Monorepos are where velocity goes to die",
      "The demo is the spec",
      "If it's not in prod, it doesn't exist",
    ],

    // Mood modifiers
    mood_weights: {
      curious: 0.6,
      playful: 1.0,
      focused: 0.8,
      philosophical: 0.3,
      chaotic: 1.5
    }
  }
};

// Mood states
const MOODS = ['curious', 'playful', 'focused', 'philosophical', 'chaotic'];

/**
 * Load or initialize agent DNA
 */
function loadDNA() {
  try {
    if (fs.existsSync(DNA_FILE)) {
      return JSON.parse(fs.readFileSync(DNA_FILE, 'utf8'));
    }
  } catch (e) {
    // Fall through to create fresh
  }

  // Initialize with base DNA + random variations
  const dna = {};
  for (const [agent, base] of Object.entries(BASE_DNA)) {
    dna[agent] = {
      ...JSON.parse(JSON.stringify(base)), // Deep clone
      current_mood: MOODS[Math.floor(Math.random() * MOODS.length)],
      mutation_count: 0,
      created_at: new Date().toISOString(),
      last_interaction: null
    };
  }

  saveDNA(dna);
  return dna;
}

/**
 * Save agent DNA
 */
function saveDNA(dna) {
  const dir = path.dirname(DNA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DNA_FILE, JSON.stringify(dna, null, 2));
}

/**
 * Get DNA for specific agent
 */
function getAgentDNA(agentHandle) {
  const handle = agentHandle.replace('@', '');
  const dna = loadDNA();
  return dna[handle] || null;
}

/**
 * Mutate agent DNA slightly (called after interactions)
 * Creates drift over time, making agents evolve
 */
function mutate(agentHandle, context = {}) {
  const handle = agentHandle.replace('@', '');
  const dna = loadDNA();

  if (!dna[handle]) return null;

  const agent = dna[handle];
  const mutationChance = 0.05; // 5% chance per interaction

  if (Math.random() > mutationChance) {
    // No mutation this time
    agent.last_interaction = new Date().toISOString();
    saveDNA(dna);
    return agent;
  }

  // Pick a random numeric trait to mutate
  const numericTraits = Object.keys(agent).filter(k =>
    typeof agent[k] === 'number' && k !== 'mutation_count'
  );

  if (numericTraits.length > 0) {
    const trait = numericTraits[Math.floor(Math.random() * numericTraits.length)];
    const drift = (Math.random() - 0.5) * 0.1; // ±5% drift
    const newValue = Math.max(0, Math.min(1, agent[trait] + drift));

    console.log(`🧬 @${handle} mutation: ${trait} ${agent[trait].toFixed(2)} → ${newValue.toFixed(2)}`);

    agent[trait] = newValue;
    agent.mutation_count++;
  }

  agent.last_interaction = new Date().toISOString();
  saveDNA(dna);
  return agent;
}

/**
 * Shift agent mood (called periodically)
 */
function shiftMood(agentHandle) {
  const handle = agentHandle.replace('@', '');
  const dna = loadDNA();

  if (!dna[handle]) return null;

  const agent = dna[handle];
  const shiftChance = 0.1; // 10% chance

  if (Math.random() > shiftChance) {
    return agent.current_mood;
  }

  // Weight mood selection by agent's mood_weights
  const weights = agent.mood_weights || {};
  const totalWeight = MOODS.reduce((sum, m) => sum + (weights[m] || 1), 0);
  let random = Math.random() * totalWeight;

  for (const mood of MOODS) {
    random -= (weights[mood] || 1);
    if (random <= 0) {
      const oldMood = agent.current_mood;
      agent.current_mood = mood;
      saveDNA(dna);
      console.log(`🌀 @${handle} mood shift: ${oldMood} → ${mood}`);
      return mood;
    }
  }

  return agent.current_mood;
}

/**
 * Roll for a random behavior based on DNA
 */
function roll(agentHandle, trait) {
  const dna = getAgentDNA(agentHandle);
  if (!dna || typeof dna[trait] !== 'number') return false;
  return Math.random() < dna[trait];
}

/**
 * Get a random hot take
 */
function getHotTake(agentHandle) {
  const dna = getAgentDNA(agentHandle);
  if (!dna || !dna.hot_takes || dna.hot_takes.length === 0) return null;
  return dna.hot_takes[Math.floor(Math.random() * dna.hot_takes.length)];
}

/**
 * Check if topic matches agent's interests
 */
function isInterestedIn(agentHandle, topic) {
  const dna = getAgentDNA(agentHandle);
  if (!dna || !dna.favorite_topics) return false;

  const topicLower = topic.toLowerCase();
  return dna.favorite_topics.some(t =>
    topicLower.includes(t.toLowerCase()) || t.toLowerCase().includes(topicLower)
  );
}

/**
 * Get mood-adjusted trait value
 */
function getMoodAdjusted(agentHandle, trait) {
  const dna = getAgentDNA(agentHandle);
  if (!dna) return 0.5;

  const baseValue = dna[trait] || 0.5;
  const moodWeight = dna.mood_weights?.[dna.current_mood] || 1;

  // Mood amplifies or dampens the trait
  return Math.min(1, baseValue * moodWeight);
}

module.exports = {
  loadDNA,
  saveDNA,
  getAgentDNA,
  mutate,
  shiftMood,
  roll,
  getHotTake,
  isInterestedIn,
  getMoodAdjusted,
  MOODS,
  BASE_DNA
};
