import * as THREE from 'three';
import {Script} from 'xrblocks';

import {computeAudioFeatures} from './computeAudioFeatures';
import {FormantVisemeMapper} from './FormantVisemeMapper';
import {MfccExtractor} from './MfccExtractor';
import {StylizedMouth} from './StylizedMouth';

export interface LipsyncMouthOptions {
  /**
   * Reuse an existing `AudioContext` instead of creating a new one.
   * Browsers cap the number of contexts per page (typically 6-8), so when
   * driving multiple peer streams (one mouth per peer) pass the shared
   * context from `xb.core.sound.listener.context` or
   * `THREE.AudioContext.getContext()`. When provided, this class will not
   * close the context on `dispose()`.
   */
  audioContext?: AudioContext;
  /** AnalyserNode FFT size; must be a power of two. Defaults to 1024. */
  fftSize?: number;
  /**
   * Below this RMS the viseme target is forced to zero so background noise
   * doesn't drive the mouth. Default 0.01.
   */
  silenceThreshold?: number;
  /**
   * Approximate radius (metres) of the host head this mouth will sit on.
   * Used to scale and position the stylised mouth mesh. Defaults to 0.1
   * to match netblocks `RemoteUserAvatar`'s head sphere; pass 0.18 (for
   * example) if attaching to a bigger custom head.
   */
  headRadius?: number;
}

/**
 * `LipsyncMouth` drives a stylised mouth attached to any `Object3D` from a
 * `MediaStream`. Designed to plug into any avatar that has a head pivot,
 * including netblocks `RemoteUserAvatar.headPivot` for per-peer mouth
 * animation.
 *
 * Extends `xb.Script` so the xrblocks scripts manager calls `init()` once
 * the instance is part of the active scene and `update(time)` every
 * frame. `dispose()` is called automatically when removed from the scene
 * graph; it disconnects audio nodes and releases the mouth geometry. It
 * deliberately never stops the input `MediaStream` tracks (the caller
 * owns those) and never closes a caller-supplied `AudioContext`.
 *
 * @example
 *   const mouth = new LipsyncMouth(myMicStream);
 *   headPivot.add(mouth);
 *   // ... when done:
 *   headPivot.remove(mouth);  // triggers dispose()
 */
export class LipsyncMouth extends Script {
  /** Latest viseme weights applied to the mouth (read-only convenience). */
  readonly mouth: StylizedMouth;

  private readonly stream: MediaStream;
  private readonly fftSize: number;
  private readonly silenceThreshold: number;
  private readonly externalContext: boolean;

  private ctx?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  // TS lib.dom expects Uint8Array<ArrayBuffer> on the analyser methods,
  // not the looser Uint8Array<ArrayBufferLike> that the default
  // `new Uint8Array(n)` produces. Pin the buffer type so the calls below
  // type-check under strict rollup-typescript.
  private freqData?: Uint8Array<ArrayBuffer>;
  private freqDataFloat?: Float32Array<ArrayBuffer>;
  private timeData?: Uint8Array<ArrayBuffer>;
  private mfccExtractor?: MfccExtractor;
  private primer?: HTMLAudioElement;

  private readonly mapper = new FormantVisemeMapper();
  private lastTime = 0;
  private debugTick = 0;

  constructor(stream: MediaStream, opts: LipsyncMouthOptions = {}) {
    super();
    this.stream = stream;
    this.fftSize = opts.fftSize ?? 1024;
    this.silenceThreshold = opts.silenceThreshold ?? 0.01;
    this.externalContext = !!opts.audioContext;
    this.ctx = opts.audioContext;
    this.mouth = new StylizedMouth({headRadius: opts.headRadius});
    this.add(this.mouth);
  }

