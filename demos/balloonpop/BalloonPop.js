import {
  BoxGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';

import { Audio } from './audio.js';

const COLORS = {
  RED: 0xf5554a,
  BLUE: 0x69d2e7,
  GREEN: 0x64ddac,
  YELLOW: 0xfff7a8,
};

const BALLOON_COLORS = [
  COLORS.RED,
  COLORS.BLUE,
  COLORS.GREEN,
  COLORS.YELLOW,
];

const ARENA_SIZE = 1.25;
const BALLOON_SIZE = 0.1;
const POP_THRESHOLD = 0.05;

const DART_SPEED = -0.5;

const DART_DELAY = 1000;

const DART_GEOMETRY = new BoxGeometry(0.01, 0.01, 0.1);
const DART_MATERIAL = new MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0,
  metalness: 0.5,
});

const BALLOON_GEOMETRY = new SphereGeometry(BALLOON_SIZE, 32, 32);

const audio = new Audio();

class Balloon {
  constructor({ color, position }) {
    this.color = color;
    this.position = position;
    this.object = new Object3D();

    const balloonMaterial = new MeshBasicMaterial({
      color: this.color,
    });

    const balloonMesh = new Mesh(BALLOON_GEOMETRY, balloonMaterial);
    this.object.add(balloonMesh);

    const baseGeometry = new BoxGeometry(0.01, 0.01, 0.01);
    const baseMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    const baseMesh = new Mesh(baseGeometry, baseMaterial);
    baseMesh.position.set(0, -BALLOON_SIZE - 0.005, 0);
    this.object.add(baseMesh);

    this.object.position.copy(this.position);
    this.yOffset = Math.random();

    this.popped = false;
  }

  update(delta) {
    const time = performance.now() / 1000;
    this.object.position.y =
      this.position.y + Math.sin(time + this.yOffset) * 0.1;
  }
}

class Dart {
  constructor({ position, rotation }) {
    this.object = new Mesh(DART_GEOMETRY, DART_MATERIAL);
    this.object.position.copy(position);
    this.object.rotation.copy(rotation);
  }

  update(delta) {
    const Z_AXIS = new Vector3(0, 0, 1);
    const dir = new Vector3();
    dir.copy(Z_AXIS).applyQuaternion(this.object.quaternion);

    this.object.position.add(dir.multiplyScalar(DART_SPEED * delta));
  }
}

export class BalloonPop {
  constructor(xr, { onScore, onPop }) {
    this.xr = xr;
    this.onScore = onScore;
    this.onPop = onPop;

    this.darts = [];
    this.balloons = [];
    this.lastDartTime = 0;

    this.initBalloons();
    this.initDarts();
  }

  initDarts() {
    this.dartsGroup = new Group();
    this.xr.scene.add(this.dartsGroup);

    this.xr.input.addEventListener('selectstart', (e) => {
      const now = performance.now();
      if (now - this.lastDartTime < DART_DELAY) {
        return;
      }
      this.lastDartTime = now;

      const position = this.xr.camera.position.clone();
      const rotation = this.xr.camera.rotation.clone();

      const dart = new Dart({ position, rotation });
      this.darts.push(dart);
      this.dartsGroup.add(dart.object);
      audio.play('throw');
    });
  }

  initBalloons() {
    this.balloonsGroup = new Group();
    this.xr.scene.add(this.balloonsGroup);
    this.addBalloon();
  }

  addBalloon() {
    const color =
      BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];

    const x = MathUtils.randFloat(-ARENA_SIZE / 2, ARENA_SIZE / 2);
    const y = MathUtils.randFloat(
      -ARENA_SIZE / 8,
      ARENA_SIZE / 8
    );
    const z = MathUtils.randFloat(-ARENA_SIZE / 2, ARENA_SIZE / 2);

    const position = new Vector3(x, y, z);
    position.y += this.xr.camera.position.y;
    const balloon = new Balloon({ color, position });
    this.balloons.push(balloon);
    this.balloonsGroup.add(balloon.object);
  }

  update(delta) {
    this.balloons.forEach((balloon) => {
      balloon.update(delta);
    });
    this.darts.forEach((dart) => {
      dart.update(delta);
    });

    this.checkCollisions();
  }

  checkCollisions() {
    this.darts.forEach((dart) => {
      this.balloons.forEach((balloon) => {
        if (balloon.popped) {
          return;
        }
        const distance = dart.object.position.distanceTo(
          balloon.object.position
        );
        if (distance < POP_THRESHOLD) {
          this.pop(balloon);
        }
      });
    });
  }

  pop(balloon) {
    balloon.popped = true;
    this.balloonsGroup.remove(balloon.object);
    audio.play('pop');
    this.addBalloon();
  }
}
