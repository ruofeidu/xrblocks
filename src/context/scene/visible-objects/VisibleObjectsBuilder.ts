import * as THREE from 'three';

import {SemanticTreeInternal} from '../semantic-tree/SemanticTreeBuilder';
import {
  getObjectBounds,
  isDescendantOf,
  isObjectVisible,
  isSemanticInternalObject,
} from '../../shared/SemanticObjectUtils';
import {
  SemanticNode,
  SemanticTree,
  SemanticViewData,
} from '../../shared/SemanticTypes';

const tempCenter = new THREE.Vector3();
const tempProjection = new THREE.Vector3();
const tempCameraPosition = new THREE.Vector3();
const tempDirection = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

export function createVisibleObjectsContext({
  scene,
  camera,
  semanticTree,
}: {
  scene: THREE.Scene;
  camera: THREE.Camera;
  semanticTree: SemanticTreeInternal;
}): SemanticTree {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

  const nodes = {...semanticTree.tree.nodes};
  const raycastTargets = scene.children.filter(
    (child) => child.visible && !isSemanticInternalObject(child)
  );
  for (const nodeId of Object.keys(nodes)) {
    const node = nodes[nodeId];
    const object = semanticTree.nodeObjects.get(nodeId);
    nodes[nodeId] = {
      ...node,
      view: object
        ? createSemanticViewData({
            camera,
            node,
            object,
            raycastTargets,
          })
        : createNotRenderedViewData(),
    };
  }

  return {
    ...semanticTree.tree,
    nodes,
  };
}

function createSemanticViewData({
  camera,
  node,
  object,
  raycastTargets,
}: {
  camera: THREE.Camera;
  node: SemanticNode;
  object: THREE.Object3D;
  raycastTargets: THREE.Object3D[];
}): SemanticViewData {
  if (!node.visible || !isObjectVisible(object)) {
    return createNotRenderedViewData();
  }

  const box = getObjectBounds(object);
  const center =
    box?.getCenter(tempCenter) ?? object.getWorldPosition(tempCenter);
  const projected = projectWorldPoint(center, camera);
  const inFrame = isProjectedInFrame(projected);
  if (!inFrame) {
    return {
      rendered: true,
      inFrame: false,
      inLineOfSight: false,
      occlusion: 'outOfFrame',
      ...projectedToScreenCoordinates(projected),
    };
  }

  const inLineOfSight = isObjectInLineOfSight({
    camera,
    object,
    targetPoint: center,
    raycastTargets,
  });

  return {
    rendered: true,
    inFrame: true,
    inLineOfSight,
    occlusion: inLineOfSight ? 'none' : 'occluded',
    ...projectedToScreenCoordinates(projected),
  };
}

function createNotRenderedViewData(): SemanticViewData {
  return {
    rendered: false,
    inFrame: false,
    inLineOfSight: false,
    occlusion: 'notRendered',
  };
}

function projectWorldPoint(point: THREE.Vector3, camera: THREE.Camera) {
  return tempProjection
    .copy(point)
    .applyMatrix4(camera.matrixWorldInverse)
    .applyMatrix4(camera.projectionMatrix)
    .clone();
}

function isProjectedInFrame(projected: THREE.Vector3): boolean {
  return (
    projected.x >= -1 &&
    projected.x <= 1 &&
    projected.y >= -1 &&
    projected.y <= 1 &&
    projected.z >= -1 &&
    projected.z <= 1
  );
}

function projectedToScreenCoordinates(projected: THREE.Vector3) {
  return {
    x: (projected.x + 1) / 2,
    y: (1 - projected.y) / 2,
  };
}

function isObjectInLineOfSight({
  camera,
  object,
  targetPoint,
  raycastTargets,
}: {
  camera: THREE.Camera;
  object: THREE.Object3D;
  targetPoint: THREE.Vector3;
  raycastTargets: THREE.Object3D[];
}): boolean {
  camera.getWorldPosition(tempCameraPosition);
  tempDirection.copy(targetPoint).sub(tempCameraPosition);
  const targetDistance = tempDirection.length();
  if (targetDistance <= 0) {
    return true;
  }

  raycaster.set(tempCameraPosition, tempDirection.normalize());
  raycaster.near = 0;
  raycaster.far = targetDistance;

  const hits = raycaster.intersectObjects(raycastTargets, true);
  const occludingHit = hits.find((hit) => {
    if (hit.distance >= targetDistance - 1e-4) {
      return false;
    }
    if (isSemanticInternalObject(hit.object)) {
      return false;
    }
    if (
      isDescendantOf(hit.object, object) ||
      isDescendantOf(object, hit.object)
    ) {
      return false;
    }
    return isObjectVisible(hit.object);
  });

  return occludingHit === undefined;
}
