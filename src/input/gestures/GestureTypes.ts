import * as THREE from 'three';

import {Handedness, JointName} from '../Hands';
import {HAND_JOINT_NAMES} from '../components/HandJointNames';
import type {User} from '../../core/User';
import type {GestureConfiguration} from './GestureRecognitionOptions';

export type HandLabel = 'left' | 'right';

export const HAND_INDEX_TO_LABEL: Partial<Record<Handedness, HandLabel>> = {
  [Handedness.LEFT]: 'left',
  [Handedness.RIGHT]: 'right',
};

export type JointPositions = Map<JointName, THREE.Vector3>;

export interface HandContext {
  handedness: Handedness;
  handLabel: HandLabel;
  joints: JointPositions;

  getJoint(jointName: JointName): THREE.Vector3 | undefined;
}

export class BaseHandContext implements HandContext {
  private validJointNames: Set<string>;

  constructor(
    public handedness: Handedness,
    public handLabel: HandLabel,
    public joints: JointPositions,
    validJointNames: readonly string[] = HAND_JOINT_NAMES
  ) {
    this.validJointNames = new Set(validJointNames);
  }

  getJoint(jointName: JointName) {
    if (!this.validJointNames.has(jointName)) {
      throw new Error(`Invalid hand joint name: ${jointName}`);
    }
    return this.joints.get(jointName);
  }
}

export type GestureDetectionResult = {
  confidence: number;
  data?: Record<string, unknown>;
};

export type GestureScoreMap = Record<
  string,
  GestureDetectionResult | undefined
>;

export type HeuristicGestureDetector = (
  context: HandContext,
  config: GestureConfiguration
) => GestureDetectionResult | undefined;

export interface GestureRecognizer {
  init?(): Promise<void>;
  recognize(context: HandContext): GestureScoreMap | Promise<GestureScoreMap>;
  getGestureConfigurations?(): Record<string, GestureConfiguration>;
  dispose?(): void;
}

export interface PoseEstimator {
  init?(dependencies?: {user?: User}): Promise<void>;
  getHandContext(handedness: Handedness): HandContext | null;
  getHandContexts(): Partial<Record<HandLabel, HandContext>>;
  dispose?(): void;
}
