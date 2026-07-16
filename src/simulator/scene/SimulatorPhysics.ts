import * as THREE from 'three';
import type RAPIER from 'rapier3d';

import type {Physics} from '../../physics/Physics';
import type {RAPIERCompat} from '../../physics/PhysicsOptions';

const HAND_RADIUS = 0.075;
const HAND_MASS = 1;
const MAX_HAND_SPEED = 3;

interface HandBody {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  target: THREE.Vector3;
  lastInput: THREE.Vector3;
  enabled: boolean;
}

const handVelocity = new THREE.Vector3();
const handPosition = new THREE.Vector3();
const handInputDelta = new THREE.Vector3();
const identityRotation = new THREE.Quaternion();

/** Physics world isolated to the simulated physical environment. */
export class SimulatorPhysics {
  readonly RAPIER: RAPIERCompat;
  readonly world: RAPIER.World;
  private hands: Array<HandBody | undefined> = [];

  constructor(physics: Physics) {
    this.RAPIER = physics.RAPIER;
    this.world = new this.RAPIER.World(
      physics.options?.gravity ?? {x: 0, y: -9.81, z: 0}
    );
    this.world.timestep = physics.timestep;
  }

  constrainHand(
    index: number,
    position: THREE.Vector3,
    enabled: boolean,
    reentryOrigin?: THREE.Vector3
  ) {
    let hand = this.hands[index];
    if (!hand) {
      if (!enabled) return;
      handPosition.copy(reentryOrigin ?? position);
      handInputDelta.copy(position).sub(handPosition);
      if (handInputDelta.lengthSq() > 0) {
        const hit = this.world.castShape(
          handPosition,
          identityRotation,
          handInputDelta,
          new this.RAPIER.Ball(HAND_RADIUS),
          0.002,
          1,
          false
        );
        handPosition.addScaledVector(handInputDelta, hit?.time_of_impact ?? 1);
      }
      const body = this.world.createRigidBody(
        this.RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(handPosition.x, handPosition.y, handPosition.z)
          .setGravityScale(0)
          .setLinearDamping(8)
          .setAdditionalMass(HAND_MASS)
          .lockRotations()
          .setCanSleep(false)
          .setCcdEnabled(true)
      );
      const collider = this.world.createCollider(
        this.RAPIER.ColliderDesc.ball(HAND_RADIUS)
          .setFriction(0.8)
          .setRestitution(0),
        body
      );
      hand = {
        body,
        collider,
        target: handPosition.clone(),
        lastInput: position.clone(),
        enabled: true,
      };
      this.hands[index] = hand;
    }

    if (hand.enabled !== enabled) {
      hand.enabled = enabled;
      if (enabled) {
        if (reentryOrigin) {
          handPosition.copy(reentryOrigin);
        } else {
          const translation = hand.body.translation();
          handPosition.set(translation.x, translation.y, translation.z);
        }
        handInputDelta.copy(position).sub(handPosition);
        if (handInputDelta.lengthSq() > 0) {
          const hit = this.world.castShape(
            handPosition,
            identityRotation,
            handInputDelta,
            new this.RAPIER.Ball(HAND_RADIUS),
            0.002,
            1,
            false,
            undefined,
            undefined,
            hand.collider,
            hand.body
          );
          handPosition.addScaledVector(
            handInputDelta,
            hit?.time_of_impact ?? 1
          );
        }
        hand.body.setTranslation(handPosition, true);
        hand.body.setLinvel({x: 0, y: 0, z: 0}, true);
        hand.target.copy(handPosition);
        hand.body.setEnabled(true);
      } else {
        hand.body.setLinvel({x: 0, y: 0, z: 0}, false);
        hand.body.setEnabled(false);
      }
    }
    if (!enabled) {
      hand.lastInput.copy(position);
      return;
    }

    hand.target.add(handInputDelta.copy(position).sub(hand.lastInput));
    hand.lastInput.copy(position);

    const translation = hand.body.translation();
    position.set(translation.x, translation.y, translation.z);
  }

  step() {
    for (const hand of this.hands) {
      if (!hand?.enabled) continue;
      const translation = hand.body.translation();
      handVelocity
        .copy(hand.target)
        .sub(handPosition.set(translation.x, translation.y, translation.z));
      handVelocity.multiplyScalar(1 / this.world.timestep);
      handVelocity.clampLength(0, MAX_HAND_SPEED);
      hand.body.setLinvel(handVelocity, true);
    }
    this.world.step();
    for (const hand of this.hands) {
      if (!hand?.enabled) continue;
      const translation = hand.body.translation();
      hand.target.set(translation.x, translation.y, translation.z);
    }
  }

  dispose() {
    this.hands.length = 0;
    this.world.free();
  }
}
