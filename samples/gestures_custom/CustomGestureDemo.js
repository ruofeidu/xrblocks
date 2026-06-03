// Imports LiteRt: https://ai.google.dev/edge/litert/web/get_started
import {loadLiteRt, setWebGpuDevice} from '@litertjs/core';
import {runWithTfjsTensors} from '@litertjs/tfjs-interop';
// TensorFlow.js + WebGPU backend
import * as tf from '@tensorflow/tfjs';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {WebGPUBackend} from '@tensorflow/tfjs-backend-webgpu';
import * as THREE from 'three';
import * as xb from 'xrblocks';

const GESTURE_LABELS = [
  'OTHER',
  'FIST',
  'THUMB UP',
  'THUMB DOWN',
  'POINT',
  'VICTORY',
  'ROCK',
  'SHAKA',
  'GESTURE_LABEL_MAX_ENUM',
];

const GESTURE_NAMES = [
  'other',
  'fist',
  'thumbs-up',
  'thumbs-down',
  'point',
  'victory',
  'rock',
  'shaka',
  'unknown',
];

const GESTURE_IMAGES = [
  'images/empty.png',
  'images/fist.png',
  'images/thumb.png',
  'images/thumb_down.png',
  'images/point.png',
  'images/victory.png',
  'images/rock.png',
  'images/shaka.png',
  'images/error.png',
];

const LEFT_HAND_INDEX = 0;
const RIGHT_HAND_INDEX = 1;

const UNKNOWN_GESTURE = 8;

export class CustomGestureRecognizer {
  constructor() {
    this.modelPath =
      'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/tflite_models/gestures/xr_emoji.tflite';
    this.modelState = 'None';
    this.model = null;
    this.loadingPromise = null;
  }

  async init() {
    this.loadingPromise ??= this.setBackendAndLoadModel();
  }

  getGestureConfigurations() {
    return {
      fist: {enabled: true},
      'thumbs-up': {enabled: true},
      'thumbs-down': {enabled: true},
      point: {enabled: true},
      victory: {enabled: true},
      rock: {enabled: true},
      shaka: {enabled: true},
    };
  }

  async setBackendAndLoadModel() {
    this.modelState = 'Loading';
    try {
      await tf.setBackend('webgpu');
      await tf.ready();

      const wasmPath = 'https://unpkg.com/@litertjs/core@0.2.1/wasm/';
      const liteRt = await loadLiteRt(wasmPath);
      const backend = tf.backend();
      setWebGpuDevice(backend.device);

      await this.loadModel(liteRt);

      if (this.model) {
        console.log('Model Details: ', this.model.getInputDetails());
      }
      this.modelState = 'Ready';
    } catch (error) {
      this.modelState = 'Error';
      console.error('Failed to load model or backend:', error);
    }
  }

  async loadModel(liteRt) {
    try {
      this.model = await liteRt.loadAndCompile(this.modelPath, {
        accelerator: 'webgpu',
      });
    } catch (error) {
      this.model = null;
      console.error('Error loading model:', error);
    }
  }

  async detectGesture(context) {
    if (!this.model || !context) {
      return UNKNOWN_GESTURE;
    }

    try {
      const relativeBoneAngles = xb.getRelativeBoneAngles(context);
      const tensor = tf.tensor1d(relativeBoneAngles);
      const tensorReshaped = tensor.reshape([
        1,
        xb.HAND_BONE_IDX_CONNECTION_MAP.length,
        1,
      ]);
      const result = runWithTfjsTensors(this.model, tensorReshaped);

      const scores = result[0].as1D().arraySync();
      if (scores.length == 7) {
        let maxScore = scores[0];
        let idx = 0;
        for (let t = 0; t < 7; ++t) {
          if (scores[t] > maxScore) {
            idx = t;
            maxScore = scores[t];
          }
        }
        return idx;
      }
    } catch (error) {
      console.error('Error:', error);
    }
    return UNKNOWN_GESTURE;
  }

  async recognize(context) {
    const scores = {};
    for (const name of Object.keys(this.getGestureConfigurations())) {
      scores[name] = {confidence: 0};
    }

    if (!this.model) return scores;

    let result = await this.detectGesture(context);
    result = this.shiftIndexIfNeeded(context, result);

    const gestureName = GESTURE_NAMES[result];
    if (gestureName && scores[gestureName]) {
      scores[gestureName] = {confidence: 1};
    }
    return scores;
  }

  shiftIndexIfNeeded(context, result) {
    result += result > 2 ? 1 : 0;
    if (result === 2) {
      const thumbDistal = context.getJoint('thumb-phalanx-distal', false);
      const thumbTip = context.getJoint('thumb-tip', false);
      if (!thumbDistal || !thumbTip) return 0;
      const thumbDirection = this.isThumbUpOrDown(thumbDistal, thumbTip);
      result = thumbDirection === 0 ? 0 : thumbDirection < 0 ? result + 1 : result;
    }
    return result;
  }

  isThumbUpOrDown(p1, p2) {
    const vector = {
      x: p2.x - p1.x,
      y: p2.y - p1.y,
      z: p2.z - p1.z,
    };

    const magnitude = Math.sqrt(
      vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
    );

    if (magnitude < 0.001) {
      return 0;
    }

    const normalizedVector = {
      x: vector.x / magnitude,
      y: vector.y / magnitude,
      z: vector.z / magnitude,
    };

    const upVector = {x: 0, y: 1, z: 0};
    const downVector = {x: 0, y: -1, z: 0};
    const cosUpThreshold = Math.cos((45 * Math.PI) / 180);
    const dotDownThreshold = cosUpThreshold;
    const dotUp =
      normalizedVector.x * upVector.x +
      normalizedVector.y * upVector.y +
      normalizedVector.z * upVector.z;
    const dotDown =
      normalizedVector.x * downVector.x +
      normalizedVector.y * downVector.y +
      normalizedVector.z * downVector.z;

    if (dotUp >= cosUpThreshold) {
      return 1;
    } else if (dotDown >= dotDownThreshold) {
      return -1;
    }
    return 0;
  }
}

