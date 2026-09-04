class InklingVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.settings = { voiceStyle: 'balanced', excited: false, characterPitch: 15, obscurity: 88, chop: 92, jitter: 0, crush: 0, bubbles: 48, invention: 78, voiceIsolation: true };
    this.analysis = new Float32Array(1536);
    this.orderedAnalysis = new Float32Array(1536);
    this.pitchScores = new Float32Array(700);
    this.analysisWrite = 0;
    this.pitchCountdown = 0;
    this.pitch = 150;
    this.pitchConfidence = 0;
    this.envelope = 0;
    this.gate = 0;
    this.wasSpeaking = false;
    this.voiceHang = 0;
    this.fastEnvelope = 0;
    this.slowEnvelope = 0;
    this.nucleusArmed = true;
    this.nucleusCooldown = 0;
    this.sinceNucleus = sampleRate;
    this.pendingSyllables = 0;
    this.expansionCredit = 0;
    this.detectedSyllables = 0;
    this.generatedSyllables = 0;
    this.phase = 0;
    this.noiseSeed = 0x6d2b79f5;
    this.syllableLeft = 0;
    this.syllableLength = 1;
    this.syllableAge = 0;
    this.consonantLeft = 0;
    this.consonantLength = 1;
    this.consonant = 0;
    this.coda = 0;
    this.phrase = [];
    this.phrasePosition = 0;
    this.lastToken = 'we';
    this.sampleBank = new Map();
    this.bankSampleRate = 22050;
    this.currentSample = null;
    this.currentSamplePitch = 220;
    this.currentLoopStart = 0;
    this.currentLoopEnd = 0;
    this.samplePosition = 0;
    this.sampleIsLong = false;
    this.holdingVowel = false;
    this.previousSample = null;
    this.previousSamplePosition = 0;
    this.crossfadeLeft = 0;
    this.crossfadeLength = Math.floor(sampleRate * 0.064);
    this.postFilter = null;
    this.postFilterStates = [];
    this.motifs = [
      ['we', 'ni', 'ma', 're', 'mi', 're', 'kya', 'ra', 'hi', 're'],
      ['ju', 'ri', 'yu', 'mi', 're', 'ke', 'ra', 'son'],
      ['nyu', 'ra', 'he', 'ra', 'u', 'ne', 'ra', 'yu', 'ra', 'we', 'ra'],
      ['nun', 'nyu', 'ra', 'u', 'ne', 'ra', 'yu', 'ra', 'we', 'ra', 'hwi', 'me', 'ra', 'ni'],
      ['shyu', 'ra', 'shyu', 'ra', 'hwe', 'me', 'ra', 'ni'],
      ['chyo', 'pe', 'ri', 'po', 'shyu', 'ra', 'shyu', 'ra', 'hwe'],
      ['tyu', 'ri', 'ru', 'ri', 'myo', 'he', 'wi', 'ni', 'wi', 'ni'],
      ['hwi', 'ha', 'na', 'ne', 'ni', 'ni', 'e', 'no', 'we', 'ni'],
      ['nyo', 'e', 'hi', 'nu', 'he', 'ra', 'he', 'nyu', 'me', 'ri'],
      ['ge', 'ra', 'we', 'ri', 'we', 'ri', 'me', 'ri', 'nyu'],
      ['chyo', 'ra', 'pe', 'chyo', 'ra', 'pe', 'yo', 'ri', 'che', 'nyu'],
      ['go', 'shi', 'tyu', 'go', 'shi', 'kyu', 'cha', 'ja', 're', 'shi'],
      ['go', 'shi', 'tyu', 'go', 'shi', 'kyu', 'cha', 'ju', 'sa', 'bi'],
      ['mo', 'i', 'shi', 'ko', 'yu', 'ru', 'mon', 'gu', 'sha', 'hi'],
      ['me', 'ge', 'pa', 'ra', 'pi', 'ge', 'ra', 'we', 'ri', 'we', 'ri'],
      ['de', 'kya', 'n', 'shi', 'de', 'ra', 'ri', 'che', 're', 'che', 'ri', 'ra'],
      ['won', 'cha', 'mo', 'chyu', 'ta', 'wi', 'ni', 'gu', 'ta'],
      ['ja', 'ni', 'de', 'ru', 'ja', 're', 'cha', 'de'],
      ['bo', 're', 'bo', 're', 'we', 'ke', 'ra', 'po', 'ni'],
      ['yu', 'che', 'mo', 'ra', 'bi', 'nyu', 'ge', 're', 'me', 'ra'],
      ['hwi', 'yu', 'me', 'no', 'she', 'chyu', 'na', 'he', 'mo', 'hi'],
      ['na', 'ni', 're', 'ju', 'te', 'mi', 're', 'kya', 'ra', 'he', 'rya'],
      ['hwi', 'ha', 'na', 'mi', 'hwa', 'nyu', 'e', 'no', 'we', 'ni'],
      ['tyu', 'ri', 'ru', 'rat', 'che', 'wi', 'ru', 'wi', 'ni', 'yu', 'we', 'ni'],
      ['me', 're', 'me', 're', 'nyu', 'ge', 're', 'ge', 're', 'me', 'ra'],
      ['de', 'kya', 'n', 'shi', 'de', 're', 'rit', 'che', 're', 'che', 'ri', 'ra'],
      ['al', 'ssi', 'it~'],
      ['u', 'mi~'],
      ['jo', 'a', 'tta~'],
      ['gae', 'chu', 'da~'],
    ];
    this.vowelIndex = -1;
    this.targetF1 = 560;
    this.targetF2 = 1680;
    this.currentF1 = 560;
    this.currentF2 = 1680;
    this.diphthongF1 = 560;
    this.diphthongF2 = 1680;
    this.formantTick = 0;
    this.formantCoefficients = [this.makeBandpass(560, 4.2), this.makeBandpass(1680, 5.2)];
    this.formantQ1 = 4.2;
    this.formantQ2 = 5.2;
    this.formantStates = [];
    this.breathStates = [];
    this.fricativeStates = [];
    this.outputStates = [];
    this.muffleStates = [];
    this.waterPhase = 0;
    this.bubblePhase = 0;
    this.bubbleFrequency = 0;
    this.bubbleLevel = 0;
    this.bubbleLeft = 0;
    this.bubbleLength = 1;
    this.bubbleWait = sampleRate * 0.2;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'settings') {
        Object.assign(this.settings, data.value);
        const crossfadeSeconds = this.settings.voiceStyle === 'sharp' ? 0.034 : this.settings.voiceStyle === 'soft' ? 0.085 : 0.064;
        this.crossfadeLength = Math.floor(sampleRate * crossfadeSeconds);
      }
      if (data.type === 'sample-bank') {
        this.bankSampleRate = data.sampleRate;
        this.sampleBank = new Map(data.items.map(({ token, samples, pitch, loopStart, loopEnd }) => [token, {
          samples: new Int16Array(samples), pitch, loopStart, loopEnd,
        }]));
      }
      if (data.type === 'post-filter') this.postFilter = data.value;
    };
  }

  random() {
    let value = this.noiseSeed;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.noiseSeed = value >>> 0;
    return this.noiseSeed / 4294967296;
  }

  makeBandpass(frequency, q) {
    const safeFrequency = Math.max(90, Math.min(sampleRate * 0.42, frequency));
    const w = Math.PI * 2 * safeFrequency / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    return { b0: alpha / a0, b2: -alpha / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - alpha) / a0 };
  }

  sampleAt(samples, position) {
    if (!samples || position < 0 || position >= samples.length) return 0;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = samples[index] || 0;
    const b = samples[Math.min(index + 1, samples.length - 1)] || 0;
    return (a + (b - a) * fraction) / 32768;
  }

  startSample(item, isLong = false) {
    if (this.currentSample && this.samplePosition < this.currentSample.length) {
      this.previousSample = this.currentSample;
      this.previousSamplePosition = this.samplePosition;
      this.crossfadeLeft = this.crossfadeLength;
    } else {
      this.previousSample = null;
      this.crossfadeLeft = 0;
    }
    this.currentSample = item?.samples || null;
    this.currentSamplePitch = item?.pitch || 220;
    this.currentLoopStart = item?.loopStart || 0;
    this.currentLoopEnd = item?.loopEnd || this.currentSample?.length || 0;
    this.samplePosition = 0;
    this.sampleIsLong = isLong;
  }

  applyPostFilter(input, channel) {
    const model = this.postFilter;
    if (!model) return input;
    const size = model.kernelSize;
    const state = this.postFilterStates[channel] ||= {
      input: new Float32Array(size),
      hidden: Array.from({ length: size }, () => new Float32Array(8)),
      output: 0,
    };
    state.input.copyWithin(1, 0, size - 1);
    state.input[0] = input;
    const currentHidden = new Float32Array(8);
    for (let unit = 0; unit < 8; unit += 1) {
      let sum = model.firstBias[unit];
      for (let tap = 0; tap < size; tap += 1) sum += model.firstWeight[unit * size + (size - 1 - tap)] * state.input[tap];
      currentHidden[unit] = Math.tanh(sum);
    }
    for (let tap = size - 1; tap > 0; tap -= 1) state.hidden[tap].set(state.hidden[tap - 1]);
    state.hidden[0].set(currentHidden);
    let residual = model.secondBias[0];
    for (let unit = 0; unit < 8; unit += 1) {
      for (let tap = 0; tap < size; tap += 1) residual += model.secondWeight[unit * size + (size - 1 - tap)] * state.hidden[tap][unit];
    }
    const filtered = input + residual * model.mix * 0.8;
    state.output += (filtered - state.output) * 0.4;
    return Math.tanh(state.output * 1.04) / Math.tanh(1.04) * 0.94;
  }

  chooseSpokenToken(token) {
    let clean = token.replaceAll('~', '');
    const vowelTokens = ['a', 'e', 'i', 'o', 'u', 'we', 'wi', 'yo', 'yu'];
    const sibilantTokens = ['shi', 'shyu', 'sha', 'she', 'ssi', 'sa', 'cha', 'che', 'chyo', 'chyu', 'chu', 'ja', 'jo', 'ju', 'son'];
    if (this.settings.voiceStyle === 'sharp' && this.random() < 0.28) {
      clean = sibilantTokens[Math.floor(this.random() * sibilantTokens.length)];
    }
    const strongOnset = /^(?:(?:sh|ch)|[kgtdpbsj])+/;
    const sibilantOnset = /^(?:s|sh|ch|j)/.test(clean);
    const softenChance = this.settings.voiceStyle === 'sharp' ? sibilantOnset ? 0.08 : 0.55 : 0.15;
    if ((strongOnset.test(clean) && this.random() < softenChance) || (!strongOnset.test(clean) && !/^[aeiouyw]/.test(clean) && this.random() < 0.3)) {
      return vowelTokens[Math.floor(this.random() * vowelTokens.length)];
    }
    return clean;
  }

  bandpass(channel, index, input) {
    const states = this.formantStates[channel] ||= [{ x1: 0, x2: 0, y1: 0, y2: 0 }, { x1: 0, x2: 0, y1: 0, y2: 0 }];
    const state = states[index];
    const c = this.formantCoefficients[index];
    const output = c.b0 * input + c.b2 * state.x2 - c.a1 * state.y1 - c.a2 * state.y2;
    state.x2 = state.x1;
    state.x1 = input;
    state.y2 = state.y1;
    state.y1 = output;
    return output;
  }

  estimatePitch() {
    const size = this.analysis.length;
    const ordered = this.orderedAnalysis;
    let mean = 0;
    for (let i = 0; i < size; i += 1) {
      ordered[i] = this.analysis[(this.analysisWrite + i) % size];
      mean += ordered[i];
    }
    mean /= size;
    let energy = 0;
    for (let i = 0; i < size; i += 1) ordered[i] -= mean;
    for (let i = 0; i < size; i += 2) {
      energy += ordered[i] * ordered[i];
    }
    if (energy < 0.002) {
      this.pitchConfidence *= 0.8;
      return;
    }

    const minLag = Math.floor(sampleRate / 440);
    const maxLag = Math.min(Math.floor(sampleRate / 72), 690);
    const coarseStep = 4;
    const coarseStart = minLag + ((coarseStep - minLag % coarseStep) % coarseStep);
    let bestLag = 0;
    let bestScore = 0;
    for (let lag = coarseStart; lag <= maxLag; lag += coarseStep) {
      let correlation = 0;
      let leftEnergy = 0;
      let rightEnergy = 0;
      for (let i = maxLag; i < size; i += 8) {
        const a = ordered[i];
        const b = ordered[i - lag];
        correlation += a * b;
        leftEnergy += a * a;
        rightEnergy += b * b;
      }
      const score = correlation / Math.sqrt(leftEnergy * rightEnergy + 1e-9);
      this.pitchScores[lag] = score;
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    if (bestLag && bestScore > 0.26) {
      let coarseLag = bestLag;
      const strongPeak = Math.max(0.42, bestScore * 0.88);
      for (let lag = coarseStart + coarseStep; lag <= maxLag - coarseStep; lag += coarseStep) {
        const score = this.pitchScores[lag];
        if (score < strongPeak || score < this.pitchScores[lag - coarseStep] || score < this.pitchScores[lag + coarseStep]) continue;
        coarseLag = lag;
        break;
      }
      let chosenLag = coarseLag;
      let refinedScore = -Infinity;
      const refineStart = Math.max(minLag, coarseLag - coarseStep);
      const refineEnd = Math.min(maxLag, coarseLag + coarseStep);
      for (let lag = refineStart; lag <= refineEnd; lag += 1) {
        let correlation = 0;
        let leftEnergy = 0;
        let rightEnergy = 0;
        for (let i = maxLag; i < size; i += 4) {
          const a = ordered[i];
          const b = ordered[i - lag];
          correlation += a * b;
          leftEnergy += a * a;
          rightEnergy += b * b;
        }
        const score = correlation / Math.sqrt(leftEnergy * rightEnergy + 1e-9);
        if (score > refinedScore) {
          refinedScore = score;
          chosenLag = lag;
        }
      }
      const nextPitch = sampleRate / chosenLag;
      const octaveSafe = this.pitchConfidence > 0.35
        ? nextPitch > this.pitch * 1.75 ? nextPitch * 0.5 : nextPitch < this.pitch * 0.58 ? nextPitch * 2 : nextPitch
        : nextPitch;
      this.pitch += (octaveSafe - this.pitch) * (refinedScore > 0.55 ? 0.16 : 0.07);
      this.pitchConfidence += (refinedScore - this.pitchConfidence) * 0.2;
    } else {
      this.pitchConfidence *= 0.86;
    }
  }

  beginSyllable(_strength) {
    if (this.phrasePosition >= this.phrase.length) {
      const phraseIndex = Math.floor(this.random() * this.motifs.length);
      this.phrase = this.motifs[phraseIndex];
      this.phrasePosition = 0;
    }
    let token = this.phrase[this.phrasePosition++];
    if (this.random() < 0.03) token = this.lastToken;
    if (this.random() < 0.06) {
      const mutation = this.motifs[Math.floor(this.random() * this.motifs.length)];
      token = mutation[Math.floor(this.random() * mutation.length)];
    }
    this.lastToken = token;
    const sound = this.decodeToken(token);
    const spokenToken = this.chooseSpokenToken(token);
    this.startSample(this.sampleBank.get(spokenToken) || this.sampleBank.get(token.replaceAll('~', '')) || null, token.endsWith('~'));
    const color = 0.94 + this.random() * 0.12;
    this.targetF1 = sound[0] * color;
    this.targetF2 = sound[1] / color;
    this.diphthongF1 = sound[2] * color;
    this.diphthongF2 = sound[3] / color;
    const density = this.settings.chop / 100;
    const longVowel = token.endsWith('~') ? 2.15 + this.random() * 0.85 : 1;
    this.syllableLength = sampleRate * (0.16 + this.random() * (0.07 - density * 0.012)) * longVowel;
    this.syllableLeft = this.syllableLength;
    this.syllableAge = 0;
    this.consonant = sound[4];
    this.coda = sound[5];
    const codaChance = 0.18 + this.settings.invention * 0.0025;
    if (!this.coda && this.random() < codaChance) this.coda = 1 + Math.floor(this.random() * 7);
    this.consonantLength = Math.min(this.syllableLength * 0.52, sampleRate * (0.04 + this.random() * 0.03));
    this.consonantLeft = this.consonantLength;
    this.generatedSyllables += 1;
  }

  decodeToken(token) {
    const clean = token.replaceAll('~', '');
    const vowels = { a: [790, 1250], e: [510, 1920], i: [300, 2380], o: [500, 860], u: [350, 960] };
    const nuclei = { ya: ['i', 'a'], ye: ['i', 'e'], yo: ['i', 'o'], yu: ['i', 'u'], wa: ['u', 'a'], we: ['u', 'e'], wi: ['u', 'i'], wo: ['u', 'o'], ae: ['a', 'e'], eo: ['e', 'o'], ui: ['u', 'i'] };
    const compound = Object.keys(nuclei).find((ending) => clean.includes(ending));
    const ending = clean.match(/[aeiou](?!.*[aeiou])/)?.[0] || 'u';
    const pair = compound ? nuclei[compound] : [ending, ending];
    const glide = vowels[pair[0]];
    const end = vowels[pair[1]];
    let consonant = 0;
    if (clean.startsWith('n')) consonant = 1;
    else if (clean.startsWith('m')) consonant = 2;
    else if (clean.startsWith('r')) consonant = 3;
    else if (clean.startsWith('h')) consonant = 4;
    else if (clean.startsWith('s')) consonant = 5;
    else if (clean.startsWith('ch') || clean.startsWith('j')) consonant = 6;
    else if (clean.startsWith('k') || clean.startsWith('g')) consonant = 7;
    else if (clean.startsWith('t') || clean.startsWith('d')) consonant = 8;
    else if (clean.startsWith('p') || clean.startsWith('b')) consonant = 9;
    else if (clean.startsWith('y') || clean.startsWith('w')) consonant = 10;
    const coda = clean.endsWith('ng') ? 7 : clean.endsWith('n') ? 1 : clean.endsWith('m') ? 2 : clean.endsWith('l') ? 3 : clean.endsWith('t') ? 4 : clean.endsWith('k') ? 5 : clean.endsWith('p') ? 6 : 0;
    return [glide[0], glide[1], end[0], end[1], consonant, coda];
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;
    const channels = output.length;
    const obscurity = this.settings.obscurity / 100;
    const invention = this.settings.invention / 100;
    const bubbles = this.settings.bubbles / 100;
    const crush = this.settings.crush / 100;
    const pitchRatio = 2 ** (this.settings.characterPitch / 12);
    const jitterDepth = this.settings.jitter * 0.000035;
    const quantizer = 2 ** (16 - crush * 7);
    const sharpStyle = this.settings.voiceStyle === 'sharp';
    const softStyle = this.settings.voiceStyle === 'soft';
    const attackSeconds = sharpStyle ? 0.007 : softStyle ? 0.025 : 0.016;
    const releaseSeconds = sharpStyle ? 0.015 : softStyle ? 0.045 : 0.03;
    const pulseDepth = sharpStyle ? 0.05 : softStyle ? 0.008 : 0.015;

    for (let i = 0; i < output[0].length; i += 1) {
      const microphone = input[0]?.[i] || 0;
      this.analysis[this.analysisWrite] = microphone;
      this.analysisWrite = (this.analysisWrite + 1) % this.analysis.length;
      if (--this.pitchCountdown <= 0) {
        this.estimatePitch();
        this.pitchCountdown = Math.floor(sampleRate * 0.035);
      }

      const magnitude = Math.abs(microphone);
      this.envelope += (magnitude - this.envelope) * (magnitude > this.envelope ? 0.045 : 0.0014);
      const energySpeaking = this.envelope > 0.0045;
      const energy = microphone * microphone;
      this.fastEnvelope += (energy - this.fastEnvelope) * 0.003;
      this.slowEnvelope += (energy - this.slowEnvelope) * 0.00025;
      if (energySpeaking && this.pitchConfidence > 0.3) this.voiceHang = sampleRate * 0.11;
      else this.voiceHang -= 1;
      const speaking = energySpeaking && (this.pitchConfidence > 0.2 || this.voiceHang > 0);
      this.nucleusCooldown -= 1;
      this.sinceNucleus += 1;
      const ready = speaking && this.fastEnvelope > Math.max(0.000036, this.slowEnvelope * 1.55);
      if (!speaking || this.fastEnvelope < this.slowEnvelope * 0.72) this.nucleusArmed = true;
      const steadyVoicing = speaking && this.pitchConfidence > 0.34 && this.sinceNucleus > sampleRate * 0.13
        && this.fastEnvelope < this.slowEnvelope * 1.35;
      const nucleus = speaking && this.nucleusCooldown <= 0
        && ((ready && this.nucleusArmed) || (this.sinceNucleus > sampleRate * 0.24 && !steadyVoicing));
      if (nucleus) {
        const expanded = this.expansionCredit + 1;
        const additions = Math.floor(expanded);
        this.expansionCredit = expanded - additions;
        this.pendingSyllables += additions;
        this.detectedSyllables += 1;
        this.nucleusArmed = false;
        this.nucleusCooldown = sampleRate * 0.055;
        this.sinceNucleus = 0;
        this.holdingVowel = false;
      }
      this.syllableLeft -= 1;
      if (this.pendingSyllables > 0 && (this.syllableLeft <= 0 || (ready && this.syllableAge > sampleRate * 0.105))) {
        this.beginSyllable(Math.min(1, this.envelope * 35));
        this.pendingSyllables -= 1;
      }
      if (steadyVoicing && this.pendingSyllables === 0 && this.syllableAge > sampleRate * 0.11) {
        this.holdingVowel = true;
        this.syllableLeft = Math.max(this.syllableLeft, sampleRate * 0.14);
      } else if (!speaking) {
        this.holdingVowel = false;
      }
      const gateTarget = speaking || this.pendingSyllables > 0 || this.syllableLeft > 0 ? 1 : 0;
      this.gate += (gateTarget - this.gate) * (gateTarget > this.gate ? 0.018 : 0.0017);
      this.wasSpeaking = speaking;
      this.syllableAge += 1;

      const progress = Math.min(1, this.syllableAge / Math.max(1, this.syllableLength));
      const diphthong = Math.max(0, (progress - 0.32) / 0.68);
      const targetF1 = this.targetF1 + (this.diphthongF1 - this.targetF1) * diphthong;
      const targetF2 = this.targetF2 + (this.diphthongF2 - this.targetF2) * diphthong;
      this.currentF1 += (targetF1 - this.currentF1) * 0.00065;
      this.currentF2 += (targetF2 - this.currentF2) * 0.00065;
      if (--this.formantTick <= 0) {
        const waterBend = 1 + Math.sin(this.waterPhase * Math.PI * 2) * bubbles * 0.018;
        this.formantCoefficients = [this.makeBandpass(this.currentF1 * waterBend, this.formantQ1), this.makeBandpass(this.currentF2 / waterBend, this.formantQ2)];
        this.formantTick = 48;
      }

      this.waterPhase += (2.1 + bubbles * 1.4) / sampleRate;
      if (this.waterPhase >= 1) this.waterPhase -= 1;
      const naturalDrift = Math.sin(this.waterPhase * Math.PI * 2) * jitterDepth;
      const rawPitch = Math.max(72, Math.min(420, this.pitch)) * pitchRatio;
      const midiPitch = 69 + 12 * Math.log2(rawPitch / 440);
      const steppedPitch = 440 * 2 ** ((Math.round(midiPitch) - 69) / 12);
      const trackedPitch = rawPitch * 0.94 + steppedPitch * 0.06;
      this.phase += trackedPitch * (1 + naturalDrift) / sampleRate;
      if (this.phase >= 1) this.phase -= 1;
      let glottal = 0;
      for (let harmonic = 1; harmonic <= 7; harmonic += 1) glottal += Math.sin(this.phase * Math.PI * 2 * harmonic) / (harmonic ** 1.35);
      glottal = (glottal + Math.sin(this.phase * Math.PI * 16) * 0.025) * 0.38;
      const noise = this.random() * 2 - 1;
      const consonantProgress = this.consonantLeft > 0 ? 1 - this.consonantLeft / this.consonantLength : 1;
      const consonantWindow = this.consonantLeft > 0 ? Math.sin(Math.PI * consonantProgress) : 0;
      const burstWindow = consonantProgress < 0.34 ? Math.sin(Math.PI * consonantProgress / 0.34) : 0;
      if (this.consonantLeft > 0) this.consonantLeft -= 1;

      if (--this.bubbleWait <= 0 && speaking && bubbles > 0.04) {
        this.bubbleFrequency = 170 + this.random() * 260;
        this.bubbleLevel = (0.006 + this.random() * 0.012) * bubbles;
        this.bubbleLength = sampleRate * (0.025 + this.random() * 0.035);
        this.bubbleLeft = this.bubbleLength;
        this.bubbleWait = sampleRate * (0.11 + this.random() * 0.24);
      }
      let bubble = 0;
      if (this.bubbleLeft > 0) {
        this.bubbleFrequency *= 1.000045;
        this.bubblePhase += this.bubbleFrequency / sampleRate;
        if (this.bubblePhase >= 1) this.bubblePhase -= 1;
        const bubbleProgress = 1 - this.bubbleLeft / this.bubbleLength;
        bubble = Math.sin(this.bubblePhase * Math.PI * 2) * this.bubbleLevel * Math.sin(Math.PI * bubbleProgress) ** 2;
        this.bubbleLeft -= 1;
      }

      const bankReady = this.sampleBank.size > 0;
      const syllableAttack = Math.min(1, this.syllableAge / (sampleRate * attackSeconds));
      const syllableRelease = Math.min(1, Math.max(0, this.syllableLeft) / (sampleRate * releaseSeconds));
      const phrasePulse = (1 - pulseDepth + Math.sin(Math.PI * progress) * pulseDepth) * syllableAttack * syllableRelease;
      const excitedAccent = this.settings.excited ? 1 + Math.max(0, 1 - this.syllableAge / (sampleRate * 0.055)) * 0.12 : 1;
      const inputDynamics = Math.max(0, Math.min(1, (this.envelope - 0.003) / 0.065));
      const expressiveLevel = (0.1 + Math.pow(inputDynamics, 0.78) * 0.9) * this.gate;
      const voiceLevel = bankReady ? expressiveLevel * phrasePulse * excitedAccent : Math.min(0.9, Math.sqrt(this.envelope) * 2.9) * this.gate * phrasePulse * excitedAccent;
      let sampledVoice = bankReady ? 0 : null;
      if (bankReady && this.currentSample && (speaking || this.pendingSyllables > 0 || this.syllableLeft > -sampleRate * 0.12)) {
        const sampleStep = this.bankSampleRate / sampleRate * trackedPitch / Math.max(70, this.currentSamplePitch);
        let currentVoice = this.sampleAt(this.currentSample, this.samplePosition);
        let loopFade = 0;
        const hasLoop = this.currentLoopEnd > this.currentLoopStart + 8;
        const shouldLoop = hasLoop && (speaking || this.sampleIsLong || this.holdingVowel || this.syllableLeft > sampleRate * 0.045);
        const loopStart = this.currentLoopStart;
        const loopEnd = this.currentLoopEnd;
        if (shouldLoop) {
          loopFade = Math.min(this.bankSampleRate / Math.max(70, this.currentSamplePitch), (loopEnd - loopStart) / 3);
          if (this.samplePosition >= loopEnd - loopFade) {
            const blend = (this.samplePosition - (loopEnd - loopFade)) / loopFade;
            const loopVoice = this.sampleAt(this.currentSample, loopStart + this.samplePosition - (loopEnd - loopFade));
            currentVoice = currentVoice * (1 - blend) + loopVoice * blend;
          }
        }
        if (this.previousSample && this.crossfadeLeft > 0) {
          const blend = 1 - this.crossfadeLeft / this.crossfadeLength;
          const smoothBlend = blend * blend * (3 - 2 * blend);
          const previousVoice = this.sampleAt(this.previousSample, this.previousSamplePosition);
          currentVoice = previousVoice * (1 - smoothBlend) + currentVoice * smoothBlend;
          this.previousSamplePosition += sampleStep;
          this.crossfadeLeft -= 1;
          if (this.crossfadeLeft <= 0) this.previousSample = null;
        }
        sampledVoice = currentVoice * voiceLevel * 2.1;
        this.samplePosition += sampleStep;
        if (shouldLoop && this.samplePosition >= loopEnd) {
          this.samplePosition = loopStart + loopFade + (this.samplePosition - loopEnd);
        } else if (this.samplePosition >= this.currentSample.length) {
          if (this.sampleIsLong) this.samplePosition = loopStart + loopFade + (this.samplePosition - this.currentSample.length);
          else sampledVoice = 0;
        }
      }
      for (let channel = 0; channel < channels; channel += 1) {
        if (sampledVoice !== null) {
          const drive = 1 + crush * 2;
          let generated = Math.tanh((sampledVoice + bubble * this.gate) * drive) / Math.tanh(drive);
          generated = Math.round(generated * quantizer) / quantizer;
          const underwaterCutoff = 0.42 - bubbles * 0.12;
          this.outputStates[channel] = (this.outputStates[channel] || 0) + (generated - (this.outputStates[channel] || 0)) * underwaterCutoff;
          output[channel][i] = this.applyPostFilter(Math.tanh(this.outputStates[channel] * 0.96) * 0.9, channel);
          continue;
        }
        const breath = (this.breathStates[channel] || 0) + (noise - (this.breathStates[channel] || 0)) * 0.16;
        this.breathStates[channel] = breath;
        const highNoise = noise - breath;
        const fricative = (this.fricativeStates[channel] || 0) + (highNoise - (this.fricativeStates[channel] || 0)) * 0.075;
        this.fricativeStates[channel] = fricative;
        let consonant = 0;
        if (this.consonant === 1) consonant = (breath * 0.12 + glottal * 0.62) * consonantWindow;
        if (this.consonant === 2) consonant = (breath * 0.06 + glottal * 0.72) * consonantWindow;
        if (this.consonant === 3) consonant = glottal * Math.sin(consonantProgress * Math.PI * 3) * consonantWindow * 0.62;
        if (this.consonant === 4) consonant = breath * consonantWindow * 0.72;
        if (this.consonant === 5) consonant = fricative * consonantWindow * 0.62;
        if (this.consonant === 6) consonant = fricative * (burstWindow * 1.05 + consonantWindow * 0.28) + glottal * burstWindow * 0.18;
        if (this.consonant === 7) consonant = (fricative * 0.48 + glottal * 0.48) * burstWindow + glottal * consonantWindow * 0.12;
        if (this.consonant === 8) consonant = (fricative * 0.75 + glottal * 0.2) * burstWindow;
        if (this.consonant === 9) consonant = (breath * 0.72 + glottal * 0.3) * burstWindow;
        if (this.consonant === 10) consonant = glottal * consonantWindow * 0.34;
        const vowelOpenProgress = Math.max(0, Math.min(1, (consonantProgress - 0.7) / 0.26));
        const vowelOnset = this.consonant === 0 ? 1
          : this.consonant === 10 ? consonantProgress
            : vowelOpenProgress * vowelOpenProgress * (3 - 2 * vowelOpenProgress);
        const vowel1 = this.bandpass(channel, 0, glottal) * 2.4;
        const vowel2 = this.bandpass(channel, 1, glottal) * 1.85;
        const inventedVoice = (vowel1 + vowel2 + glottal * (0.16 - obscurity * 0.1)) * voiceLevel * vowelOnset * 0.82;
        const codaWindow = progress > 0.68 ? Math.sin(Math.PI * (progress - 0.68) / 0.32) : 0;
        let codaVoice = 0;
        if (this.coda === 1) codaVoice = glottal * codaWindow * 0.3;
        if (this.coda === 2) codaVoice = (glottal + breath * 0.12) * codaWindow * 0.38;
        if (this.coda === 3) codaVoice = glottal * Math.sin(progress * Math.PI * 5) * codaWindow * 0.28;
        if (this.coda === 4) codaVoice = fricative * codaWindow * 0.24;
        if (this.coda === 5) codaVoice = (fricative * 0.16 + glottal * 0.12) * codaWindow;
        if (this.coda === 6) codaVoice = breath * codaWindow * 0.3;
        if (this.coda === 7) codaVoice = (glottal * 0.34 + breath * 0.08) * codaWindow;
        const closureProgress = Math.max(0, Math.min(1, (progress - 0.72) / 0.2));
        const smoothClosure = closureProgress * closureProgress * (3 - 2 * closureProgress);
        const codaClosure = this.coda >= 4 && this.coda <= 6 ? 1 - smoothClosure * 0.55 : 1;
        const articulationLevel = Math.min(0.86, Math.sqrt(this.envelope) * 3.4) * this.gate;
        const onsetVoice = consonant * articulationLevel * (0.92 + invention * 0.48);
        const syntheticConsonant = onsetVoice + codaVoice * voiceLevel * invention;
        const drive = 1 + crush * 3;
        let generated = Math.tanh((inventedVoice * codaClosure + syntheticConsonant + bubble * this.gate) * drive) / Math.tanh(drive);
        generated = Math.round(generated * quantizer) / quantizer;
        const underwaterCutoff = 0.34 - bubbles * 0.2;
        this.outputStates[channel] = (this.outputStates[channel] || 0) + (generated - (this.outputStates[channel] || 0)) * underwaterCutoff;
        this.muffleStates[channel] = (this.muffleStates[channel] || 0) + (this.outputStates[channel] - (this.muffleStates[channel] || 0)) * underwaterCutoff;
        output[channel][i] = this.applyPostFilter(Math.tanh(this.muffleStates[channel] * 1.2 + onsetVoice * 0.95) * 0.88, channel);
      }
    }
    return true;
  }
}

registerProcessor('inkling-voice-processor', InklingVoiceProcessor);
