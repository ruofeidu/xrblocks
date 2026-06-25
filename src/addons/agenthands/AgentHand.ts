import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {
  HAND_JOINT_NAMES,
  Handedness,
  resolveSimulatorHandPoseRotations,
  SimulatorHandPose,
  SIMULATOR_HAND_POSE_ROTATIONS,
  type SimulatorHandPoseJoints,
} from 'xrblocks';

/** Public WebXR generic-hand rig used as the agent's hand mesh. */
export const AGENT_HAND_PROFILE_PATH =
  'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/';

// Indices into HAND_JOINT_NAMES used for index-finger aiming.
const WRIST_BONE_INDEX = 0;
const INDEX_TIP_BONE_INDEX = 10;

const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchQuaternionB = new THREE.Quaternion();
const scratchTarget = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchDirB = new THREE.Vector3();
const scratchWrist = new THREE.Vector3();
const scratchTip = new THREE.Vector3();

/**
 * Smoothly moves a hand's bones toward a target set of joint transforms.
 * Extracted as a pure function so the animation step is testable without a GPU
 * or a loaded mesh.
 * @param bones - The hand's bones, aligned to {@link HAND_JOINT_NAMES}. Missing
 *     bones (undefined) are skipped.
 * @param joints - Target per-joint transforms (translation + rotation).
 * @param lerp - Interpolation factor in [0, 1]; 1 snaps to the target.
 */
export function lerpBonesToJoints(
  bones: ReadonlyArray<THREE.Object3D | undefined>,
  joints: Readonly<SimulatorHandPoseJoints>,
  lerp: number
) {
  for (let i = 0; i < bones.length; i++) {
    const bone = bones[i];
    const joint = joints[i];
    if (!bone || !joint) continue;
    scratchPosition.fromArray(joint.t);
    scratchQuaternion.fromArray(joint.r);
    bone.position.lerp(scratchPosition, lerp);
    bone.quaternion.slerp(scratchQuaternion, lerp);
  }
}

/**
 * A single, free-standing animatable hand (not tied to the user's tracked
 * input). Loads the WebXR generic-hand rig, then poses it each frame toward the
 * current {@link SimulatorHandPose} using the simulator pose library.
 */
export class AgentHand {
  /** Container to position/orient the whole hand in the scene. */
  readonly root = new THREE.Group();

  /** Whether the mesh has finished loading. */
  loaded = false;

  private readonly bones: Array<THREE.Object3D | undefined> = [];
  private pose: SimulatorHandPose = SimulatorHandPose.RELAXED;
  /** Orientation the root smoothly slerps toward (identity = resting). */
  private readonly targetQuaternion = new THREE.Quaternion();

  constructor(readonly handedness: Handedness) {}

  /**
   * Loads the hand mesh and collects its bones.
   * @param loader - Optional GLTFLoader to reuse.
   */
  async load(loader = new GLTFLoader()): Promise<void> {
    loader.setPath(AGENT_HAND_PROFILE_PATH);
    const file = this.handedness === Handedness.LEFT ? 'left.glb' : 'right.glb';
    const gltf = await loader.loadAsync(file);
    this.root.add(gltf.scene);
    for (const name of HAND_JOINT_NAMES) {
      this.bones.push(gltf.scene.getObjectByName(name));
    }
    this.loaded = true;
  }

  /** Sets the gesture the hand animates toward. */
  setPose(pose: SimulatorHandPose) {
    this.pose = pose;
  }

  /** The gesture the hand is currently animating toward. */
  get currentPose(): SimulatorHandPose {
    return this.pose;
  }

  /**
   * Advances the hand one animation step toward its current pose.
   * @param lerp - Interpolation factor in [0, 1].
   */
  animate(lerp = 0.2) {
    if (!this.loaded) return;
    const joints = resolveSimulatorHandPoseRotations(
      this.handedness,
      SIMULATOR_HAND_POSE_ROTATIONS[this.pose]
    );
    lerpBonesToJoints(this.bones, joints, lerp);
    this.root.quaternion.slerp(this.targetQuaternion, lerp);
  }

  /**
   * Orients the hand so its index finger points at a world-space position, and
   * switches to the pointing pose. The hand smoothly turns toward the target on
   * subsequent {@link animate} calls.
   * @param targetWorld - The world-space point to aim the index finger at.
   */
  aimAt(targetWorld: THREE.Vector3) {
    const parent = this.root.parent;
    if (!this.loaded || !parent) return;
    this.setPose(SimulatorHandPose.POINTING);

    // Direction the posed index finger points, expressed in the parent frame
    // with the root un-rotated (so it is independent of the current aim).
    const localDir = this.measurePointDirection_();

    // Desired direction from the hand toward the target, in the parent frame.
    parent.worldToLocal(scratchTarget.copy(targetWorld));
    scratchDir.copy(scratchTarget).sub(this.root.position).normalize();

    this.targetQuaternion.setFromUnitVectors(localDir, scratchDir);
  }

  /** Returns the hand to its resting orientation. */
  clearAim() {
    this.targetQuaternion.identity();
  }

  // Snaps the bones to the pointing pose (with the root un-rotated) and returns
  // the wrist-to-index-tip direction in the parent frame.
  private measurePointDirection_(): THREE.Vector3 {
    const parent = this.root.parent!;
    const savedQuaternion = scratchQuaternionB.copy(this.root.quaternion);
    this.root.quaternion.identity();
    const pointingJoints = resolveSimulatorHandPoseRotations(
      this.handedness,
      SIMULATOR_HAND_POSE_ROTATIONS[SimulatorHandPose.POINTING]
    );
    lerpBonesToJoints(this.bones, pointingJoints, 1);
    this.root.updateWorldMatrix(true, true);

    const wrist = this.bones[WRIST_BONE_INDEX];
    const tip = this.bones[INDEX_TIP_BONE_INDEX];
    this.root.quaternion.copy(savedQuaternion);
    if (!wrist || !tip) return scratchDirB.set(0, 0, -1);

    wrist.getWorldPosition(scratchWrist);
    tip.getWorldPosition(scratchTip);
    parent.worldToLocal(scratchWrist);
    parent.worldToLocal(scratchTip);
    return scratchDirB.copy(scratchTip).sub(scratchWrist).normalize();
  }
}
