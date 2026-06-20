import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Script} from '../../core/Script';
import {WorldOptions} from '../WorldOptions';
import {SegmentationMask} from './SegmentationMask';
import {
  BaseSegmenterBackend,
  SegmenterBackendContext,
} from './SegmenterBackend';
import {MediaPipeSegmenterBackend} from './backends/MediaPipeSegmenterBackend';

/**
 * A Script that runs semantic segmentation on the device camera feed and
 * returns a per-pixel category mask ({@link SegmentationMask}).
 *
 * Mirrors `HumanRecognizer` / `ObjectDetector`, but without any depth or
 * world-space step, segmentation is a pure 2D camera-to-mask operation, so it
 * does not depend on the depth mesh or camera intrinsics.
 */
export class Segmenter extends Script {
  static dependencies = {
    options: WorldOptions,
    deviceCamera: XRDeviceCamera,
  };

  private _backends = new Map<string, Promise<BaseSegmenterBackend>>();

  private options!: WorldOptions;
  private deviceCamera!: XRDeviceCamera;

  init({
    options,
    deviceCamera,
  }: {
    options: WorldOptions;
    deviceCamera: XRDeviceCamera;
  }) {
    this.options = options;
    this.deviceCamera = deviceCamera;
  }

  /**
   * Runs one segmentation pass over the current camera frame.
   * @returns The mask, or `null` if the backend or camera frame is not ready.
   */
  async runSegmentation(): Promise<SegmentationMask | null> {
    const activeBackend = this.options.segmentation.backendConfig.activeBackend;
    const backendPromise = this.getOrCreateBackend(activeBackend);

    let backend: BaseSegmenterBackend;
    try {
      backend = await backendPromise;
    } catch (error: unknown) {
      console.warn(
        `Failed to load or initialize Segmenter backend '${activeBackend}':`,
        error
      );
      return null;
    }

    return backend.run();
  }

  private getBackendContext(): SegmenterBackendContext {
    return {
      options: this.options,
      deviceCamera: this.deviceCamera,
    };
  }

  private getOrCreateBackend(
    activeBackend: string
  ): Promise<BaseSegmenterBackend> {
    let backendPromise = this._backends.get(activeBackend);

    if (!backendPromise) {
      const context = this.getBackendContext();
      backendPromise = (async () => {
        switch (activeBackend) {
          case 'mediapipe':
            return new MediaPipeSegmenterBackend(context);
          default:
            throw new Error(
              `Segmenter backend '${activeBackend}' is not supported.`
            );
        }
      })();
      this._backends.set(activeBackend, backendPromise);
    }
    return backendPromise;
  }
}
