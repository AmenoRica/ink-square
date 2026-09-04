import { writeFile } from 'node:fs/promises';
import ESpeakNg from 'espeak-ng';

const motifs = [
  'we ni ma re mi re kya ra hi re', 'ju ri yu mi re ke ra son', 'nyu ra he ra u ne ra yu ra we ra',
  'nun nyu ra u ne ra yu ra we ra hwi me ra ni', 'shyu ra shyu ra hwe me ra ni', 'chyo pe ri po shyu ra shyu ra hwe',
  'tyu ri ru ri myo he wi ni wi ni', 'hwi ha na ne ni ni e no we ni', 'nyo e hi nu he ra he nyu me ri',
  'ge ra we ri we ri me ri nyu', 'chyo ra pe chyo ra pe yo ri che nyu', 'go shi tyu go shi kyu cha ja re shi',
  'go shi tyu go shi kyu cha ju sa bi', 'mo i shi ko yu ru mon gu sha hi', 'me ge pa ra pi ge ra we ri we ri',
  'de kya n shi de ra ri che re che ri ra', 'won cha mo chyu ta wi ni gu ta', 'ja ni de ru ja re cha de',
  'bo re bo re we ke ra po ni', 'yu che mo ra bi nyu ge re me ra', 'hwi yu me no she chyu na he mo hi',
  'na ni re ju te mi re kya ra he rya', 'hwi ha na mi hwa nyu e no we ni', 'tyu ri ru rat che wi ru wi ni yu we ni',
  'me re me re nyu ge re ge re me ra', 'de kya n shi de re rit che re che ri ra', 'al ssi it', 'u mi', 'jo a tta', 'gae chu da',
];
const tokens = [...new Set(motifs.flatMap((phrase) => phrase.split(' ')))];
const outputPath = new URL('../public/espeak-bank.json', import.meta.url);

function analyzeLoop(samples, sampleRate) {
  const frameSize = Math.min(Math.floor(sampleRate * 0.03), samples.length);
  const searchStart = Math.floor(samples.length * 0.1);
  const searchEnd = Math.max(searchStart + frameSize, Math.floor(samples.length * 0.82));
  let center = Math.floor(samples.length * 0.5);
  let bestEnergy = 0;
  for (let start = searchStart; start + frameSize < searchEnd; start += 64) {
    let energy = 0;
    for (let i = start; i < start + frameSize; i += 1) energy += samples[i] * samples[i];
    if (energy > bestEnergy) {
      bestEnergy = energy;
      center = start + Math.floor(frameSize / 2);
    }
  }
  const from = Math.max(0, center - Math.floor(sampleRate * 0.055));
  const to = Math.min(samples.length, center + Math.floor(sampleRate * 0.055));
  let mean = 0;
  for (let i = from; i < to; i += 1) mean += samples[i];
  mean /= Math.max(1, to - from);
  let bestLag = Math.floor(sampleRate / 220);
  let bestScore = -Infinity;
  for (let lag = Math.floor(sampleRate / 480); lag <= Math.floor(sampleRate / 75); lag += 1) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = from + lag; i < to; i += 3) {
      const a = samples[i] - mean;
      const b = samples[i - lag] - mean;
      correlation += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const score = correlation / Math.sqrt(energyA * energyB + 1);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  const findRisingZero = (center) => {
    let best = center;
    let distance = Infinity;
    for (let i = Math.max(1, center - bestLag); i < Math.min(samples.length - 1, center + bestLag); i += 1) {
      if (samples[i - 1] <= 0 && samples[i] > 0 && Math.abs(i - center) < distance) {
        best = i;
        distance = Math.abs(i - center);
      }
    }
    return best;
  };
  const loopStart = findRisingZero(Math.max(1, center - bestLag * 2));
  const loopEnd = findRisingZero(Math.min(samples.length - 2, center + bestLag * 2));
  return { pitch: sampleRate / bestLag, loopStart, loopEnd: Math.min(samples.length - 2, Math.max(loopStart + bestLag * 3, loopEnd)) };
}

async function synthesizeSegments(parts, name, wordGap) {
  const pronunciations = { hwi: 'hwee', hwe: 'hway', hwa: 'hwah' };
  const spokenParts = parts.map((part) => pronunciations[part] || part);
  const synthesizer = await ESpeakNg({
    arguments: ['-m', '-v', 'en-us', '-s', '270', '-p', '82', '-g', String(wordGap), '-w', `/${name}.wav`, spokenParts.join(' <break time="300ms"/> ')],
  });
  const wav = synthesizer.FS.readFile(`/${name}.wav`);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  let sampleRate = 22050;
  let dataOffset = 44;
  let dataLength = wav.byteLength - dataOffset;
  while (offset + 8 <= wav.byteLength) {
    const id = String.fromCharCode(...wav.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    if (id === 'fmt ') sampleRate = view.getUint32(offset + 12, true);
    if (id === 'data') { dataOffset = offset + 8; dataLength = length; break; }
    offset += 8 + length + (length & 1);
  }
  const samples = new Int16Array(wav.buffer, wav.byteOffset + dataOffset, Math.floor(dataLength / 2));
  const gap = Math.floor(sampleRate * 0.16);
  const leadPadding = Math.floor(sampleRate * 0.002);
  const tailPadding = Math.floor(sampleRate * 0.01);
  const ranges = [];
  let start = -1;
  let lastActive = -1;
  for (let i = 0; i < samples.length; i += 1) {
    if (Math.abs(samples[i]) > 110) {
      if (start < 0) start = i;
      lastActive = i;
    } else if (start >= 0 && i - lastActive > gap) {
      ranges.push([Math.max(0, start - leadPadding), Math.min(samples.length, lastActive + tailPadding)]);
      start = -1;
    }
  }
  if (start >= 0) ranges.push([Math.max(0, start - leadPadding), Math.min(samples.length, lastActive + tailPadding)]);
  if (ranges.length !== parts.length) throw new Error(`Expected ${parts.length} ${name}, found ${ranges.length}`);
  return { sampleRate, segments: ranges.map(([from, to]) => {
    const pcm = new Int16Array(to - from);
    pcm.set(samples.subarray(from, to));
    return { pcm: Buffer.from(pcm.buffer).toString('base64'), ...analyzeLoop(pcm, sampleRate) };
  }) };
}

const tokenAudio = await synthesizeSegments(tokens, 'tokens', 35);
const items = Object.fromEntries(tokens.map((token, index) => [token, tokenAudio.segments[index]]));
await writeFile(outputPath, `${JSON.stringify({ sampleRate: tokenAudio.sampleRate, items })}\n`);
console.log(`Generated ${tokens.length} syllables at ${tokenAudio.sampleRate}Hz`);
