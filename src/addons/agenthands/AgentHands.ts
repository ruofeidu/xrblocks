import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Handedness, Script, SimulatorHandPose} from 'xrblocks';

import {AgentHand} from './AgentHand';

const scratchHandsOrigin = new THREE.Vector3();

/** Which hand(s) a gesture applies to. */
export type AgentHandSelector = 'left' | 'right' | 'both';

/**
 * A free-standing pair of agent hands that gesture in the scene. Owns a left
 * and right {@link AgentHand}, loads both, and animates them toward their
 * current poses every frame. Position/orient the whole pair by moving this
 * Script (it is a `THREE.Object3D`); the app decides where the hands sit
 * relative to the user.
 */
export class AgentHands extends Script {
  readonly left = new AgentHand(Handedness.LEFT);
  readonly right = new AgentHand(Handedness.RIGHT);

  /** Per-frame interpolation factor toward the target pose. */
  lerp = 0.2;

  /** Whether both hands have finished loading. */
  loaded = false;

  /**
   * Loads both hand meshes and parents them under this object.
   * @param loader - Optional shared GLTFLoader.
   */
  async load(loader = new GLTFLoader()): Promise<void> {
    await Promise.all([this.left.load(loader), this.right.load(loader)]);
    this.add(this.left.root, this.right.root);
    this.loaded = true;
  }

  /**
   * Sets the gesture one or both hands animate toward.
   * @param pose - The target hand pose.
   * @param hand - Which hand(s) to apply it to. Defaults to both.
   */
  gesture(pose: SimulatorHandPose, hand: AgentHandSelector = 'both') {
    if (hand !== 'right') this.left.setPose(pose);
    if (hand !== 'left') this.right.setPose(pose);
  }

  /** Relaxes both hands to a neutral resting pose. */
  rest() {
    this.gesture(SimulatorHandPose.RELAXED);
    this.left.clearAim();
    this.right.clearAim();
  }

  /**
   * Points a hand at a world-space position (e.g. a detected object). The hand
   * switches to the pointing pose and turns to aim its index finger at the
   * target.
   * @param targetWorld - The world-space point to point at.
   * @param hand - Which hand to point with. 'both' uses the hand on the same
   *     side as the target. Defaults to 'both'.
   */
  pointAt(targetWorld: THREE.Vector3, hand: AgentHandSelector = 'both') {
    let selected = hand;
    if (selected === 'both') {
      this.getWorldPosition(scratchHandsOrigin);
      selected = targetWorld.x >= scratchHandsOrigin.x ? 'right' : 'left';
    }
    if (selected === 'left') this.left.aimAt(targetWorld);
    else this.right.aimAt(targetWorld);
  }

  override update() {
    this.left.animate(this.lerp);
    this.right.animate(this.lerp);
  }
}
