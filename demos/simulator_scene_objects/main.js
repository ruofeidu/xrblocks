import RAPIER from '@dimforge/rapier3d-simd-compat';
import * as THREE from 'three';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';

const status = document.querySelector('#status');
const detectButton = document.querySelector('#detect');
const resetButton = document.querySelector('#reset');
const meshesButton = document.querySelector('#meshes');
const depthCanvas = document.querySelector('#depth-preview');
const depthContext = depthCanvas.getContext('2d');
depthContext.imageSmoothingEnabled = false;

class SimulatorSceneObjectsDemo extends xb.Script {
  dynamicBox = null;
  detectionMarkers = new THREE.Group();
  depthImageData = null;
  lastDepthPreviewTime = 0;

  constructor() {
    super();
    this.detectionMarkers.name = 'Simulator Detection Markers';
  }

  onSimulatorStarted() {
    void this.setupObjects();
  }

  async setupObjects() {
    xb.core.simulator.simulatorScene.add(this.detectionMarkers);
    const floatingTorus = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.3, 0.1, 96, 12),
      new THREE.MeshStandardMaterial({color: 0xffca28, roughness: 0.35})
    );
    const fixedCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 1, 24),
      new THREE.MeshStandardMaterial({color: 0x66bb6a, roughness: 0.55})
    );
    this.dynamicBox = this.createDynamicBox();

    await xb.core.simulator.objects.addObjects([
      {
        id: 'floating-torus',
        object: floatingTorus,
        position: [0.45, 1.2, 0.5],
        physics: false,
        detectObject: true,
        label: 'floating torus',
        data: {physicsMode: false},
      },
      {
        id: 'fixed-cylinder',
        object: fixedCylinder,
        position: [1.6, 0.5, 0.5],
        physics: 'fixed',
        detectObject: true,
        label: 'fixed cylinder',
        data: {physicsMode: 'fixed'},
      },
      this.dynamicDefinition(this.dynamicBox),
    ]);

    this.tintDetectedMeshes();
    detectButton.disabled = false;
    resetButton.disabled = false;
    meshesButton.disabled = false;
    this.updateStatus(
      'Ready. The red box should fall onto the Living Room floor.'
    );
  }

  update() {
    const now = performance.now();
    if (now - this.lastDepthPreviewTime < 100) return;
    this.lastDepthPreviewTime = now;

    const depth = xb.core.simulator.depth;
    if (!depth.depthBuffer?.length) return;
    if (
      depthCanvas.width !== depth.depthWidth ||
      depthCanvas.height !== depth.depthHeight
    ) {
      depthCanvas.width = depth.depthWidth;
      depthCanvas.height = depth.depthHeight;
      this.depthImageData = null;
    }
    this.depthImageData ??= depthContext.createImageData(
      depth.depthWidth,
      depth.depthHeight
    );

    const pixels = this.depthImageData.data;
    for (let i = 0; i < depth.depthBuffer.length; i++) {
      const meters = depth.depthBuffer[i];
      const intensity =
        Number.isFinite(meters) && meters > 0
          ? Math.round(255 * (1 - Math.min(meters / 8, 1)))
          : 0;
      const offset = i * 4;
      pixels[offset] = intensity;
      pixels[offset + 1] = intensity;
      pixels[offset + 2] = intensity;
      pixels[offset + 3] = 255;
    }
    depthContext.putImageData(this.depthImageData, 0, 0);
  }

  createDynamicBox() {
    return new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshStandardMaterial({color: 0xef5350, roughness: 0.45})
    );
  }

  dynamicDefinition(object) {
    return {
      id: 'dynamic-box',
      object,
      position: [2.75, 1.25, 0.5],
      physics: 'dynamic',
      detectObject: true,
      label: 'dynamic box',
      data: {physicsMode: 'dynamic'},
    };
  }

  async resetDynamicBox() {
    xb.core.simulator.objects.removeObjects(['dynamic-box']);
    this.dynamicBox = this.createDynamicBox();
    await xb.core.simulator.objects.addObjects([
      this.dynamicDefinition(this.dynamicBox),
    ]);
    this.tintDetectedMeshes();
    this.clearDetectionMarkers();
    this.updateStatus('Dynamic box removed and re-added at its start pose.');
  }

  tintDetectedMeshes() {
    for (const detectedMesh of xb.world.meshes.xrMeshToThreeMesh.values()) {
      detectedMesh.material.color?.setHex(0x00e5ff);
    }
  }

  async runDetection() {
    const detections = await xb.world.objects.runDetection();
    this.clearDetectionMarkers();
    for (const detection of detections) {
      this.detectionMarkers.add(this.createDetectionMarker(detection));
    }
    this.updateStatus(
      detections.length > 0
        ? detections
            .map(
              (item) =>
                `${item.label}: (${item.position
                  .toArray()
                  .map((value) => value.toFixed(2))
                  .join(', ')})`
            )
            .join('\n')
        : 'No visible simulator objects detected.'
    );
  }

  createDetectionMarker(detection) {
    const marker = new THREE.Group();
    marker.position.copy(detection.position);

    const point = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 12),
      new THREE.MeshBasicMaterial({color: 0xff3dce, depthTest: false})
    );
    point.renderOrder = 1000;
    marker.add(point);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff3dce';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#160012';
    context.font = '600 54px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(detection.label, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({map: texture, depthTest: false})
    );
    label.position.y = 0.13;
    label.scale.set(0.65, 0.16, 1);
    label.renderOrder = 1000;
    marker.add(label);
    return marker;
  }

  clearDetectionMarkers() {
    for (const marker of [...this.detectionMarkers.children]) {
      const point = marker.children[0];
      const label = marker.children[1];
      point.geometry.dispose();
      point.material.dispose();
      label.material.map.dispose();
      label.material.dispose();
      marker.removeFromParent();
    }
  }

  updateStatus(message) {
    const meshCount = xb.world.meshes.xrMeshToThreeMesh.size;
    const objectCount = xb.core.simulator.objects.get().length;
    status.textContent = `${message}\nobjects: ${objectCount} · world meshes: ${meshCount}`;
  }
}

const demo = new SimulatorSceneObjectsDemo();
detectButton.addEventListener('click', () => void demo.runDetection());
resetButton.addEventListener('click', () => void demo.resetDynamicBox());
meshesButton.addEventListener('click', () => {
  xb.world.meshes.visible = !xb.world.meshes.visible;
});

const options = new xb.Options();
options.formFactor = 'desktop';
options.setAppTitle('Simulator Scene Objects');
options.physics.RAPIER = RAPIER;
options.enableDepth();
options.world.enableMeshDetection();
options.world.meshes.showDebugVisualizations = true;
options.enableObjectDetection();
options.world.objects.simulatorOverride = true;
options.simulator.handPhysics.enabled = true;
options.simulator.environments = [
  {
    name: 'Living Room Object Test',
    manifestPath: './scene.json?demo=simulator-scene-objects',
  },
];
options.simulator.initialCameraPosition = {x: 0, y: 1.5, z: 3};
options.simulator.defaultMode = xb.SimulatorMode.USER;

xb.add(demo);
await xb.init(options);