  override async init(): Promise<void> {
    if (!this.ctx) {
      // Fall back to a fresh context; prefer this only for single-mouth
      // demos. Multi-peer callers should pass a shared context.
      this.ctx = new AudioContext();
    }
    // Browsers create the shared AudioContext suspended until a user
    // gesture. resume() is a no-op when already running.
    void this.ctx.resume?.().catch(() => undefined);

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0.4;
    this.source.connect(this.analyser);

    this.freqData = new Uint8Array(
      new ArrayBuffer(this.analyser.frequencyBinCount)
    );
    this.freqDataFloat = new Float32Array(
      new ArrayBuffer(this.analyser.frequencyBinCount * 4)
    );
    this.timeData = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.mfccExtractor = new MfccExtractor({
      sampleRate: this.ctx.sampleRate,
      fftSize: this.fftSize,
    });

    // Chromium WebRTC quirk: a MediaStreamAudioSourceNode built from a
    // remote stream stays silent unless the stream is also being pumped
    // by an HTMLMediaElement. Same fix SpatialVoice uses. Harmless for
    // local mic streams.
    if (typeof document !== 'undefined') {
      const primer = document.createElement('audio');
      primer.muted = true;
      primer.autoplay = true;
      primer.srcObject = this.stream;
      // play() returns a Promise on modern browsers, undefined on older
      // ones (and in jsdom). Optional-chain both.
      const playP = primer.play();
      playP?.catch?.(() => undefined);
      this.primer = primer;
    }

    // Lightweight debug: log once that we wired up. Helpful when chasing
    // why a remote peer's mouth isn't moving.
    const tracks = this.stream.getTracks?.() ?? [];
    const audioTracks = this.stream.getAudioTracks?.() ?? [];
    console.log(
      '[lipsync] init',
      'ctxState=', this.ctx.state,
      'sampleRate=', this.ctx.sampleRate,
      'tracks=', tracks.length,
      'audioTracks=', audioTracks.length
    );
  }

  override update(time?: number): void {
    if (
      !this.analyser ||
      !this.freqData ||
      !this.freqDataFloat ||
      !this.timeData
    )
      return;
    if (!this.mfccExtractor) return;
    const now = typeof time === 'number' ? time : performance.now() / 1000;
    const dt = this.lastTime ? Math.max(0.001, now - this.lastTime) : 0.016;
    this.lastTime = now;

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getFloatFrequencyData(this.freqDataFloat);
    this.analyser.getByteTimeDomainData(this.timeData);
    const mfcc = this.mfccExtractor.extract(this.freqDataFloat);
    const features = computeAudioFeatures(
      {
        freqData: this.freqData,
        freqDataFloat: this.freqDataFloat,
        timeData: this.timeData,
        mfcc,
      },
      this.ctx!.sampleRate
    );

    // Periodic debug: rms one in every ~3 seconds (assuming 60 Hz).
    this.debugTick = (this.debugTick + 1) % 180;
    if (this.debugTick === 0) {
      console.log(
        '[lipsync] update rms=', features.rms.toFixed(4),
        'voiced=', features.voiced,
        'f1=', Math.round(features.f1Hz), 'f2=', Math.round(features.f2Hz)
      );
    }

    if (features.rms < this.silenceThreshold) {
      // Force convergence toward zero on true silence.
      this.mapper.reset();
      this.mouth.setVisemes(this.mouth.visemes);
      return;
    }

    const visemes = this.mapper.update(features, dt);
    this.mouth.setVisemes(visemes);
  }

  override dispose(): void {
    try {
      this.source?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.analyser?.disconnect();
    } catch {
      // ignore
    }
    if (this.primer) {
      try {
        this.primer.pause();
      } catch {
        // ignore
      }
      this.primer.srcObject = null;
      this.primer = undefined;
    }
    if (this.ctx && !this.externalContext) {
      // Only close contexts we created.
      void this.ctx.close?.().catch(() => undefined);
    }
    this.mouth.dispose();
    this.remove(this.mouth);
    this.source = undefined;
    this.analyser = undefined;
    this.freqData = undefined;
    this.freqDataFloat = undefined;
    this.timeData = undefined;
    this.mfccExtractor = undefined;
    this.ctx = undefined;
  }
}

// Re-export for convenience so consumers can subscribe to viseme weights
// without importing from the reducer file directly.
export type {VisemeWeights} from './BlendshapeReducer';

// Silence unused-name warnings while keeping THREE imported for the
// extends signature visible to tooling.
void THREE;
