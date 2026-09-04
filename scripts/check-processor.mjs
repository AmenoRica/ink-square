import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = {}; } };
let Processor;
globalThis.registerProcessor = (_name, implementation) => { Processor = implementation; };
await import('../public/inkling-processor.js');

const processor = new Processor();
processor.port.onmessage({ data: { type: 'settings', value: { voiceStyle: 'soft' } } });
assert.equal(processor.crossfadeLength, Math.floor(sampleRate * 0.085), 'soft style should use the longest syllable crossfade');
processor.port.onmessage({ data: { type: 'settings', value: { voiceStyle: 'balanced' } } });
processor.port.onmessage({ data: { type: 'settings', value: { excited: true } } });
assert.equal(processor.settings.excited, true, 'excited mode should reach the audio processor');
let phase = 0;
let power = 0;
let count = 0;
let peak = 0;
let previousSample = 0;
let largestStep = 0;
for (let block = 0; block < 600; block += 1) {
  const input = new Float32Array(128);
  const output = new Float32Array(128);
  for (let i = 0; i < input.length; i += 1) {
    input[i] = Math.sin(phase) * 0.16;
    phase += Math.PI * 2 * 200 / sampleRate;
  }
  processor.process([[input]], [[output]]);
  for (const sample of output) {
    assert.ok(Number.isFinite(sample));
    peak = Math.max(peak, Math.abs(sample));
    largestStep = Math.max(largestStep, Math.abs(sample - previousSample));
    previousSample = sample;
    power += sample * sample;
    count += 1;
  }
}
assert.equal(processor.holdingVowel, true, 'steady voiced input should engage the vowel sustain loop');
for (let block = 0; block < 200; block += 1) {
  processor.process([[new Float32Array(128)]], [[new Float32Array(128)]]);
}
assert.ok(Math.sqrt(power / count) > 0.005, 'generated voice should be audible');
assert.ok(peak < 0.9, 'soft limiter should prevent clipping');
assert.ok(largestStep < 0.25, 'generated voice should not contain abrupt click-like steps');
assert.ok(processor.pitch > 120 && processor.pitch < 280, 'pitch tracker should follow the source range');
assert.equal(processor.detectedSyllables, 1, 'a steady held vowel should stay one generated syllable');
assert.equal(processor.generatedSyllables, 1, 'a steady held vowel should not retrigger syllables');

const fiveSyllables = new Processor();
let pulsePhase = 0;
const feed = (blocks, level) => {
  for (let block = 0; block < blocks; block += 1) {
    const input = new Float32Array(128);
    for (let i = 0; i < input.length; i += 1) {
      input[i] = Math.sin(pulsePhase) * level;
      pulsePhase += Math.PI * 2 * 190 / sampleRate;
    }
    fiveSyllables.process([[input]], [[new Float32Array(128)]]);
  }
};
for (let syllable = 0; syllable < 5; syllable += 1) {
  feed(45, 0.16);
  feed(32, 0);
}
feed(240, 0);
assert.equal(fiveSyllables.detectedSyllables, 5, 'five input pulses should map to five syllable nuclei');
assert.equal(fiveSyllables.generatedSyllables, 5, 'five input syllables should generate exactly five output syllables');

for (const frequency of [110, 220, 330]) {
  const tracker = new Processor();
  let trackerPhase = 0;
  for (let block = 0; block < 500; block += 1) {
    const input = new Float32Array(128);
    for (let i = 0; i < input.length; i += 1) {
      input[i] = Math.sin(trackerPhase) * 0.16;
      trackerPhase += Math.PI * 2 * frequency / sampleRate;
    }
    tracker.process([[input]], [[new Float32Array(128)]]);
  }
  assert.ok(Math.abs(tracker.pitch - frequency) / frequency < 0.12, `pitch tracker should follow ${frequency}Hz (got ${tracker.pitch})`);
}

