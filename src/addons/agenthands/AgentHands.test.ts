import {describe, it, expect, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect: () => {}}), destination: {}};
  });
});

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
});
