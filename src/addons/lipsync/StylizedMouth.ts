import * as THREE from 'three';

import type {VisemeWeights} from './BlendshapeReducer';

export interface StylizedMouthOptions {
  /**
   * Approximate radius (metres) of the host head this mouth attaches to.
   * Used to scale the mouth geometry and place it at the head surface.
   * Defaults to 0.1, matching netblocks `RemoteUserAvatar`'s head sphere.
   */
  headRadius?: number;
}

/**
 * StylizedMouth: a tiny three.js `Object3D` holding a single dark mouth
 * mesh that deforms by scale + position changes in response to viseme
 * weights. Owns its own geometry and material; `dispose()` releases both.
 *
 * Geometry is a unit sphere flattened to a thin oval at rest. The mouth
 * sits a hair forward of its parent's origin so it doesn't z-fight when
 * parented to a head sphere.
 *
 * Intentionally minimal — the goal is "broad-strokes mouth motion you can
 * read across a room". For a more detailed mouth, callers can hide the
 * default mesh (`mouth.mesh.visible = false`) and parent their own
 * morph-target driven mesh, then watch the `visemes` field each frame.
 */
export class StylizedMouth extends THREE.Object3D {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly headRadius: number;

  /** Last viseme weights applied; useful for testing and debugging. */
  visemes: VisemeWeights = {
    jawOpen: 0,
    aa: 0,
    oo: 0,
    oh: 0,
    ee: 0,
    consonant: 0,
  };

  constructor(opts: StylizedMouthOptions = {}) {
    super();
    this.headRadius = opts.headRadius ?? 0.1;
    // Mouth base geometry scaled to ~40% of head width at rest.
    const baseR = this.headRadius * 0.08;
    const geom = new THREE.SphereGeometry(baseR, 16, 12);
    const mat = new THREE.MeshBasicMaterial({color: 0x111111});
    this.mesh = new THREE.Mesh(geom, mat);
    this.add(this.mesh);
    // Apply rest pose so scale + position are deterministic.
    this.setVisemes(this.visemes);
  }

  /**
   * Drive the mouth geometry from a viseme weight set. Idempotent and
   * cheap; safe to call every frame.
   */
  setVisemes(v: VisemeWeights): void {
    this.visemes = v;
    const openAmount = v.jawOpen * 0.9 + v.aa * 0.4 + v.oh * 0.55;
    const horizontal =
      1 + v.ee * 0.55 + v.consonant * 0.25 - v.oo * 0.65 - v.oh * 0.22;
    // Small base vertical so the rest pose is a thin closed line, not a
    // permanently open ring.
    const verticalBase = 0.04;
    const vertical = verticalBase + openAmount * 0.85 + v.oo * 0.09;
    // Horizontal scale is "wider/narrower". Vertical is "more/less open".
    // Depth is small but a touch larger for /oo/ to round the mouth.
    const depth = 1.2 + v.oo * 1.5;
    // Multiply by 2 because the geometry is half the head's diameter
    // tall by default — viseme units are normalised so the maxima reach
    // ~80% of head height when fully open.
    this.mesh.scale.set(horizontal * 2, vertical * 4, depth);
    // Place the mouth just in FRONT of the head — three.js / WebXR
    // convention puts forward in the local -Z direction (cameras and
    // head poses face -Z). The mouth sits at z = -headRadius * 1.02,
    // pushed slightly further forward by /oo/ and /oh/.
    this.mesh.position.z =
      -(
        this.headRadius * 1.02 +
        this.headRadius * (v.oo * 0.12 + v.oh * 0.06)
      );
    this.mesh.position.y =
      -this.headRadius * 0.35 -
      this.headRadius * (v.aa * 0.06 + openAmount * 0.06);
  }

  /** Free the geometry and material backing the mouth mesh. */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
