import * as THREE from 'three';
import type RAPIER from 'rapier3d';

import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {ModelLoader} from '../../utils/ModelLoader';
import type {DetectedMesh} from '../../world/mesh/DetectedMesh';
import {
  SimulatorObjectDefinition,
  SimulatorPhysicsMode,
} from './SimulatorEnvironmentManifest';
import {geometryVertices, mergeObjectGeometry} from './SimulatorGeometry';
import type {SimulatorPhysics} from './SimulatorPhysics';

export interface SimulatorObject {
  id: string;
  object: THREE.Object3D;
  definition: SimulatorObjectDefinition;
}

/** @internal */
interface SimulatorObjectRecord extends SimulatorObject {
  rigidBody?: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  detectedMesh?: DetectedMesh;
  preserveWorldTransform: boolean;
}

/** @internal */
export interface PreparedSimulatorObjects {
  records: SimulatorObjectRecord[];
  group: THREE.Group;
  nextId: number;
}

const worldPosition = new THREE.Vector3();
const worldQuaternion = new THREE.Quaternion();
const localPosition = new THREE.Vector3();
const parentQuaternion = new THREE.Quaternion();

export interface SimulatorObjects {
  addObjects(
    definitions: SimulatorObjectDefinition[],
    options?: {baseUrl?: string}
  ): Promise<SimulatorObject[]>;
  get(ids?: string[]): SimulatorObject[];
  removeObjects(ids: string[]): this;
  clear(): this;
}

/** @internal */
export class SimulatorObjectsManager implements SimulatorObjects {
  onChanged?: () => void;
  private records = new Map<string, SimulatorObjectRecord>();
  private nextId = 1;
  private group?: THREE.Group;
  private physics?: SimulatorPhysics;
  private renderer?: THREE.WebGLRenderer;

  init(renderer: THREE.WebGLRenderer, physics?: SimulatorPhysics) {
    this.renderer = renderer;
    this.physics = physics;
  }

