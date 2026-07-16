import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';

import {ResolvedSimulatorSceneManifest} from './SimulatorEnvironmentManifest';

export class SimulatorScene extends THREE.Scene {
  gltf?: GLTF;
  environmentRoot?: THREE.Group;
  objectsGroup?: THREE.Group;

  constructor() {
    super();
  }

  init() {
    this.addLights();
  }

  createEnvironmentRoot(manifest: ResolvedSimulatorSceneManifest) {
    const root = new THREE.Group();
    root.name = 'Simulator Environment';
    if (manifest.position) root.position.fromArray(manifest.position);
    if (manifest.quaternion) root.quaternion.fromArray(manifest.quaternion);
    if (manifest.scale) root.scale.fromArray(manifest.scale);
    const objects = new THREE.Group();
    objects.name = 'Simulator Objects';
    root.add(objects);
    return {root, objects};
  }

  commitEnvironment(root: THREE.Group, objects: THREE.Group, gltf?: GLTF) {
    const previousRoot = this.environmentRoot;
    this.add(root);
    this.environmentRoot = root;
    this.objectsGroup = objects;
    this.gltf = gltf;
    previousRoot?.removeFromParent();
    return previousRoot;
  }

  clearEnvironment() {
    this.environmentRoot?.removeFromParent();
    this.environmentRoot = undefined;
    this.objectsGroup = undefined;
    this.gltf = undefined;
  }

  addLights() {
    this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
  }
}
