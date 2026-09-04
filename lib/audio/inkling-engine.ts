/* oxlint-disable typescript/no-deprecated -- requested ScriptProcessor fallback and cross-browser WAV PCM tap */

export type VoiceSettings = {
  voiceStyle: 'sharp' | 'balanced' | 'soft';
  excited: boolean;
  characterPitch: number;
  obscurity: number;
  chop: number;
  jitter: number;
  crush: number;
  bubbles: number;
  invention: number;
  wet: number;
  volume: number;
  monitorOriginal: boolean;
  voiceIsolation: boolean;
};

const defaultSettings: VoiceSettings = {
  voiceStyle: 'balanced',
  excited: false,
  characterPitch: 15,
  obscurity: 88,
  chop: 92,
  jitter: 0,
  crush: 0,
  bubbles: 48,
  invention: 78,
  wet: 100,
  volume: 72,
  monitorOriginal: false,
  voiceIsolation: true,
};

export class InklingVoiceEngine {
  settings = { ...defaultSettings };
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private noiseSuppressor?: AudioWorkletNode & { destroy(): void };
  private noiseSuppressionMode = 'RNNoise 음성 정리';
  private highpass?: BiquadFilterNode;
  private lowpass?: BiquadFilterNode;
  private compressor?: DynamicsCompressorNode;
  private effect?: AudioNode;
  private mouthFilter?: BiquadFilterNode;
  private mouthResonance?: BiquadFilterNode;
  private dry?: GainNode;
  private wet?: GainNode;
  private rawMonitor?: GainNode;
  private master?: GainNode;
  private output?: MediaStreamAudioDestinationNode;
  private analyser?: AnalyserNode;
  private recorderTap?: ScriptProcessorNode;
  private silent?: GainNode;
  private recording = false;
  private recorded: Float32Array[] = [];

  get audioContext() {
    return this.context;
  }

  get analyserNode() {
    return this.analyser;
  }

  get isolationMode() {
    return this.noiseSuppressionMode;
  }

