import {WorldOptions} from '../WorldOptions';
import {AudioClassifierResult} from './DetectedSounds';

export interface DetectorBackendContext {
  options: WorldOptions;
}

export abstract class BaseDetectorBackend {
  protected context: DetectorBackendContext;

  constructor(context: DetectorBackendContext) {
    this.context = context;
  }

  abstract classify(
    audioData: Float32Array,
    sampleRate: number
  ): AudioClassifierResult | null;

  normalizeAudio(int16Data: Int16Array): Float32Array {
    const normalizedAudio = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      normalizedAudio[i] = int16Data[i] / 32768.0;
    }
    return normalizedAudio;
  }

  populateDebugData(
    normalizedAudio: Float32Array,
    sampleRate: number
  ): {rms: number; bufferSize: number; sampleRate: number} {
    let sumSquares = 0;
    for (let i = 0; i < normalizedAudio.length; i++) {
      sumSquares += normalizedAudio[i] * normalizedAudio[i];
    }
    const rms = Math.sqrt(sumSquares / normalizedAudio.length);

    return {
      rms: rms,
      bufferSize: normalizedAudio.length,
      sampleRate: sampleRate,
    };
  }
}
