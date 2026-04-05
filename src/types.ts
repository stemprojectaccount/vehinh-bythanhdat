export type PointDef =
  | { type: 'free'; x: number; y: number }
  | { type: 'midpoint'; p1: string; p2: string }
  | { type: 'centroid'; p1: string; p2: string; p3: string };

export type Point = {
  id: string;
  name: string;
  color?: string;
} & PointDef;

export type LineType = 'line' | 'segment' | 'ray' | 'perpendicular' | 'parallel' | 'bisector' | 'median' | 'perp_bisector';

export type Line = {
  id: string;
  type: LineType;
  p1?: string;
  p2?: string;
  p3?: string;
  point?: string;
  baseLine?: string;
  color?: string;
};

export type Circle = { id: string; center: string; p2: string; color?: string; };
export type Polygon = { id: string; points: string[]; color?: string; };
export type TextLabel = { id: string; x: number; y: number; text: string; color?: string; rotation?: number; };
export type Group = { id: string; objectIds: string[]; };

export type Measurement =
  | { id: string; type: 'distance'; p1: string; p2: string }
  | { id: string; type: 'angle'; p1: string; p2: string; p3: string }
  | { id: string; type: 'area'; polygonId: string };

export type ToolType =
  | 'select'
  | 'point'
  | 'midpoint'
  | 'centroid'
  | 'segment'
  | 'line'
  | 'ray'
  | 'perpendicular'
  | 'parallel'
  | 'bisector'
  | 'perp_bisector'
  | 'median'
  | 'circle'
  | 'polygon'
  | 'measure_distance'
  | 'measure_angle'
  | 'measure_area'
  | 'delete'
  | 'text';
