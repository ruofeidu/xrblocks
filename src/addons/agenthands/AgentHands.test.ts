import {describe, it, expect, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

import * as THREE from 'three';
import {SimulatorHandPose} from 'xrblocks';

import {AgentHands} from './AgentHands';

describe('AgentHands', () => {
  it('starts unloaded with relaxed hands', () => {
    const hands = new AgentHands();
    expect(hands.loaded).toBe(false);
    expect(hands.left.currentPose).toBe(SimulatorHandPose.RELAXED);
    expect(hands.right.currentPose).toBe(SimulatorHandPose.RELAXED);
  });

  it('gesture() applies a pose to both hands by default', () => {
    const hands = new AgentHands();
    hands.gesture(SimulatorHandPose.POINTING);
    expect(hands.left.currentPose).toBe(SimulatorHandPose.POINTING);
    expect(hands.right.currentPose).toBe(SimulatorHandPose.POINTING);
  });

  it('gesture() can target a single hand', () => {
    const hands = new AgentHands();
    hands.gesture(SimulatorHandPose.THUMBS_UP, 'right');
    expect(hands.right.currentPose).toBe(SimulatorHandPose.THUMBS_UP);
    expect(hands.left.currentPose).toBe(SimulatorHandPose.RELAXED);
  });

  it('rest() relaxes both hands', () => {
    const hands = new AgentHands();
    hands.gesture(SimulatorHandPose.FIST);
    hands.rest();
    expect(hands.left.currentPose).toBe(SimulatorHandPose.RELAXED);
    expect(hands.right.currentPose).toBe(SimulatorHandPose.RELAXED);
  });

  it('pointAt() routes to the named hand', () => {
    const hands = new AgentHands();
    const left = vi.spyOn(hands.left, 'aimAt').mockImplementation(() => {});
    const right = vi.spyOn(hands.right, 'aimAt').mockImplementation(() => {});
    const target = new THREE.Vector3(0, 1, -1);
    hands.pointAt(target, 'left');
    expect(left).toHaveBeenCalledWith(target);
    expect(right).not.toHaveBeenCalled();
  });

  it('pointAt("both") picks the hand on the target side', () => {
    const hands = new AgentHands();
    const left = vi.spyOn(hands.left, 'aimAt').mockImplementation(() => {});
    const right = vi.spyOn(hands.right, 'aimAt').mockImplementation(() => {});
    hands.pointAt(new THREE.Vector3(2, 1, -1), 'both');
    expect(right).toHaveBeenCalledOnce();
    expect(left).not.toHaveBeenCalled();
    hands.pointAt(new THREE.Vector3(-2, 1, -1), 'both');
    expect(left).toHaveBeenCalledOnce();
  });

  it('pointAt("both") chooses the side in the hands local frame', () => {
    // Rotate the pair 180 degrees so world +x maps to local -x. A world target
    // on the +x side should then be the LEFT hand.
    const hands = new AgentHands();
    hands.rotation.y = Math.PI;
    hands.updateMatrixWorld(true);
    const left = vi.spyOn(hands.left, 'aimAt').mockImplementation(() => {});
    const right = vi.spyOn(hands.right, 'aimAt').mockImplementation(() => {});
    hands.pointAt(new THREE.Vector3(2, 1, 0), 'both');
    expect(left).toHaveBeenCalledOnce();
    expect(right).not.toHaveBeenCalled();
  });
});
