import type * as GoogleGenAITypes from '@google/genai';
import * as THREE from 'three';

import {AI} from '../ai/AI';
import {XRDeviceCamera} from '../camera/XRDeviceCamera';
import {Registry} from '../core/components/Registry';
import {Script} from '../core/Script';
import {User} from '../core/User';
import {CoreSound} from '../sound/CoreSound';
import type {Tool} from '../agent/Tool';
import {parseBase64DataURL} from '../utils/utils';
import {WaitFrame} from '../core/components/WaitFrame';
import {placeObjectAtIntersectionFacingTarget} from '../utils/ObjectPlacement';

import {ObjectDetector} from './objects/ObjectDetector';
import {PlaneDetector} from './planes/PlaneDetector';
import {WorldOptions} from './WorldOptions';
import {MeshDetector} from './mesh/MeshDetector';
import {SoundDetector} from './sounds/SoundDetector';
import {placeOnHorizontalSurface} from './HorizontalPlacement';

// Import other modules as they are implemented in future.
// import { LightEstimation } from '/lighting/LightEstimation.js';
import {HumanRecognizer} from './humans/HumanRecognizer';
import {FaceRecognizer} from './faces/FaceRecognizer';

/**
 * Manages all interactions with the real-world environment perceived by the XR
 * device. This class abstracts the complexity of various perception APIs
 * (Depth, Planes, Meshes, etc.) and provides a simple, event-driven interface
 * for developers to use `this.world.depth.mesh`, `this.world.planes`.
 */
export class World extends Script {
  static dependencies = {
    options: WorldOptions,
    camera: THREE.Camera,
    registry: Registry,
    waitFrame: WaitFrame,
    timer: THREE.Timer,
  };

  editorIcon = 'sensors';

  /**
   * Configuration options for all world-sensing features.
   */
  options!: WorldOptions;

  /**
   * The depth module instance. Null if not enabled.
   */
  // depth = null;

  /**
   * The light estimation module instance. Null if not enabled.
   */
  // lighting = null;

  /**
   * The plane detection module instance. Null if not enabled.
   * Not recommended for anchoring.
   */
  planes?: PlaneDetector;

  /**
   * The object recognition module instance. Null if not enabled.
   */
  objects?: ObjectDetector;

  /**
   * The mesh detection module instance. Null if not enabled.
   */
  meshes?: MeshDetector;

  /**
   * The sound detection module instance. Null if not enabled.
   */
  sounds?: SoundDetector;

  /**
   * The human recognition/pose module instance. Null if not enabled.
   */
  humans?: HumanRecognizer;

  /**
   * The face landmark detection module instance. Null if not enabled.
   */
  faces?: FaceRecognizer;

  /**
   * A Three.js Raycaster for performing intersection tests.
   */
  private raycaster = new THREE.Raycaster();

  private camera!: THREE.Camera;
  private waitFrame!: WaitFrame;
  private timer!: THREE.Timer;

  private registry!: Registry;

  // Whether we need to initiate a room capture.
  private needsRoomCapture = false;

  private resolveInitialized!: () => void;
  readonly initializedPromise = new Promise<void>((resolve) => {
    this.resolveInitialized = resolve;
  });

  /**
   * Initializes the world-sensing modules based on the provided configuration.
   * This method is called automatically by the XRCore.
   */
  override async init({
    options,
    camera,
    registry,
    waitFrame,
    timer,
  }: {
    options: WorldOptions;
    camera: THREE.Camera;
    registry: Registry;
    waitFrame: WaitFrame;
    timer: THREE.Timer;
  }) {
    this.options = options;
    this.camera = camera;
    this.registry = registry;
    this.waitFrame = waitFrame;
    this.timer = timer;

    if (!this.options || !this.options.enabled) {
      this.resolveInitialized();
      return;
    }

    this.needsRoomCapture = this.options.initiateRoomCapture;

    // Conditionally initialize each perception module based on options.
    if (this.options.planes.enabled) {
      this.planes = new PlaneDetector();
      this.add(this.planes);
    }

    if (this.options.objects.enabled) {
      this.objects = new ObjectDetector();
      this.add(this.objects);
    }

    if (this.options.meshes.enabled) {
      this.meshes = new MeshDetector();
      this.add(this.meshes);
    }

    if (this.options.sounds.enabled) {
      this.sounds = new SoundDetector();
      this.add(this.sounds);
    }

    if (this.options.humans.enabled) {
      this.humans = new HumanRecognizer();
      this.add(this.humans);
    }

    if (this.options.faces.enabled) {
      this.faces = new FaceRecognizer();
      this.add(this.faces);
    }

    // TODO: Initialize other modules as they are available & implemented.
    /*

    if (this.options.lighting.enabled) {
      this.lighting = new LightEstimation();
    }
    */
    this.resolveInitialized();
  }

