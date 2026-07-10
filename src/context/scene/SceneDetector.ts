import * as THREE from 'three';

import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {ScreenshotSynthesizer} from '../../core/components/ScreenshotSynthesizer';
import {Script} from '../../core/Script';
import {ContextOptions} from '../ContextOptions';
import {
  buildSemanticTree,
  SemanticTreeInternal,
} from './semantic-tree/SemanticTreeBuilder';
import {SemanticIdRegistry} from '../shared/SemanticIdRegistry';
import {
  SemanticTree,
  SetOfMarkContext,
  VisibleObjectsContext,
} from '../shared/SemanticTypes';
import {createSetOfMarkContext} from './som/SetOfMarkBuilder';
import {createVisibleObjectsContext} from './visible-objects/VisibleObjectsBuilder';

type ContextSnapshot = {
  semanticInternal?: SemanticTreeInternal;
  visibleObjects?: VisibleObjectsContext;
  som?: SetOfMarkContext;
};

export class SceneDetector extends Script {
  static dependencies = {
    options: ContextOptions,
    scene: THREE.Scene,
    camera: THREE.Camera,
    screenshotSynthesizer: ScreenshotSynthesizer,
  };

  private options!: ContextOptions;
  private scene!: THREE.Scene;
  private camera!: THREE.Camera;
  private screenshotSynthesizer!: ScreenshotSynthesizer;
  private deviceCamera?: XRDeviceCamera;
  private registry = new SemanticIdRegistry();
  private snapshot: ContextSnapshot | null = null;
  private snapshotPromise: Promise<ContextSnapshot> | null = null;
  private activeClients = new Set<object>();
  private currentDetectionPromise: Promise<SemanticTree> | null = null;
  private currentVisibleObjectsPromise: Promise<VisibleObjectsContext> | null =
    null;
  private currentSetOfMarkPromise: Promise<SetOfMarkContext> | null = null;
  private lastContinuousDetectionStartedAtMs = -Infinity;

  /**
   * The latest semantic tree produced by scene context detection.
   */
  public tree: SemanticTree | null = null;

  /**
   * The latest semantic tree annotated with user-view visibility.
   */
  public visibleObjects: VisibleObjectsContext | null = null;

  /**
   * The latest Set-of-Mark context image and label mapping.
   */
  public setOfMark: SetOfMarkContext | null = null;

  init({
    options,
    scene,
    camera,
    screenshotSynthesizer,
    deviceCamera,
  }: {
    options: ContextOptions;
    scene: THREE.Scene;
    camera: THREE.Camera;
    screenshotSynthesizer: ScreenshotSynthesizer;
    deviceCamera?: XRDeviceCamera;
  }) {
    this.options = options;
    this.scene = scene;
    this.camera = camera;
    this.screenshotSynthesizer = screenshotSynthesizer;
    this.deviceCamera = deviceCamera ?? this.deviceCamera;
    this.snapshot = null;
  }

  setDeviceCamera(deviceCamera: XRDeviceCamera | undefined) {
    this.deviceCamera = deviceCamera;
  }

  start(client: object): void {
    if (!this.options.enabled || !this.options.scene.enabled) {
      console.warn(
        'Cannot start scene context detection: scene context is not enabled.'
      );
      return;
    }
    if (this.activeClients.has(client)) {
      return;
    }
    this.activeClients.add(client);
    if (this.activeClients.size === 1) {
      this.runContinuousDetection();
    }
  }

  stop(client: object): void {
    this.activeClients.delete(client);
  }

  override update() {
    if (!this.shouldRunContinuous()) {
      return;
    }
    this.runContinuousDetection();
  }

  shouldRunContinuous(now = performance.now()) {
    if (this.activeClients.size === 0 || this.currentDetectionPromise) {
      return;
    }

    const pollingIntervalMs = this.options.scene.pollingIntervalMs;
    if (
      pollingIntervalMs > 0 &&
      now - this.lastContinuousDetectionStartedAtMs < pollingIntervalMs
    ) {
      return;
    }

    return true;
  }

  runDetection(): Promise<SemanticTree> {
    if (this.currentDetectionPromise) {
      return this.currentDetectionPromise;
    }
    if (this.activeClients.size > 0) {
      this.runContinuousDetection();
      return this.currentDetectionPromise!;
    }
    this.beginSnapshot();
    this.currentDetectionPromise = this.detectSemanticTree().finally(() => {
      this.currentDetectionPromise = null;
    });
    return this.currentDetectionPromise;
  }

