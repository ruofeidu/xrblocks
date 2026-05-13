/**
 * NetObject: an Object3D wrapper whose transform is replicated to all other
 * peers on a fixed cadence. The peer that *creates* the NetObject becomes
 * its initial owner; other peers may "claim" it (e.g., when grabbed) by
 * calling `claim()`. The current owner is the only peer that broadcasts
 * authoritative transform updates; non-owners interpolate.
 *
 * Ownership is cooperative — there is no central arbiter. Explicit claims
 * always preempt the previous owner so users can hand off / steal objects;
 * the only deterministic tiebreak left is for the rare case where two peers
 * implicitly auto-own the same id at create-time (see NetSession's
 * `netobject` handler), where the lex-smaller peer id wins.
 *
 * NetObjects are normal three.js Object3Ds; you can `.add()` any meshes to
 * them. Each frame, NetSession applies remote updates to the local
 * transform if we don't currently own the object.
 */
import * as THREE from 'three';

import {makeId} from '../utils/IdUtils';

export interface NetObjectOptions {
  /** Stable id for this object across peers. Defaults to a fresh random id. */
  id?: string;
  /** Initial owner peer id. NetSession sets this to the local peer id when the object is created locally. */
  ownerId?: string;
}

export class NetObject extends THREE.Group {
  readonly netId: string;
  ownerId: string;

  /** Local-only state object that consumers can populate; sent alongside transforms. */
  state: Record<string, unknown> = {};

  /** Last-applied remote transform (used by NetSession for interpolation). */
  _targetPosition = new THREE.Vector3();
  _targetQuaternion = new THREE.Quaternion();
  _targetScale = new THREE.Vector3(1, 1, 1);
  _hasTarget = false;
  _lastSendMs = 0;

  constructor(opts: NetObjectOptions = {}) {
    super();
    this.netId = opts.id ?? `obj_${makeId(10)}`;
    this.ownerId = opts.ownerId ?? '';
    this.name = `NetObject(${this.netId})`;
  }

  /** True if the local peer currently owns this object. */
  isOwnedBy(peerId: string): boolean {
    return this.ownerId === peerId;
  }

  /**
   * Snapshot the current local transform to a 10-element array suitable
   * for inclusion in a NetObjectMessage. Symmetric with `setTargetXform`,
   * which writes back into local position/quaternion/scale.
   */
  toXform(): number[] {
    const p = this.position;
    const q = this.quaternion;
    const s = this.scale;
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z];
  }

  /** Replace the target transform from a wire xform array. */
  setTargetXform(x: number[]): void {
    this._targetPosition.set(x[0], x[1], x[2]);
    this._targetQuaternion.set(x[3], x[4], x[5], x[6]);
    this._targetScale.set(x[7], x[8], x[9]);
    this._hasTarget = true;
  }

  /**
   * Snap the local transform immediately to a wire xform array and clear
   * any pending interpolation target. Used on release so the object lands
   * exactly where the previous owner left it.
   */
  snapToXform(x: number[]): void {
    this.position.set(x[0], x[1], x[2]);
    this.quaternion.set(x[3], x[4], x[5], x[6]);
    this.scale.set(x[7], x[8], x[9]);
    this._hasTarget = false;
  }

  /**
   * Smoothly drive the local transform toward the target. Called by
   * NetSession on non-owner peers. `t` is the per-frame lerp coefficient
   * (typically dt * 12).
   */
  stepInterpolation(t: number): void {
    if (!this._hasTarget) return;
    this.position.lerp(this._targetPosition, Math.min(1, t));
    this.quaternion.slerp(this._targetQuaternion, Math.min(1, t));
    this.scale.lerp(this._targetScale, Math.min(1, t));
  }
}