  async prepareObjects(
    definitions: SimulatorObjectDefinition[],
    baseUrl = document.baseURI,
    {replaceExisting = false}: {replaceExisting?: boolean} = {}
  ): Promise<PreparedSimulatorObjects> {
    const assignedIds = new Set(replaceExisting ? [] : this.records.keys());
    const assignedObjects = new Set<THREE.Object3D>(
      replaceExisting
        ? []
        : Array.from(this.records.values(), (record) => record.object)
    );
    let nextId = replaceExisting ? 1 : this.nextId;
    const normalized = definitions.map((definition) => {
      let id = definition.id;
      while (!id) {
        const candidate = `simulator-object-${nextId++}`;
        if (!assignedIds.has(candidate)) id = candidate;
      }
      if (assignedIds.has(id)) {
        throw new Error(`Simulator object id '${id}' is already in use.`);
      }
      assignedIds.add(id);
      if (!!definition.assetPath === !!definition.object) {
        throw new Error(
          `Simulator object '${id}' must provide exactly one of assetPath or object.`
        );
      }
      if (definition.object && assignedObjects.has(definition.object)) {
        throw new Error(
          `Simulator object '${id}' uses the same runtime object more than once.`
        );
      }
      if (definition.object) assignedObjects.add(definition.object);
      if (definition.detectObject && !definition.label) {
        throw new Error(
          `Simulator object '${id}' requires label when detectObject is true.`
        );
      }
      const physics = definition.physics ?? false;
      if (physics && !this.physics) {
        throw new Error(
          `Simulator object '${id}' requires physics, but XR Blocks physics is not enabled.`
        );
      }
      return {definition, id};
    });

    const group = new THREE.Group();
    group.name = 'Simulator Objects';
    const settled = await Promise.allSettled(
      normalized.map(async ({definition, id}) => {
        if (definition.object)
          return {definition, id, object: definition.object};
        const assetUrl = new URL(definition.assetPath!, baseUrl).href;
        const gltf = await new ModelLoader().loadGLTF({
          url: assetUrl,
          renderer: this.renderer,
        });
        return {definition, id, object: gltf.scene};
      })
    );
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failure) {
      for (const result of settled) {
        if (result.status === 'fulfilled' && !result.value.definition.object) {
          disposeObjectTree(result.value.object);
        }
      }
      throw failure.reason;
    }
    const loaded = settled.map(
      (result) =>
        (
          result as PromiseFulfilledResult<{
            definition: SimulatorObjectDefinition;
            id: string;
            object: THREE.Object3D;
          }>
        ).value
    );
    for (const {definition, id, object} of loaded) {
      const physicsGeometry =
        (definition.physics ?? false) ? mergeObjectGeometry(object) : undefined;
      if ((definition.physics ?? false) && !physicsGeometry) {
        for (const entry of loaded) {
          if (!entry.definition.object) disposeObjectTree(entry.object);
        }
        throw new Error(
          `Simulator object '${id}' has no mesh geometry for physics.`
        );
      }
      physicsGeometry?.dispose();
    }
    const records = loaded.map(({definition, id, object}) => {
      const hasTransform =
        !!definition.position || !!definition.quaternion || !!definition.scale;
      object.name ||= id;
      if (definition.position) object.position.fromArray(definition.position);
      if (definition.quaternion)
        object.quaternion.fromArray(definition.quaternion);
      if (definition.scale) object.scale.fromArray(definition.scale);
      object.visible = definition.visible ?? true;
      return {
        id,
        object,
        definition: {...definition, id},
        colliders: [],
        preserveWorldTransform: !!definition.object?.parent && !hasTransform,
      } satisfies SimulatorObjectRecord;
    });
    return {records, group, nextId};
  }

  activatePrepared(prepared: PreparedSimulatorObjects, group?: THREE.Group) {
    const targetGroup = group ?? prepared.group;
    for (const record of prepared.records) {
      if (record.object.parent !== targetGroup) {
        if (record.preserveWorldTransform) targetGroup.attach(record.object);
        else targetGroup.add(record.object);
      }
      this.createPhysics(record);
      this.records.set(record.id, record);
    }
    this.group = targetGroup;
    this.nextId = prepared.nextId;
    return prepared.records as SimulatorObject[];
  }

  setEnvironmentGroup(group: THREE.Group) {
    this.group = group;
    this.nextId = 1;
  }

  async addObjects(
    definitions: SimulatorObjectDefinition[],
    {baseUrl = document.baseURI}: {baseUrl?: string} = {}
  ) {
    if (!this.group) {
      throw new Error('Simulator environment is not ready.');
    }
    const prepared = await this.prepareObjects(definitions, baseUrl);
    try {
      const activated = this.activatePrepared(prepared, this.group);
      if (activated.length > 0) this.onChanged?.();
      return activated;
    } catch (error) {
      for (const record of prepared.records) {
        this.disposeRecord(record);
        this.records.delete(record.id);
      }
      throw error;
    }
  }

  get(ids?: string[]) {
    if (!ids) return Array.from(this.records.values()) as SimulatorObject[];
    return ids
      .map((id) => this.records.get(id))
      .filter((record): record is SimulatorObjectRecord => !!record);
  }

  getMeshRecords(): SimulatorObject[] {
    return Array.from(this.records.values());
  }

  setDetectedMeshes(meshes: Map<string, DetectedMesh>) {
    for (const record of this.records.values()) {
      record.detectedMesh = meshes.get(record.id);
    }
  }

  removeObjects(ids: string[]) {
    const changed = this.removeRecords(ids);
    if (changed) this.onChanged?.();
    return this;
  }

  private removeRecords(ids: string[]) {
    let changed = false;
    for (const id of ids) {
      const record = this.records.get(id);
      if (!record) continue;
      this.disposeRecord(record);
      this.records.delete(id);
      changed = true;
    }
    return changed;
  }

  clear() {
    const changed = this.removeRecords(Array.from(this.records.keys()));
    if (changed) this.onChanged?.();
    return this;
  }

  reset() {
    this.removeRecords(Array.from(this.records.keys()));
    this.nextId = 1;
  }

  physicsStep() {
    for (const record of this.records.values()) {
      if (record.definition.physics !== 'dynamic' || !record.rigidBody)
        continue;
      const translation = record.rigidBody.translation();
      const rotation = record.rigidBody.rotation();
      worldPosition.set(translation.x, translation.y, translation.z);
      worldQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      const parent = record.object.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        localPosition.copy(worldPosition);
        parent.worldToLocal(localPosition);
        parent.getWorldQuaternion(parentQuaternion).invert();
        record.object.position.copy(localPosition);
        record.object.quaternion.copy(
          parentQuaternion.multiply(worldQuaternion)
        );
      } else {
        record.object.position.copy(worldPosition);
        record.object.quaternion.copy(worldQuaternion);
      }
      record.object.updateWorldMatrix(true, true);
      if (record.detectedMesh) {
        record.detectedMesh.position.copy(worldPosition);
        record.detectedMesh.quaternion.copy(worldQuaternion);
        record.detectedMesh.updateWorldMatrix(true, true);
        const virtualBody = record.detectedMesh.getRigidBody;
        virtualBody?.setTranslation(worldPosition, false);
        virtualBody?.setRotation(worldQuaternion, false);
      }
    }
  }

  private createPhysics(record: SimulatorObjectRecord) {
    const mode = record.definition.physics ?? false;
    if (!mode || !this.physics) return;
    const geometry = mergeObjectGeometry(record.object);
    if (!geometry) {
      throw new Error(
        `Simulator object '${record.id}' has no mesh geometry for physics.`
      );
    }
    record.object.getWorldPosition(worldPosition);
    record.object.getWorldQuaternion(worldQuaternion);
    const bodyDesc = this.createBodyDesc(mode)
      .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
      .setRotation(worldQuaternion);
    const body = this.physics.world.createRigidBody(bodyDesc);
    const vertices = geometryVertices(geometry);
    let colliderDesc = this.physics.RAPIER.ColliderDesc.convexHull(vertices);
    if (!colliderDesc) {
      geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      geometry.boundingBox!.getSize(size).multiplyScalar(0.5);
      colliderDesc = this.physics.RAPIER.ColliderDesc.cuboid(
        Math.max(size.x, 0.001),
        Math.max(size.y, 0.001),
        Math.max(size.z, 0.001)
      );
    }
    record.rigidBody = body;
    record.colliders.push(
      this.physics.world.createCollider(colliderDesc, body)
    );
    geometry.dispose();
  }

  private createBodyDesc(mode: Exclude<SimulatorPhysicsMode, false>) {
    return mode === 'dynamic'
      ? this.physics!.RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true)
      : this.physics!.RAPIER.RigidBodyDesc.fixed();
  }

  private disposeRecord(record: SimulatorObjectRecord) {
    if (this.physics && record.rigidBody) {
      this.physics.world.removeRigidBody(record.rigidBody);
      record.rigidBody = undefined;
      record.colliders.length = 0;
    }
    record.object.removeFromParent();
    disposeObjectTree(record.object);
  }

  dispose() {
    this.reset();
    this.onChanged = undefined;
    this.group = undefined;
    this.physics = undefined;
    this.renderer = undefined;
  }
}