const palette = new Processor();
const onsetSounds = ['a', 'na', 'ma', 'ra', 'ha', 'sha', 'cha', 'ka', 'ta', 'pa', 'wa'].map((token) => palette.decodeToken(token)[4]);
assert.equal(new Set(onsetSounds).size, 11, 'the consonant palette should keep distinct onset families');
const vowelMoves = ['a', 'ya', 'ye', 'yo', 'yu', 'wa', 'we', 'wi', 'wo'].map((token) => palette.decodeToken(token).slice(0, 4).join(','));
assert.equal(new Set(vowelMoves).size, 9, 'the vowel palette should keep monophthongs and glides distinct');
assert.equal(palette.decodeToken('son')[5], 1, 'n coda should be preserved');
assert.equal(palette.decodeToken('mon')[5], 1, 'lyric vocabulary codas should be preserved');
const codas = ['an', 'am', 'al', 'at', 'ak', 'ap', 'ang'].map((token) => palette.decodeToken(token)[5]);
assert.equal(new Set(codas).size, 7, 'all seven coda families should remain distinct');
palette.phrase = ['mi'];
palette.phrasePosition = 0;
palette.beginSyllable(0.5);
assert.ok(palette.syllableLength >= sampleRate * 0.16, 'normal syllables should sustain for at least 160ms');
palette.phrase = ['mi~'];
palette.phrasePosition = 0;
palette.beginSyllable(0.5);
assert.ok(palette.syllableLength > sampleRate * 0.16, 'held-vowel tokens should last at least two short syllables');

const encodedBank = JSON.parse(await readFile(new URL('../public/espeak-bank.json', import.meta.url), 'utf8'));
assert.equal(Object.keys(encodedBank.items).length, 74, 'the eSpeak bank should contain every generated syllable');
assert.ok(encodedBank.items.na.pitch > 70, 'voice-bank entries should include source pitch');
assert.ok(encodedBank.items.na.loopEnd > encodedBank.items.na.loopStart, 'voice-bank entries should include a stable loop');
const softened = Array.from({ length: 500 }, () => palette.chooseSpokenToken('cha'));
const softenedCount = softened.filter((token) => /^[aeiouyw]/.test(token)).length;
assert.ok(softenedCount > 45 && softenedCount < 110, 'balanced style should soften about 15% of strong onsets');
const sharpPalette = new Processor();
sharpPalette.port.onmessage({ data: { type: 'settings', value: { voiceStyle: 'sharp' } } });
const sharpTokens = Array.from({ length: 500 }, () => sharpPalette.chooseSpokenToken('ra'));
assert.ok(sharpTokens.filter((token) => /^(?:s|sh|ch|j)/.test(token)).length > 90, 'sharp style should favor sibilant and affricate syllables');
const bankProcessor = new Processor();
const na = encodedBank.items.na;
const naBytes = Buffer.from(na.pcm, 'base64');
const naSamples = naBytes.buffer.slice(naBytes.byteOffset, naBytes.byteOffset + naBytes.byteLength);
bankProcessor.port.onmessage({ data: { type: 'sample-bank', sampleRate: encodedBank.sampleRate, items: [{ token: 'na', samples: naSamples, pitch: na.pitch, loopStart: na.loopStart, loopEnd: na.loopEnd }] } });
const postFilter = JSON.parse(await readFile(new URL('../public/city-postfilter.json', import.meta.url), 'utf8'));
bankProcessor.port.onmessage({ data: { type: 'post-filter', value: postFilter } });
assert.equal(postFilter.firstWeight.length, 72, 'the tiny post-filter should contain eight causal kernels');
bankProcessor.phrase = ['na'];
bankProcessor.phrasePosition = 0;
bankProcessor.envelope = 0.12;
bankProcessor.gate = 1;
bankProcessor.beginSyllable(0.5);
let bankPeak = 0;
let bankLargestStep = 0;
let bankPreviousSample = 0;
for (let block = 0; block < 80; block += 1) {
  if (block === 20) {
    bankProcessor.phrase = ['na'];
    bankProcessor.phrasePosition = 0;
    bankProcessor.beginSyllable(0.5);
  }
  const rendered = new Float32Array(128);
  bankProcessor.process([[new Float32Array(128)]], [[rendered]]);
  for (const sample of rendered) {
    bankPeak = Math.max(bankPeak, Math.abs(sample));
    bankLargestStep = Math.max(bankLargestStep, Math.abs(sample - bankPreviousSample));
    bankPreviousSample = sample;
  }
}
assert.ok(bankPeak > 0.04, 'the eSpeak backend should render an audible cached syllable');
assert.ok(bankLargestStep < 0.25, `overlapping eSpeak syllables should crossfade without click-like steps (got ${bankLargestStep})`);