/**
 * A demo scene that uses a custom ML model to detect and display static hand
 * gestures for both hands in real-time.
 */
export class CustomGestureDemo extends xb.Script {
  constructor() {
    super();

    // Initializes UI.
    {
      // Make a root panel>grid>row>controlPanel>grid
      const panel = new xb.SpatialPanel({backgroundColor: '#00000000'});
      this.add(panel);

      const grid = panel.addGrid();

      // Show user data
      const dataRow = grid.addRow({weight: 0.3});
      // Left hand image and text
      const leftCol = dataRow.addCol({weight: 0.5});
      const leftHandRow = leftCol.addRow({weight: 0.5});
      // Indentation
      leftHandRow.addCol({weight: 0.4});
      this.leftHandImage = leftHandRow.addCol({weight: 0.2}).addImage({
        src: GESTURE_IMAGES[0],
        scaleFactor: 0.3,
      });
      this.leftHandLabel = leftCol.addRow({weight: 0.5}).addText({
        text: 'Loading...',
        fontColor: '#ffffff',
      });
      const rightCol = dataRow.addCol({weight: 0.5});
      const rightHandRow = rightCol.addRow({weight: 0.5});
      // Indentation
      rightHandRow.addCol({weight: 0.4});
      // Image
      this.rightHandImage = rightHandRow.addCol({weight: 0.2}).addImage({
        src: GESTURE_IMAGES[0],
        scaleFactor: 0.3,
      });
      this.rightHandLabel = rightCol.addRow({weight: 0.4}).addText({
        text: 'Loading...',
        fontColor: '#ffffff',
      });

      // Indentation
      grid.addRow({weight: 0.1});

      // Control row
      const controlRow = grid.addRow({weight: 0.6});
      const ctrlPanel = controlRow.addPanel({backgroundColor: '#00000055'});
      const ctrlGrid = ctrlPanel.addGrid();
      {
        // Left indentation
        ctrlGrid.addCol({weight: 0.1});

        // Middle column
        const midColumn = ctrlGrid.addCol({weight: 0.8});

        midColumn.addRow({weight: 0.1});
        midColumn.addRow({weight: 0.2}).addText({
          text: 'Perform one of these gestures',
          fontColor: '#ffffff',
        });
        midColumn
          .addRow({weight: 0.2})
          .addText({text: '(either hand):', fontColor: '#ffffff'});
        const gesturesRow = midColumn.addRow({weight: 0.5});
        gesturesRow.addCol({weight: 0.1});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/fist.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/thumb.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/thumb_down.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/point.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/victory.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/rock.png', scaleFactor: 0.3});
        gesturesRow
          .addCol({weight: 0.1})
          .addImage({src: 'images/shaka.png', scaleFactor: 0.3});

        // Vertical alignment on the description text element.
        midColumn.addRow({weight: 0.1});

        // Right indentation.
        ctrlGrid.addCol({weight: 0.1});
      }

      const orbiter = ctrlGrid.addOrbiter();
      orbiter.addExitButton();

      panel.updateLayouts();

      this.panel = panel;
    }

    this.activeGestures = {
      left: new Map(),
      right: new Map(),
    };
  }

  init() {
    // Adds light.
    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(0, 4, 0);
    this.add(light);

    const gestures = xb.core.gestureRecognition;
    if (!gestures) return;

    this.onGestureUpdate = (event) => {
      const {hand, name, confidence = 0} = event.detail;
      this.activeGestures[hand].set(name, confidence);
      this.refreshHand(hand);
    };
    this.onGestureEnd = (event) => {
      const {hand, name} = event.detail;
      this.activeGestures[hand].delete(name);
      this.refreshHand(hand);
    };

    gestures.addEventListener('gesturestart', this.onGestureUpdate);
    gestures.addEventListener('gestureupdate', this.onGestureUpdate);
    gestures.addEventListener('gestureend', this.onGestureEnd);
  }

  refreshHand(hand) {
    const active = this.activeGestures[hand];
    let bestName = 'other';
    let bestConfidence = 0;
    for (const [name, confidence] of active.entries()) {
      if (confidence >= bestConfidence) {
        bestName = name;
        bestConfidence = confidence;
      }
    }
    const index = GESTURE_NAMES.indexOf(bestName);
    const image = GESTURE_IMAGES[index >= 0 ? index : 0];
    const label = GESTURE_LABELS[index >= 0 ? index : 0];

    if (hand === 'left') {
      this.leftHandImage.load(image);
      this.leftHandLabel.setText(label);
    } else {
      this.rightHandImage.load(image);
      this.rightHandLabel.setText(label);
    }
  }

  dispose() {
    const gestures = xb.core.gestureRecognition;
    if (!gestures) return;
    if (this.onGestureUpdate) {
      gestures.removeEventListener('gesturestart', this.onGestureUpdate);
      gestures.removeEventListener('gestureupdate', this.onGestureUpdate);
    }
    if (this.onGestureEnd) {
      gestures.removeEventListener('gestureend', this.onGestureEnd);
    }
  }
}
