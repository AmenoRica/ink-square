import assert from 'node:assert/strict';
import { scrambleMessage } from '../lib/chat.ts';

const source = '안녕 ink 123!';
const scrambled = scrambleMessage(source);
assert.equal(Array.from(scrambled).length, Array.from(source).length);
assert.equal(scrambled[2], ' ');
assert.match(scrambled, /^[a-z ]+$/);
console.log('chat scrambling check passed');
