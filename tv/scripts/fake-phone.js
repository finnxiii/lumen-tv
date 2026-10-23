#!/usr/bin/env node
// Fake phone controller for testing the TV app without the real phone website.
// Run from tv/: npm run fake-phone -- <ROOMCODE> [--backend http://HOST:4000] [--demo]
//
// Interactive mode (default):
//   mode <original|cinema|night|bright|sports>   — switch viewing mode
//   ai <text>                                     — send an AI analysis request
//   undo                                          — undo last settings change
//   quit                                          — exit
//
// Demo mode (--demo):
//   Scripted sequence: join → Bright Room → AI request → original

'use strict';

const {io}   = require('socket.io-client');
const rl_mod = require('readline');

// ── Parse args ────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const code   = (args.find(a => !a.startsWith('--')) ?? '').toUpperCase();
const bIdx   = args.indexOf('--backend');
const BASE   = (bIdx !== -1 ? args[bIdx + 1] : null)
  ?? process.env.BACKEND
  ?? 'http://localhost:4000';
const demo   = args.includes('--demo');

if (!code) {
  console.error('Usage: npm run fake-phone -- <ROOMCODE> [--backend http://HOST:4000] [--demo]');
  process.exit(1);
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Joining room ${code} at ${BASE}…`);
  const jr = await fetch(`${BASE}/api/sessions/${code}/join`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: '{}',
  });
  if (!jr.ok) {
    console.error('join failed:', jr.status, await jr.text());
    process.exit(1);
  }
  console.log('join OK');

  const socket = io(BASE, {transports: ['websocket'], query: {code, role: 'phone'}});
  socket.onAny((ev, data) => {
    console.log(' ←', ev, JSON.stringify(data).slice(0, 200));
  });

  await new Promise((res, rej) => {
    socket.on('connect', res);
    socket.on('connect_error', e => rej(e));
    setTimeout(() => rej(new Error('connect timeout')), 8_000);
  });
  console.log('connected — TV should now show "Phone connected"');

  const sendMode = mode => {
    console.log('→ mode:update', mode);
    socket.emit('mode:update', {mode, source: 'phone'});
  };

  const sendAI = async text => {
    console.log('→ ai/recommend:', JSON.stringify(text));
    const r = await fetch(`${BASE}/api/ai/recommend`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({code, request: text}),
    });
    const body = await r.text();
    console.log('← ai/recommend', r.status, body.slice(0, 200));
  };

  const sendUndo = () => {
    console.log('→ settings:undo');
    socket.emit('settings:undo', {});
  };

  if (demo) {
    await runDemo(sendMode, sendAI, socket);
  } else {
    await runInteractive(sendMode, sendAI, sendUndo, socket);
  }
}

// ── Demo sequence ─────────────────────────────────────────────────────────────
async function runDemo(sendMode, sendAI, socket) {
  console.log('\n[demo] waiting 4 s for TV to show Phone connected…');
  await wait(4_000);

  console.log('\n[demo] step 1: Bright Room mode');
  sendMode('bright');
  await wait(8_000);

  console.log('\n[demo] step 2: AI request');
  await sendAI("too dark hard to see night mode");
  console.log('[demo] AI recommendation should appear on TV in a few seconds…');
  await wait(12_000);

  console.log('\n[demo] step 3: back to original');
  sendMode('original');
  await wait(5_000);

  console.log('\n[demo] done.');
  socket.close();
  process.exit(0);
}

// ── Interactive mode ──────────────────────────────────────────────────────────
async function runInteractive(sendMode, sendAI, sendUndo, socket) {
  const MODES = ['original', 'cinema', 'night', 'bright', 'sports'];
  const rl = rl_mod.createInterface({input: process.stdin, output: process.stdout});
  console.log('\nInteractive commands:');
  console.log('  mode <' + MODES.join('|') + '>');
  console.log('  ai <text>');
  console.log('  undo');
  console.log('  quit');
  rl.setPrompt('phone> ');
  rl.prompt();

  rl.on('line', async raw => {
    const [cmd, ...rest] = raw.trim().split(' ');
    const arg = rest.join(' ');
    switch (cmd) {
      case 'mode':
        if (!MODES.includes(arg)) {console.log('Unknown mode. Valid:', MODES.join(', ')); break;}
        sendMode(arg);
        break;
      case 'ai':
        if (!arg) {console.log('Usage: ai <text>'); break;}
        await sendAI(arg);
        break;
      case 'undo':
        sendUndo();
        break;
      case 'quit': case 'exit': case 'q':
        rl.close();
        socket.close();
        process.exit(0);
        break;
      default:
        if (cmd) {console.log('Unknown command:', cmd);}
    }
    rl.prompt();
  });

  rl.on('close', () => {socket.close(); process.exit(0);});
}

main().catch(e => {console.error('ERROR:', e.message); process.exit(1);});
