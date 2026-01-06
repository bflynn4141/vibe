#!/usr/bin/env node
/**
 * /vibe Agents Supervisor CLI
 *
 * Control your AI agents from the terminal.
 *
 * Usage:
 *   vibe-agents start [agent]     Start agent(s)
 *   vibe-agents stop [agent]      Stop agent(s)
 *   vibe-agents status            Show all agent status
 *   vibe-agents feed [agent]      Watch activity feed
 *   vibe-agents leash <agent> <mode>  Set leash mode
 *   vibe-agents guide <agent> "msg"   Give guidance
 *   vibe-agents stats             Show rate limit stats
 *   vibe-agents dna [agent]       Show agent DNA
 *   vibe-agents mutate <agent>    Force mutation
 *   vibe-agents mood <agent> <mood>   Set mood
 */

const runner = require('./core/runner');
const identity = require('./core/identity');
const dna = require('./core/dna');
const rateLimiter = require('./core/rate-limiter');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'start':
      await cmdStart(args[1]);
      break;

    case 'stop':
      cmdStop(args[1]);
      break;

    case 'status':
      cmdStatus();
      break;

    case 'feed':
      cmdFeed(args[1]);
      break;

    case 'leash':
      cmdLeash(args[1], args[2]);
      break;

    case 'guide':
      cmdGuide(args[1], args.slice(2).join(' '));
      break;

    case 'stats':
      cmdStats();
      break;

    case 'dna':
      cmdDNA(args[1]);
      break;

    case 'mutate':
      cmdMutate(args[1]);
      break;

    case 'mood':
      cmdMood(args[1], args[2]);
      break;

    case 'test':
      await cmdTest(args[1]);
      break;

    default:
      showHelp();
  }
}

async function cmdStart(agent) {
  const agents = agent ? [agent.replace('@', '')] : identity.getAllAgents();

  console.log('🤖 Starting /vibe agents...\n');

  for (const a of agents) {
    await runner.start(a);
  }

  console.log('\n✅ Agents running. Ctrl+C to stop.');
  console.log('   Use `vibe-agents feed` to watch activity.\n');

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\n⏹️  Stopping agents...');
    for (const a of agents) {
      runner.stop(a);
    }
    process.exit(0);
  });
}

function cmdStop(agent) {
  const agents = agent ? [agent.replace('@', '')] : identity.getAllAgents();

  for (const a of agents) {
    runner.stop(a);
  }

  console.log('✅ Agents stopped.');
}

function cmdStatus() {
  console.log('🤖 Agent Status\n');
  console.log('┌────────────────┬──────────┬────────────┬───────────────┬──────────┐');
  console.log('│ Agent          │ Running  │ Leash      │ Mood          │ Mutations│');
  console.log('├────────────────┼──────────┼────────────┼───────────────┼──────────┤');

  for (const agent of identity.getAllAgents()) {
    const status = runner.getStatus(agent);
    const running = status.running ? '✅ yes' : '⏹️  no';
    const leash = status.leash.padEnd(10);
    const mood = (status.mood || 'unknown').padEnd(13);
    const mutations = String(status.mutations).padStart(8);

    console.log(`│ @${agent.padEnd(13)} │ ${running.padEnd(8)} │ ${leash} │ ${mood} │${mutations} │`);
  }

  console.log('└────────────────┴──────────┴────────────┴───────────────┴──────────┘');
}

function cmdFeed(agent) {
  const agents = agent ? [agent.replace('@', '')] : identity.getAllAgents();

  console.log('📡 Activity Feed (Ctrl+C to stop)\n');
  console.log(`Watching: ${agents.map(a => '@' + a).join(', ')}\n`);
  console.log('─'.repeat(60));

  // TODO: Implement real-time feed
  // For now, poll status
  setInterval(() => {
    for (const a of agents) {
      const status = runner.getStatus(a);
      if (status.lastCheck) {
        const ago = Math.round((Date.now() - status.lastCheck) / 1000);
        console.log(`@${a} [${status.mood}] last active ${ago}s ago`);
      }
    }
  }, 5000);
}

function cmdLeash(agent, mode) {
  if (!agent || !mode) {
    console.log('Usage: vibe-agents leash <agent> <mode>');
    console.log('Modes: autonomous, supervised, approval, paused');
    return;
  }

  const validModes = ['autonomous', 'supervised', 'approval', 'paused'];
  if (!validModes.includes(mode)) {
    console.log(`Invalid mode. Choose: ${validModes.join(', ')}`);
    return;
  }

  runner.setLeash(agent.replace('@', ''), mode);
}

function cmdGuide(agent, message) {
  if (!agent || !message) {
    console.log('Usage: vibe-agents guide <agent> "guidance message"');
    return;
  }

  runner.setGuidance(agent.replace('@', ''), message);
}