  async start() {
    if (this.context) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });

    const context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    await context.resume();

    this.context = context;
    this.stream = stream;
    this.source = context.createMediaStreamSource(stream);
    this.highpass = context.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.frequency.value = 105;
    this.highpass.Q.value = 0.72;
    this.lowpass = context.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 7200;
    this.lowpass.Q.value = 0.6;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -34;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.16;
    this.dry = context.createGain();
    this.wet = context.createGain();
    this.rawMonitor = context.createGain();
    this.master = context.createGain();
    this.output = context.createMediaStreamDestination();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.effect = await this.createEffect(context);
    this.mouthFilter = context.createBiquadFilter();
    this.mouthFilter.type = 'lowpass';
    this.mouthFilter.frequency.value = 3200;
    this.mouthFilter.Q.value = 0.78;
    this.mouthResonance = context.createBiquadFilter();
    this.mouthResonance.type = 'peaking';
    this.mouthResonance.frequency.value = 680;
    this.mouthResonance.Q.value = 0.72;
    this.mouthResonance.gain.value = 2.8;

    const microphoneInput = await this.createNoiseSuppressor(context, this.source, stream);
    let cleanVoice: AudioNode = microphoneInput.connect(this.highpass);
    cleanVoice = cleanVoice.connect(this.lowpass);
    cleanVoice.connect(this.compressor).connect(this.dry).connect(this.master);
    cleanVoice.connect(this.effect).connect(this.mouthFilter).connect(this.mouthResonance).connect(this.wet).connect(this.master);
    microphoneInput.connect(this.rawMonitor).connect(context.destination);
    this.master.connect(this.analyser);
    // Calls use the processed MediaStream directly; do not echo the caller's own voice.
    this.master.connect(this.output);

    // A tiny PCM tap gives Chrome and Safari the same WAV recording path.
    this.recorderTap = context.createScriptProcessor(2048, 1, 1);
    this.silent = context.createGain();
    this.silent.gain.value = 0;
    this.master.connect(this.recorderTap).connect(this.silent).connect(context.destination);
    this.recorderTap.onaudioprocess = (event) => {
      event.outputBuffer.getChannelData(0).fill(0);
      if (this.recording) {
        this.recorded.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      }
    };

    this.update(this.settings);
  }

  private async createNoiseSuppressor(context: AudioContext, source: MediaStreamAudioSourceNode, stream: MediaStream) {
    try {
      const [{ RnnoiseWorkletNode, loadRnnoise }, workletPath, wasmPath, simdWasmPath] = await Promise.all([
        import('@sapphi-red/web-noise-suppressor'),
        import('@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'),
        import('@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'),
        import('@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'),
      ]);
      const wasmBinary = await loadRnnoise({
        url: wasmPath.default,
        simdUrl: simdWasmPath.default,
      });
      await context.audioWorklet.addModule(workletPath.default);
      this.noiseSuppressor = new RnnoiseWorkletNode(context, { wasmBinary, maxChannels: 1 });
      this.noiseSuppressionMode = 'RNNoise 음성 정리';
      source.connect(this.noiseSuppressor);
      return this.noiseSuppressor;
    } catch {
      this.noiseSuppressionMode = '브라우저 잡음 억제';
      await stream.getAudioTracks()[0]?.applyConstraints({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }).catch(() => undefined);
      return source;
    }
  }

  private async createEffect(context: AudioContext) {
    try {
      await context.audioWorklet.addModule('/inkling-processor.js');
      const node = new AudioWorkletNode(context, 'inkling-voice-processor');
      const [bankResponse, modelResponse] = await Promise.all([fetch('/espeak-bank.json'), fetch('/city-postfilter.json')]);
      if (!bankResponse.ok || !modelResponse.ok) throw new Error('voice assets unavailable');
      const bank = await bankResponse.json() as { sampleRate: number; items: Record<string, { pcm: string; pitch: number; loopStart: number; loopEnd: number }> };
      const model = await modelResponse.json() as Record<string, unknown>;
      const items = Object.entries(bank.items).map(([token, item]) => {
        const bytes = Uint8Array.from(atob(item.pcm), (character) => character.charCodeAt(0));
        return { token, samples: bytes.buffer, pitch: item.pitch, loopStart: item.loopStart, loopEnd: item.loopEnd };
      });
      node.port.postMessage({ type: 'sample-bank', sampleRate: bank.sampleRate, items }, items.map(({ samples }) => samples));
      node.port.postMessage({ type: 'post-filter', value: model });
      return node;
    } catch {
      return this.createFallbackEffect(context);
    }
  }

  private createFallbackEffect(context: AudioContext) {
    const node = context.createScriptProcessor(1024, 1, 1);
    const ring = new Float32Array(32768);
    let write = 0;
    let read = 0;
    let hold = 0;
    let held = 0;

    node.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const output = event.outputBuffer.getChannelData(0);
      const ratio = 2 ** (this.settings.characterPitch / 12);
      const crush = this.settings.crush / 100;
      const bubbles = this.settings.bubbles / 100;
      const bits = 16 - crush * 11;
      const steps = 2 ** bits;
      const holdFor = 1 + Math.floor(crush * 7);

      for (let i = 0; i < input.length; i += 1) {
        const gated = this.settings.voiceIsolation && Math.abs(input[i]) < 0.007 ? input[i] * 0.08 : input[i];
        ring[write] = gated;
        write = (write + 1) % ring.length;
        if (read === 0) read = (write - 2400 + ring.length) % ring.length;
        const a = Math.floor(read);
        const b = (a + 1) % ring.length;
        const shifted = ring[a] + (ring[b] - ring[a]) * (read - a);
        read = (read + ratio + (Math.random() - 0.5) * this.settings.jitter * 0.0008) % ring.length;
        if ((write - read + ring.length) % ring.length < 600) {
          read = (write - 2400 - Math.random() * this.settings.obscurity * 18 + ring.length) % ring.length;
        }
        if (hold-- <= 0) {
          held = Math.round(shifted * steps) / steps;
          hold = holdFor;
        }
        const drive = 1 + crush * 8;
        const wobble = 0.94 + Math.sin((i + write) * 0.009) * bubbles * 0.06;
        output[i] = Math.tanh(held * drive) / Math.tanh(drive) * wobble;
      }
    };
    return node;
  }

  update(next: Partial<VoiceSettings>) {
    Object.assign(this.settings, next);
    const context = this.context;
    if (!context) return;
    const styles = {
      sharp: { cutoff: 5200, resonance: 2200, q: 0.9, gain: 3 },
      balanced: { cutoff: 3200, resonance: 680, q: 0.72, gain: 2.8 },
      soft: { cutoff: 2300, resonance: 560, q: 0.65, gain: 4 },
    } as const;
    const style = styles[this.settings.voiceStyle];
    this.mouthFilter?.frequency.setTargetAtTime(style.cutoff, context.currentTime, 0.03);
    this.mouthResonance?.frequency.setTargetAtTime(style.resonance, context.currentTime, 0.03);
    this.mouthResonance?.Q.setTargetAtTime(style.q, context.currentTime, 0.03);
    this.mouthResonance?.gain.setTargetAtTime(style.gain, context.currentTime, 0.03);
    const wet = this.settings.wet / 100;
    const volume = this.settings.volume / 100;
    this.wet?.gain.setTargetAtTime(Math.sin(wet * Math.PI * 0.5) * volume, context.currentTime, 0.015);
    this.dry?.gain.setTargetAtTime(Math.cos(wet * Math.PI * 0.5) * volume, context.currentTime, 0.015);
    this.rawMonitor?.gain.setTargetAtTime(this.settings.monitorOriginal ? volume * 0.55 : 0, context.currentTime, 0.015);
    if (this.effect instanceof AudioWorkletNode) {
      this.effect.port.postMessage({ type: 'settings', value: this.settings });
    }
  }

  startRecording() {
    if (!this.context) throw new Error('먼저 마이크를 시작해 주세요.');
    this.recorded = [];
    this.recording = true;
  }

  stopRecording() {
    this.recording = false;
    const length = this.recorded.reduce((sum, chunk) => sum + chunk.length, 0);
    if (!this.context || length === 0) return undefined;
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.recorded) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    this.recorded = [];
    return encodeWav(samples, this.context.sampleRate);
  }

  /** Processed MediaStreamTrack entry point for the future RTCPeerConnection. */
  getOutputStream() {
    return this.output?.stream;
  }

  async stop() {
    this.recording = false;
    this.noiseSuppressor?.destroy();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close();
    this.context = undefined;
    this.stream = undefined;
    this.source = undefined;
    this.noiseSuppressor = undefined;
    this.noiseSuppressionMode = 'RNNoise 음성 정리';
    this.highpass = undefined;
    this.lowpass = undefined;
    this.compressor = undefined;
    this.effect = undefined;
    this.mouthFilter = undefined;
    this.mouthResonance = undefined;
    this.analyser = undefined;
    this.dry = undefined;
    this.wet = undefined;
    this.rawMonitor = undefined;
    this.master = undefined;
    this.output = undefined;
    this.recorderTap = undefined;
    this.silent = undefined;
  }
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