  runVisibleObjectsDetection(): Promise<VisibleObjectsContext> {
    if (this.currentVisibleObjectsPromise) {
      return this.currentVisibleObjectsPromise;
    }
    this.beginSnapshot();
    this.currentVisibleObjectsPromise = this.getVisibleObjectsContext()
      .then((result) => {
        this.visibleObjects = result;
        return result;
      })
      .finally(() => {
        this.currentVisibleObjectsPromise = null;
      });
    return this.currentVisibleObjectsPromise;
  }

  runSetOfMarkDetection(): Promise<SetOfMarkContext> {
    if (this.currentSetOfMarkPromise) {
      return this.currentSetOfMarkPromise;
    }
    this.beginSnapshot({preserveVisibleObjects: true});
    this.currentSetOfMarkPromise = this.getSetOfMarkContext().finally(() => {
      this.currentSetOfMarkPromise = null;
    });
    return this.currentSetOfMarkPromise;
  }

  private runContinuousDetection(): Promise<SemanticTree> | null {
    if (this.currentDetectionPromise) {
      return this.currentDetectionPromise;
    }

    this.lastContinuousDetectionStartedAtMs = performance.now();
    this.beginSnapshot();
    this.currentDetectionPromise = this.detectContinuousContext()
      .then((result) => {
        this.tree = result;
        return result;
      })
      .finally(() => {
        this.currentDetectionPromise = null;
      });
    return this.currentDetectionPromise;
  }

  private async detectContinuousContext(): Promise<SemanticTree> {
    const tree = await this.detectSemanticTree();

    if (this.options.scene.visibleObjects.enabled) {
      this.visibleObjects = await this.getVisibleObjectsContext();
    }

    if (this.options.scene.som.enabled) {
      this.setOfMark = await this.getSetOfMarkContext();
    }

    return tree;
  }

  private async detectSemanticTree(): Promise<SemanticTree> {
    const tree = await this.getSemanticTree();
    this.tree = tree;
    return tree;
  }

  private beginSnapshot(options: {preserveVisibleObjects?: boolean} = {}) {
    if (options.preserveVisibleObjects && this.snapshot?.visibleObjects) {
      this.snapshot.som = undefined;
      return;
    }
    this.snapshot = {};
  }

  private async getSemanticTree(): Promise<SemanticTree> {
    const snapshot = await this.getSnapshot();
    return snapshot.semanticInternal!.tree;
  }

  private async getVisibleObjectsContext(
    camera = this.camera
  ): Promise<VisibleObjectsContext> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.visibleObjects) {
      snapshot.visibleObjects = createVisibleObjectsContext({
        scene: this.scene,
        camera,
        semanticTree: snapshot.semanticInternal!,
      });
    }
    this.visibleObjects = snapshot.visibleObjects;
    return snapshot.visibleObjects;
  }

  private async getSetOfMarkContext(): Promise<SetOfMarkContext> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.som) {
      const camera = this.camera;
      camera.updateMatrixWorld(true);
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      const projectionMatrix = camera.projectionMatrix.clone();
      const matrixWorldInverse = camera.matrixWorldInverse.clone();
      const visibleObjects = await this.getVisibleObjectsContext(camera);
      const overlayOnCamera = this.deviceCamera?.loaded === true;
      const screenshot =
        await this.screenshotSynthesizer.getScreenshot(overlayOnCamera);
      snapshot.som = await createSetOfMarkContext({
        tree: visibleObjects,
        image: screenshot,
        nodeObjects: snapshot.semanticInternal!.nodeObjects,
        registry: this.registry,
        projectionMatrix,
        matrixWorldInverse,
      });
    }
    this.setOfMark = snapshot.som;
    return snapshot.som;
  }

  private async getSnapshot(): Promise<ContextSnapshot> {
    if (this.snapshot?.semanticInternal) {
      return this.snapshot;
    }
    if (this.snapshotPromise) {
      return this.snapshotPromise;
    }
    this.snapshotPromise = Promise.resolve()
      .then(() => {
        const snapshot = this.snapshot ?? {};
        snapshot.semanticInternal = buildSemanticTree({
          scene: this.scene,
          registry: this.registry,
        });
        this.snapshot = snapshot;
        return snapshot;
      })
      .finally(() => {
        this.snapshotPromise = null;
      });
    return this.snapshotPromise;
  }
}