  /**
   * Places an object at the reticle.
   */
  anchorObjectAtReticle(_object: THREE.Object3D, _reticle: THREE.Object3D) {
    throw new Error('Method not implemented');
  }

  /**
   * Updates all active world-sensing modules with the latest XRFrame data.
   * This method is called automatically by the XRCore on each frame.
   * @param _timestamp - The timestamp for the current frame.
   * @param frame - The current XRFrame, containing environmental
   * data.
   * @override
   */
  update(_timestamp: number, frame?: XRFrame) {
    if (!this.options?.enabled || !frame) {
      return;
    }

    if (this.needsRoomCapture && frame.session.initiateRoomCapture) {
      this.needsRoomCapture = false;
      frame.session.initiateRoomCapture();
    }

    this.meshes?.updateMeshes(_timestamp, frame);
  }

  /**
   * Performs a raycast from a controller against detected real-world surfaces
   * (currently planes) and places a 3D object at the intersection point,
   * oriented to face the user.
   *
   * We recommend using /templates/3_depth/ to anchor objects based on
   * depth mesh for mixed reality experience for accuracy. This function is
   * design for demonstration purposes.
   *
   * @param objectToPlace - The object to position in the
   * world.
   * @param controller - The controller to use for raycasting.
   * @returns True if the object was successfully placed, false
   * otherwise.
   */
  placeOnSurface(objectToPlace: THREE.Object3D, controller: THREE.Object3D) {
    if (!this.planes) {
      console.warn('Cannot placeOnSurface: PlaneDetector is not enabled.');
      return false;
    }

    const allPlanes = this.planes.get();
    if (allPlanes.length === 0) {
      return false; // No surfaces to cast against.
    }

    this.raycaster.setFromXRController(controller as THREE.XRTargetRaySpace);

    const intersections = this.raycaster.intersectObjects(allPlanes);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      placeObjectAtIntersectionFacingTarget(
        objectToPlace,
        intersection,
        this.camera
      );
      return true;
    }

