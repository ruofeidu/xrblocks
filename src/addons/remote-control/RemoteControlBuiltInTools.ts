import * as THREE from 'three';

import type {
  EmbodiedControl,
  EmbodiedControlStep,
  XRCompoundControl,
} from '../embodied-control';
import type {RemoteControlObserver} from './RemoteControlObserver';
import type {
  RemoteControlToolHandler,
  RemoteControlToolMetadata,
} from './RemoteControlProtocol';

export const REMOTE_CONTROL_BUILT_IN_TOOL_NAMES = {
  step: 'step',
  applyControl: 'applyControl',
  teleportTo: 'teleportTo',
  lookAtTarget: 'lookAtTarget',
  pointTo: 'pointTo',
  reachTo: 'reachTo',
  click: 'click',
  getCamera: 'getCamera',
  getHands: 'getHands',
  getScreenshot: 'getScreenshot',
  getSimulatorState: 'getSimulatorState',
} as const;

export type RemoteControlTarget = [number, number, number] | string;

export type RemoteControlTargetResolver = (
  target: RemoteControlTarget
) => THREE.Vector3 | THREE.Object3D;

export type RemoteControlPoseObservation = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

export type RemoteControlHandObservation = RemoteControlPoseObservation & {
  selected: boolean;
  squeezing: boolean;
  visible: boolean;
};

export type RemoteControlApplyControlToolArgs = {
  control: XRCompoundControl;
};

export type RemoteControlTeleportToToolArgs = {
  target: RemoteControlTarget;
  options?: {distance?: number; faceTarget?: boolean; snapToGround?: boolean};
};

export type RemoteControlLookAtTargetToolArgs = {
  target: RemoteControlTarget;
  options?: {velocity?: number};
};

export type RemoteControlPointToToolArgs = {
  handIndex: number;
  target: RemoteControlTarget;
  options?: {velocity?: number};
};

export type RemoteControlReachToToolArgs = RemoteControlPointToToolArgs;

export type RemoteControlClickToolArgs = {
  handIndex?: number;
  options?: {durationMs?: number};
};

export type RemoteControlCameraToolArgs = {
  screenshot?: boolean;
  overlayOnCamera?: boolean;
};

export type RemoteControlScreenshotToolArgs = {
  overlayOnCamera?: boolean;
};

export type RemoteControlCameraToolResult = RemoteControlPoseObservation & {
  screenshot?: string;
};

export type RemoteControlHandsToolResult = {
  leftHand: RemoteControlHandObservation;
  rightHand: RemoteControlHandObservation;
};

export type RemoteControlSimulatorStateToolResult = {
  timestampMs: number;
  frame: number;
  simulatorRunning: boolean;
  paused: boolean;
};

export type RemoteControlBuiltInTool = {
  name: string;
  handler: RemoteControlToolHandler;
  metadata: RemoteControlToolMetadata;
};

export type RemoteControlBuiltInToolDependencies = {
  observer: RemoteControlObserver;
  embodiedControl: EmbodiedControl;
  resolveTarget: RemoteControlTargetResolver;
};

export function createRemoteControlBuiltInTools({
  observer,
  embodiedControl,
  resolveTarget,
}: RemoteControlBuiltInToolDependencies): RemoteControlBuiltInTool[] {
  return [
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.step,
      handler: async (args) => {
        await embodiedControl.step(args as EmbodiedControlStep);
        return {completed: true};
      },
      metadata: {
        description: 'Runs an embodied-control step.',
        parameters: {
          durationMs: 'number',
          control: 'XRCompoundControl',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.applyControl,
      handler: async (args) => {
        embodiedControl.applyControl(
          (args as RemoteControlApplyControlToolArgs).control
        );
        return {completed: true};
      },
      metadata: {
        description: 'Applies an immediate embodied compound control.',
        parameters: {
          control: 'XRCompoundControl',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.teleportTo,
      handler: async (args) => {
        const {target, options} = args as RemoteControlTeleportToToolArgs;
        await embodiedControl.teleportTo(resolveTarget(target), options);
        return {completed: true};
      },
      metadata: {
        description: 'Teleports the simulator camera to a scene target.',
        parameters: {
          target: 'Vec3 tuple or scene object name',
          options: 'teleport options',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.lookAtTarget,
      handler: async (args) => {
        const {target, options} = args as RemoteControlLookAtTargetToolArgs;
        await embodiedControl.lookAtTarget(resolveTarget(target), options);
        return {completed: true};
      },
      metadata: {
        description: 'Rotates the simulator camera to face a scene target.',
        parameters: {
          target: 'Vec3 tuple or scene object name',
          options: 'look options',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.pointTo,
      handler: async (args) => {
        const {handIndex, target, options} =
          args as RemoteControlPointToToolArgs;
        await embodiedControl.pointTo(
          handIndex,
          resolveTarget(target),
          options
        );
        return {completed: true};
      },
      metadata: {
        description: 'Moves a simulator hand to point at a scene target.',
        parameters: {
          handIndex: 'number',
          target: 'Vec3 tuple or scene object name',
          options: 'hand motion options',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.reachTo,
      handler: async (args) => {
        const {handIndex, target, options} =
          args as RemoteControlReachToToolArgs;
        await embodiedControl.reachTo(
          handIndex,
          resolveTarget(target),
          options
        );
        return {completed: true};
      },
      metadata: {
        description: 'Moves a simulator hand to reach toward a scene target.',
        parameters: {
          handIndex: 'number',
          target: 'Vec3 tuple or scene object name',
          options: 'hand motion options',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.click,
      handler: async (args) => {
        const {handIndex, options} = (args ?? {}) as RemoteControlClickToolArgs;
        await embodiedControl.click(handIndex, options);
        return {completed: true};
      },
      metadata: {
        description: 'Runs a simulator select/click gesture.',
        parameters: {
          handIndex: 'number',
          options: 'click options',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.getCamera,
      handler: async (args) =>
        observer.getCamera(args as RemoteControlCameraToolArgs),
      metadata: {
        description:
          'Returns the world-space camera pose and optionally a screenshot.',
        parameters: {
          screenshot: 'boolean',
          overlayOnCamera: 'boolean',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.getHands,
      handler: async () => observer.getHands(),
      metadata: {
        description: 'Returns simulator left and right hand/controller state.',
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.getScreenshot,
      handler: async (args) =>
        observer.getScreenshot(args as RemoteControlScreenshotToolArgs),
      metadata: {
        description: 'Returns a screenshot data URL.',
        parameters: {
          overlayOnCamera: 'boolean',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.getSimulatorState,
      handler: async () => observer.getSimulatorState(),
      metadata: {
        description: 'Returns remote-control frame and simulator state.',
      },
    },
  ];
}
