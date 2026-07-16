import type RAPIER from 'rapier3d';

import type {Physics} from '../../physics/Physics';
import type {RAPIERCompat} from '../../physics/PhysicsOptions';

/** Physics world isolated to the simulated physical environment. */
export class SimulatorPhysics {
  readonly RAPIER: RAPIERCompat;
  readonly world: RAPIER.World;

  constructor(physics: Physics) {
    this.RAPIER = physics.RAPIER;
    this.world = new this.RAPIER.World(
      physics.options?.gravity ?? {x: 0, y: -9.81, z: 0}
    );
    this.world.timestep = physics.timestep;
  }

  step() {
    this.world.step();
  }

  dispose() {
    this.world.free();
  }
}