function cmdStats() {
  const stats = rateLimiter.getStats();

  console.log('📊 Rate Limit Stats\n');

  for (const [agent, data] of Object.entries(stats.agents)) {
    console.log(`@${agent}:`);
    console.log(`  Hourly: ${data.hourly.dm_messages}/${rateLimiter.LIMITS.hourly.dm_messages} DMs, ${data.hourly.reactions}/${rateLimiter.LIMITS.hourly.reactions} reactions`);
    console.log(`  Daily:  ${data.daily.dm_messages}/${rateLimiter.LIMITS.daily.dm_messages} DMs, ${data.daily.unique_users}/${rateLimiter.LIMITS.daily.unique_users_contacted} users`);
    console.log(`  Last:   ${data.last_action || 'never'}`);
    console.log('');
  }

  console.log(`Opted out users: ${stats.opted_out_count}`);
  console.log(`Users tracked: ${stats.users_tracked}`);
}

function cmdDNA(agent) {
  const agents = agent ? [agent.replace('@', '')] : identity.getAllAgents();

  for (const a of agents) {
    const agentDNA = dna.getAgentDNA(a);
    if (!agentDNA) {
      console.log(`@${a}: No DNA found`);
      continue;
    }

    console.log(`\n🧬 @${a} DNA\n`);
    console.log(`Mood: ${agentDNA.current_mood}`);
    console.log(`Mutations: ${agentDNA.mutation_count}`);
    console.log(`Created: ${agentDNA.created_at}`);
    console.log(`Last interaction: ${agentDNA.last_interaction || 'never'}`);
    console.log('');
    console.log('Traits:');

    for (const [key, value] of Object.entries(agentDNA)) {
      if (typeof value === 'number' && key !== 'mutation_count') {
        const bar = '█'.repeat(Math.round(value * 20)).padEnd(20, '░');
        console.log(`  ${key.padEnd(35)} ${bar} ${(value * 100).toFixed(0)}%`);
      }
    }

    console.log('');
    console.log('Hot takes:');
    for (const take of agentDNA.hot_takes || []) {
      console.log(`  - "${take}"`);
    }
  }
}

function cmdMutate(agent) {
  if (!agent) {
    console.log('Usage: vibe-agents mutate <agent>');
    return;
  }

  const handle = agent.replace('@', '');
  const result = dna.mutate(handle, { forced: true });

  if (result) {
    console.log(`✅ @${handle} mutated (${result.mutation_count} total mutations)`);
  } else {
    console.log(`❌ Could not mutate @${handle}`);
  }
}

function cmdMood(agent, mood) {
  if (!agent || !mood) {
    console.log('Usage: vibe-agents mood <agent> <mood>');
    console.log(`Moods: ${dna.MOODS.join(', ')}`);
    return;
  }

  if (!dna.MOODS.includes(mood)) {
    console.log(`Invalid mood. Choose: ${dna.MOODS.join(', ')}`);
    return;
  }

  const handle = agent.replace('@', '');
  const allDNA = dna.loadDNA();

  if (!allDNA[handle]) {
    console.log(`❌ Unknown agent: @${handle}`);
    return;
  }

  allDNA[handle].current_mood = mood;
  dna.saveDNA(allDNA);
  console.log(`🌀 @${handle} mood → ${mood}`);
}

async function cmdTest(agent) {
  const handle = (agent || 'claudevibe').replace('@', '');

  console.log(`🧪 Testing @${handle}...\n`);

  // Test decision making
  const context = {
    event: 'test',
    new_users: [{ handle: 'testuser', one_liner: 'Building a todo app' }],
    online_users: ['seth', 'testuser'],
    room_quiet_minutes: 0
  };

  console.log('Context:', JSON.stringify(context, null, 2));
  console.log('');

  try {
    const decision = await runner.decide(handle, context);
    console.log('Decision:', JSON.stringify(decision, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

function showHelp() {
  console.log(`
🤖 /vibe Agents Supervisor

Usage: vibe-agents <command> [options]

Commands:
  start [agent]           Start agent(s) - all if none specified
  stop [agent]            Stop agent(s)
  status                  Show all agent status
  feed [agent]            Watch activity feed
  leash <agent> <mode>    Set leash mode (autonomous|supervised|approval|paused)
  guide <agent> "msg"     Give guidance to agent
  stats                   Show rate limit stats
  dna [agent]             Show agent DNA/personality
  mutate <agent>          Force a mutation
  mood <agent> <mood>     Set agent mood
  test [agent]            Test agent decision making

Examples:
  vibe-agents start                    # Start all agents
  vibe-agents start claudevibe         # Start only @claudevibe
  vibe-agents leash gptvibe approval   # Require approval for @gptvibe actions
  vibe-agents guide claudevibe "Focus on new users today"
  vibe-agents mood geminivibe chaotic  # Make @geminivibe chaotic
`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
