import * as THREE from 'three';
import type RAPIER from 'rapier3d';

import type {Physics} from '../../physics/Physics';
import type {RAPIERCompat} from '../../physics/PhysicsOptions';
import type {SimulatorHandPhysicsOptions} from '../SimulatorOptions';

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

  constructor(
    physics: Physics,
    private handOptions: SimulatorHandPhysicsOptions
  ) {
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
    if (!this.handOptions.enabled) {
      const hand = this.hands[index];
      if (hand?.enabled) {
        hand.enabled = false;
        hand.body.setEnabled(false);
      }
      return;
    }
    let hand = this.hands[index];
    if (!hand) {
      if (!enabled) return;
      this.validateHandOptions();
      this.clampHandToOrigin(position, reentryOrigin);
      handPosition.copy(position);
      const body = this.world.createRigidBody(
        this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          handPosition.x,
          handPosition.y,
          handPosition.z
        )
      );
      const collider = this.world.createCollider(
        this.RAPIER.ColliderDesc.ball(this.handOptions.radius)
          .setFriction(this.handOptions.friction)
          .setRestitution(this.handOptions.restitution),
        body
      );
      const controller = this.world.createCharacterController(
        this.handOptions.contactOffset
      );
      controller.setSlideEnabled(true);
      controller.setApplyImpulsesToDynamicBodies(true);
      controller.setCharacterMass(this.handOptions.mass);
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
        this.clampHandToOrigin(position, reentryOrigin);
        handPosition.copy(position);
        hand.body.setTranslation(handPosition, true);
        hand.body.setEnabled(true);
      } else {
        hand.body.setEnabled(false);
      }
    }
    if (!enabled) return;

    if (this.clampHandToOrigin(position, reentryOrigin)) {
      hand.body.setTranslation(position, true);
      return;
    }

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

  private clampHandToOrigin(position: THREE.Vector3, origin?: THREE.Vector3) {
    if (!origin) return false;
    handInputDelta.copy(position).sub(origin);
    if (handInputDelta.lengthSq() === 0) return false;
    const hit = this.world.castShape(
      origin,
      identityRotation,
      handInputDelta,
      new this.RAPIER.Ball(this.handOptions.radius),
      this.handOptions.contactOffset,
      1,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        if (this.hands.some((hand) => hand?.collider === collider)) {
          return false;
        }
        return collider.parent()?.isFixed() ?? true;
      }
    );
    if (!hit) return false;
    position.copy(origin).addScaledVector(handInputDelta, hit.time_of_impact);
    return true;
  }

  private validateHandOptions() {
    if (this.handOptions.radius <= 0) {
      throw new RangeError('Simulator hand physics radius must be positive.');
    }
    if (
      this.handOptions.contactOffset <= 0 ||
      this.handOptions.contactOffset >= this.handOptions.radius
    ) {
      throw new RangeError(
        'Simulator hand physics contactOffset must be positive and smaller than radius.'
      );
    }
    if (this.handOptions.mass <= 0) {
      throw new RangeError('Simulator hand physics mass must be positive.');
    }
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
