import {describe, it, expect} from 'vitest';

import {ZERO_VISEME} from './BlendshapeReducer';
import {StylizedMouth} from './StylizedMouth';

describe('StylizedMouth', () => {
  it('extends THREE.Object3D so it can be added under a head pivot', () => {
    const m = new StylizedMouth();
    expect(m.isObject3D).toBe(true);
  });

  it('rest pose: setVisemes(ZERO_VISEME) → mouth is a thin closed line (small vertical extent)', () => {
    const m = new StylizedMouth();
    m.setVisemes(ZERO_VISEME);
    // Vertical "extent" in world space = scale.y * geometry radius. For
    // a 0.1 m head that puts the mouth around 2–3 mm tall at rest.
    expect(m.mesh.scale.y).toBeGreaterThan(0);
    expect(m.mesh.scale.y).toBeLessThan(0.25);
  });

  it('jawOpen drives vertical scale upward', () => {
    const m = new StylizedMouth();
    m.setVisemes(ZERO_VISEME);
    const restY = m.mesh.scale.y;
    m.setVisemes({...ZERO_VISEME, jawOpen: 1});
    expect(m.mesh.scale.y).toBeGreaterThan(restY * 3);
  });

  it('oo narrows horizontal scale and pushes mouth forward (toward -z)', () => {
    const m = new StylizedMouth();
    m.setVisemes(ZERO_VISEME);
    const restX = m.mesh.scale.x;
    const restZ = m.mesh.position.z;
    m.setVisemes({...ZERO_VISEME, oo: 1});
    expect(m.mesh.scale.x).toBeLessThan(restX);
    // "Forward" in three.js convention is -Z, so oo should push the
    // mouth's z to a more-negative value.
    expect(m.mesh.position.z).toBeLessThan(restZ);
  });

  it('ee widens horizontal scale (mouth stretched sideways)', () => {
    const m = new StylizedMouth();
    m.setVisemes(ZERO_VISEME);
    const restX = m.mesh.scale.x;
    m.setVisemes({...ZERO_VISEME, ee: 1});
    expect(m.mesh.scale.x).toBeGreaterThan(restX);
  });

  it('dispose() releases geometry and material', () => {
    const m = new StylizedMouth();
    const geom = m.mesh.geometry;
    const mat = m.mesh.material;
    let geomDisposed = false;
    let matDisposed = false;
    geom.addEventListener('dispose', () => (geomDisposed = true));
    (
      mat as {addEventListener: (e: string, cb: () => void) => void}
    ).addEventListener('dispose', () => (matDisposed = true));
    m.dispose();
    expect(geomDisposed).toBe(true);
    expect(matDisposed).toBe(true);
  });
});
