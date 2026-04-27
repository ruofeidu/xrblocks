import {FilesetResolver, AudioClassifier} from '@mediapipe/tasks-audio';
import {
  DetectorBackendContext,
  BaseDetectorBackend,
} from '../SoundDetectorBackend';
import {AudioClassifierResult} from '../DetectedSounds';

let sharedAudioClassifier: any = null;
let initializingPromise: Promise<any> | null = null;

async function getAudioClassifier(config: any) {
  if (sharedAudioClassifier) return sharedAudioClassifier;
  if (initializingPromise) return initializingPromise;

  initializingPromise = (async () => {
    const audioTasks = await FilesetResolver.forAudioTasks(config.wasmFilesUrl);
    sharedAudioClassifier = await AudioClassifier.createFromOptions(
      audioTasks,
      {
        baseOptions: {modelAssetPath: config.modelAssetPath},
      }
    );
    return sharedAudioClassifier;
  })();

  return initializingPromise;
}

export class MediaPipeDetectorBackend extends BaseDetectorBackend {
  private chunkSamples = 16000;
  private accumulatedAudio: number[] = [];

  constructor(context: DetectorBackendContext) {
    super(context);
    const mediapipeConfig = this.context.options.sounds.backendConfig.mediapipe;
    this.chunkSamples = mediapipeConfig.chunkSamples;

    // Trigger initialization but don't await it here
    getAudioClassifier(mediapipeConfig).catch((error) => {
      console.error(
        'MediaPipeDetectorBackend: Failed to load MediaPipe audio module:',
        error
      );
    });
  }

  override classify(
    audioData: Float32Array,
    sampleRate: number
  ): AudioClassifierResult | null {
    if (!sharedAudioClassifier) return null;

    for (let i = 0; i < audioData.length; i++) {
      this.accumulatedAudio.push(audioData[i]);
    }

    if (this.accumulatedAudio.length >= this.chunkSamples) {
      const chunk = new Float32Array(
        this.accumulatedAudio.slice(0, this.chunkSamples)
      );
      this.accumulatedAudio = this.accumulatedAudio.slice(this.chunkSamples); // simple non-overlapping window

      console.log('Sample Rate: ', sampleRate);
      const mediaPipeResult = sharedAudioClassifier.classify(chunk, sampleRate);
      const debugData = this.populateDebugData(chunk, sampleRate);

      return {
        items: mediaPipeResult,
        debug: debugData,
      };
    }
    return null;
  }
}