    return false;
  }

  /**
   * Places an object onto a suitable horizontal plane in the environment.
   * It prioritizes planes in front of the user, prefers tables/elevated surfaces over floors,
   * and ensures the object does not intersect other existing objects or other planes in the scene.
   * If placement fails in the current frame, it continues retrying frame-by-frame until the timeout is reached.
   *
   * @param objectToPlace - The Three.js Object3D to place.
   * @param timeout - Optional timeout duration as a Temporal.Duration or Temporal.DurationLike object (defaults to 500ms).
   * @param gridSteps - Optional number of steps along each axis for grid sampling candidate positions (defaults to 5).
   * @returns A promise resolving to true if successfully placed, false otherwise.
   */
  async placeOnHorizontalSurface(
    objectToPlace: THREE.Object3D,
    timeout: Temporal.Duration | Temporal.DurationLike = {milliseconds: 500},
    gridSteps: number = 9
  ): Promise<boolean> {
    // Wait for World script initialization to complete first
    await this.initializedPromise;

    // Walk up parent hierarchy to find the root THREE.Scene
    let sceneObj: THREE.Object3D | null = this.parent;
    while (sceneObj && !(sceneObj instanceof THREE.Scene)) {
      sceneObj = sceneObj.parent;
    }
    const rootScene = (sceneObj as THREE.Scene) || this;

    return placeOnHorizontalSurface(
      objectToPlace,
      this.camera,
      rootScene,
      this.planes,
      this.meshes,
      this.waitFrame,
      this.timer,
      timeout,
      gridSteps
    );
  }

  /**
   * Toggles the visibility of all debug visualizations for world features.
   * @param visible - Whether the visualizations should be visible.
   */
  showDebugVisualizations(visible = true) {
    this.planes?.showDebugVisualizations(visible);
    this.objects?.showDebugVisualizations(visible);
  }

  /**
   * Returns the object the user's primary controller / pinch / gaze ray is
   * currently aimed at, or `undefined` if nothing is targeted.
   *
   * Sugar over {@link User.getReticleTarget}. Throws if no `User` is
   * registered (i.e. before XRCore has booted).
   *
   * @param controllerId - Which controller to query. Defaults to `0`
   *     (primary).
   * @returns The targeted Object3D, or `undefined`.
   */
  lookingAt(controllerId = 0): THREE.Object3D | undefined {
    const user = this.registry?.get(User);
    if (!user) {
      throw new Error(
        'world.lookingAt: no User is registered. Call inside or after XRCore.start().'
      );
    }
    return user.getReticleTarget(controllerId);
  }

  /**
   * Opens a Gemini Live session that streams the device camera into the model
   * while piping the model's text + audio + tool-calls back to the caller.
   *
   * Builds on the existing primitives:
   *   - `ai.startLiveSession` for the bidirectional channel
   *   - `XRDeviceCamera.getSnapshot` for vision frames
   *   - `sound.playAIAudio` for audio playback (auto-wired unless `onAudio`
   *      is supplied)
   *
   * The mic is not auto-enabled; call
   * `xb.core.sound.enableAudio(...)` with `streamToAI: true` before this if
   * you want the model to hear the user.
   *
   * @param prompt - The system instruction / persona for the session.
   * @param options - Frame rate, image quality, optional tools, and
   *     callbacks.
   * @returns A handle exposing `stop()` and `isActive()`. The caller is
   *     responsible for calling `stop()`.
   * @throws If no AI is registered, the active model isn't Live-capable, or
   *     no XRDeviceCamera is registered.
   */
  async streamScene(
    prompt: string,
    options: StreamSceneOptions = {}
  ): Promise<StreamSceneSession> {
    const ai = this.registry?.get(AI);
    if (!ai) {
      throw new Error(
        'world.streamScene: no AI is registered. Call options.enableAI() first.'
      );
    }
    if (!ai.isLiveAvailable()) {
      throw new Error(
        'world.streamScene: active AI model does not support Live sessions. ' +
          'Use a Gemini Live model.'
      );
    }
    const camera = this.registry.get(XRDeviceCamera);
    if (!camera) {
      throw new Error(
        'world.streamScene: no XRDeviceCamera is registered. Call ' +
          'options.enableCamera() first.'
      );
    }

    const fps = options.fps ?? 1;
    const quality = options.imageQuality ?? 0.7;
    const width = options.imageWidth ?? 640;
    const height = options.imageHeight ?? 480;
    const tools = options.tools ?? [];
    const sound = this.registry.get(CoreSound);

    const toolsByName = new Map<string, Tool>(tools.map((t) => [t.name, t]));
    const functionDeclarations: GoogleGenAITypes.FunctionDeclaration[] =
      tools.map((t) => t.toJSON());

    let active = true;
    let sending = false;

    const handleToolCall = async (
      toolCall: GoogleGenAITypes.LiveServerToolCall
    ) => {
      if (options.onToolCall) {
        await options.onToolCall(toolCall);
        return;
      }
      const calls = toolCall.functionCalls ?? [];
      const responses: GoogleGenAITypes.FunctionResponse[] = [];
      for (const call of calls) {
        const tool = toolsByName.get(call.name ?? '');
        if (!tool) {
          responses.push({
            id: call.id,
            name: call.name,
            response: {error: `unknown tool: ${call.name}`},
          });
          continue;
        }
        try {
          const result = await tool.execute(call.args ?? {});
          responses.push({
            id: call.id,
            name: call.name,
            response: result.success
              ? {result: result.data ?? null}
              : {error: result.error ?? 'tool execution failed'},
          });
        } catch (err) {
          responses.push({
            id: call.id,
            name: call.name,
            response: {error: (err as Error).message},
          });
        }
      }
      ai.sendToolResponse({functionResponses: responses});
    };

    ai.setLiveCallbacks({
      onopen: () => options.onOpen?.(),
      onmessage: (msg: GoogleGenAITypes.LiveServerMessage) => {
        const text = msg.serverContent?.modelTurn?.parts
          ?.map((p) => p.text)
          .filter(Boolean)
          .join('');
        if (text) options.onText?.(text);

        const audioPart = msg.serverContent?.modelTurn?.parts?.find((p) =>
          p.inlineData?.mimeType?.startsWith('audio/')
        );
        const audio = audioPart?.inlineData?.data;
        if (audio) {
          if (options.onAudio) options.onAudio(audio);
          else sound?.playAIAudio(audio);
        }

        if (msg.toolCall) handleToolCall(msg.toolCall);
      },
      onerror: (e: ErrorEvent) => options.onError?.(new Error(e.message)),
      onclose: () => {
        active = false;
        clearInterval(frameTimer);
        options.onClose?.();
      },
    });

    await ai.startLiveSession({
      systemInstruction: {parts: [{text: prompt}]},
      ...(functionDeclarations.length ? {tools: [{functionDeclarations}]} : {}),
    });

    const sendFrame = async () => {
      if (!active || sending) return;
      sending = true;
      try {
        const dataUrl = await camera.getSnapshot({
          outputFormat: 'base64',
          mimeType: 'image/jpeg',
          quality,
          width,
          height,
        });
        if (!dataUrl || !active) return;
        const {strippedBase64, mimeType} = parseBase64DataURL(dataUrl);
        ai.sendRealtimeInput({
          video: {data: strippedBase64, mimeType: mimeType ?? 'image/jpeg'},
        });
      } catch (err) {
        options.onError?.(err as Error);
      } finally {
        sending = false;
      }
    };

    const frameTimer: ReturnType<typeof setInterval> = setInterval(
      sendFrame,
      Math.max(1, Math.round(1000 / fps))
    );
    sendFrame();

    return {
      isActive: () => active,
      async stop() {
        if (!active) return;
        active = false;
        clearInterval(frameTimer);
        await ai.stopLiveSession();
      },
    };
  }
}

