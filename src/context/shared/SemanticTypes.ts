export type Vec2Tuple = [number, number];
export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

export type SemanticSource = 'xrblocks' | 'uiblocks' | 'three' | 'app';

export type SemanticViewOcclusion =
  | 'none'
  | 'occluded'
  | 'outOfFrame'
  | 'notRendered';

export interface SemanticBounds {
  center: Vec3Tuple;
  size: Vec3Tuple;
}

export interface SemanticViewData {
  rendered: boolean;
  inFrame: boolean;
  inLineOfSight: boolean;
  occlusion: SemanticViewOcclusion;
  screenCenter?: Vec2Tuple;
  screenBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SemanticNode {
  id: string;
  role: string;
  name: string;
  visible: boolean;
  position: Vec3Tuple;
  children: string[];
  parentId?: string;
  objectId?: number;
  source?: SemanticSource;
  type?: string;
  text?: string;
  traits?: string[];
  disabled?: boolean;
  selected?: boolean;
  hovered?: boolean;
  bounds?: SemanticBounds;
  view?: SemanticViewData;
}

export interface SemanticTree {
  snapshotId: string;
  capturedAt: number;
  rootIds: string[];
  nodes: Record<string, SemanticNode>;
}

export type VisibleObjectsContext = SemanticTree;

export interface SetOfMark {
  label: string;
  nodeId: string;
  role: string;
  name: string;
  screenCenter: Vec2Tuple;
  screenBounds?: SemanticViewData['screenBounds'];
}

export interface SetOfMarkContext {
  snapshotId: string;
  capturedAt: number;
  image: string;
  marks: SetOfMark[];
}

export type SemanticMetadata = {
  role?: string;
  name?: string;
  text?: string;
  traits?: string[];
  hidden?: boolean;
  disabled?: boolean;
  source?: SemanticSource;
};