const bridgeProcessor = new Processor();
const bridgeSamples = naBytes.buffer.slice(naBytes.byteOffset, naBytes.byteOffset + naBytes.byteLength);
bridgeProcessor.port.onmessage({ data: { type: 'sample-bank', sampleRate: encodedBank.sampleRate, items: [{ token: 'na', samples: bridgeSamples, pitch: na.pitch, loopStart: na.loopStart, loopEnd: na.loopEnd }] } });
bridgeProcessor.port.onmessage({ data: { type: 'post-filter', value: postFilter } });
bridgeProcessor.phrase = ['na', 'na'];
let bridgePhase = 0;
const renderBridge = (blocks, level) => {
  let energy = 0;
  let samples = 0;
  for (let block = 0; block < blocks; block += 1) {
    const input = new Float32Array(128);
    const output = new Float32Array(128);
    for (let i = 0; i < input.length; i += 1) {
      input[i] = Math.sin(bridgePhase) * level;
      bridgePhase += Math.PI * 2 * 190 / sampleRate;
    }
    bridgeProcessor.process([[input]], [[output]]);
    for (const value of output) energy += value * value;
    samples += output.length;
  }
  return Math.sqrt(energy / samples);
};
renderBridge(140, 0.16);
const bridgedGap = renderBridge(30, 0);
const continuedVoice = renderBridge(140, 0.16);
assert.ok(bridgedGap > 0.008, `a short inter-syllable gap should remain connected (got ${bridgedGap})`);
assert.ok(continuedVoice > 0.03, `a sustained vowel should not drop out (got ${continuedVoice})`);

const quietProcessor = new Processor();
const quietSamples = naBytes.buffer.slice(naBytes.byteOffset, naBytes.byteOffset + naBytes.byteLength);
quietProcessor.port.onmessage({ data: { type: 'sample-bank', sampleRate: encodedBank.sampleRate, items: [{ token: 'na', samples: quietSamples, pitch: na.pitch, loopStart: na.loopStart, loopEnd: na.loopEnd }] } });
quietProcessor.phrase = ['na'];
quietProcessor.phrasePosition = 0;
quietProcessor.envelope = 0.012;
quietProcessor.gate = 1;
quietProcessor.beginSyllable(0.5);
let quietPeak = 0;
for (let block = 0; block < 40; block += 1) {
  const rendered = new Float32Array(128);
  quietProcessor.process([[new Float32Array(128)]], [[rendered]]);
  for (const sample of rendered) quietPeak = Math.max(quietPeak, Math.abs(sample));
}
assert.ok(bankPeak > quietPeak * 1.7, 'generated syllable volume should follow the input speech envelope');

const engineSource = await readFile(new URL('../lib/audio/inkling-engine.ts', import.meta.url), 'utf8');
assert.doesNotMatch(engineSource, /createFallbackEffect|connect\(this\.dry\)/, 'calls must not have a raw-voice fallback path');
assert.match(engineSource, /if \(!this\.output\) throw new Error\('voice obfuscation is not ready'\)/, 'calls must require a ready obfuscated stream');
assert.ok(engineSource.indexOf('this.output = context.createMediaStreamDestination()') > engineSource.indexOf('this.effect = await this.createEffect(context)'), 'the call stream must be created only after obfuscation is ready');
