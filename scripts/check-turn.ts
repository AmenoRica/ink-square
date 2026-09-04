import assert from 'node:assert/strict';
import { hasTurnServer } from '../lib/turn.ts';

assert.equal(hasTurnServer({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }), false);
assert.equal(hasTurnServer({ iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'user', credential: 'pass' }] }), true);
assert.equal(hasTurnServer({ iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'user' }] }), false);
console.log('TURN credentials check passed');
