import * as THREE from 'three';
import type RAPIER from 'rapier3d';

import type {Physics} from '../../physics/Physics';
import type {RAPIERCompat} from '../../physics/PhysicsOptions';

const HAND_RADIUS = 0.075;
const HAND_MASS = 1;
const HAND_CONTACT_OFFSET = 0.002;

interface HandBody {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  enabled: boolean;
}

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
          HAND_CONTACT_OFFSET,
          1,
          false
        );
        handPosition.addScaledVector(handInputDelta, hit?.time_of_impact ?? 1);
      }
      const body = this.world.createRigidBody(
        this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          handPosition.x,
          handPosition.y,
          handPosition.z
        )
      );
      const collider = this.world.createCollider(
        this.RAPIER.ColliderDesc.ball(HAND_RADIUS)
          .setFriction(0.8)
          .setRestitution(0),
        body
      );
      const controller =
        this.world.createCharacterController(HAND_CONTACT_OFFSET);
      controller.setSlideEnabled(true);
      controller.setApplyImpulsesToDynamicBodies(true);
      controller.setCharacterMass(HAND_MASS);
      hand = {
        body,
        collider,
        controller,
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
            HAND_CONTACT_OFFSET,
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
        hand.body.setEnabled(true);
      } else {
        hand.body.setEnabled(false);
      }
    }
    if (!enabled) return;

    const translation = hand.body.translation();
    handInputDelta.set(
      position.x - translation.x,
      position.y - translation.y,
      position.z - translation.z
    );
    if (handInputDelta.lengthSq() > 0) {
      hand.controller.computeColliderMovement(hand.collider, handInputDelta);
      const movement = hand.controller.computedMovement();
      handPosition.set(
        translation.x + movement.x,
        translation.y + movement.y,
        translation.z + movement.z
      );
      hand.body.setTranslation(handPosition, true);
    } else {
      handPosition.set(translation.x, translation.y, translation.z);
    }

    position.copy(handPosition);
  }

  step() {
    this.world.step();
  }

  dispose() {
    for (const hand of this.hands) {
      if (hand) this.world.removeCharacterController(hand.controller);
    }
    this.hands.length = 0;
    this.world.free();
  }
}