/**
 * Options for {@link World.streamScene}.
 */
export interface StreamSceneOptions {
  /** Camera frames per second sent to the model. Default `1`. */
  fps?: number;
  /** JPEG quality for camera snapshots, 0..1. Default `0.7`. */
  imageQuality?: number;
  /** Snapshot width in pixels. Default `640`. */
  imageWidth?: number;
  /** Snapshot height in pixels. Default `480`. */
  imageHeight?: number;
  /** Optional agentic tools the model may invoke. */
  tools?: Tool[];
  /** Called when the Live session opens. */
  onOpen?: () => void;
  /** Called for each text chunk the model emits. */
  onText?: (text: string) => void;
  /**
   * Called for each audio chunk (base64 PCM) the model emits. If omitted and
   * a `CoreSound` is registered, audio is auto-played via
   * `sound.playAIAudio`.
   */
  onAudio?: (base64: string) => void;
  /**
   * Called for each tool invocation. If omitted, tools provided in
   * `options.tools` are dispatched and their results sent back automatically.
   */
  onToolCall?: (
    toolCall: GoogleGenAITypes.LiveServerToolCall
  ) => Promise<void> | void;
  /** Called on transport error. */
  onError?: (err: Error) => void;
  /** Called when the session closes (caller- or server-initiated). */
  onClose?: () => void;
}

/**
 * Handle returned by {@link World.streamScene}.
 */
export interface StreamSceneSession {
  /** Whether the session is still streaming. */
  isActive(): boolean;
  /** Stops the camera loop and closes the Live session. Idempotent. */
  stop(): Promise<void>;
}
