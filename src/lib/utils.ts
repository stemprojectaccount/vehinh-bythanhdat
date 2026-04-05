import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function distance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

export function distancePointToLine(pt: {x: number, y: number}, p1: {x:number, y:number}, dx: number, dy: number) {
  const len = Math.hypot(dx, dy);
  if (len === 0) return distance(pt, p1);
  const nx = -dy / len;
  const ny = dx / len;
  return Math.abs((pt.x - p1.x) * nx + (pt.y - p1.y) * ny);
}

export function distancePointToSegment(pt: {x: number, y: number}, p1: {x:number, y:number}, p2: {x:number, y:number}) {
  const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
  if (l2 === 0) return distance(pt, p1);
  let t = ((pt.x - p1.x) * (p2.x - p1.x) + (pt.y - p1.y) * (p2.y - p1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(pt, { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
}

export function distancePointToRay(pt: {x: number, y: number}, p1: {x:number, y:number}, dx: number, dy: number) {
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return distance(pt, p1);
  let t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / l2;
  t = Math.max(0, t);
  return distance(pt, { x: p1.x + t * dx, y: p1.y + t * dy });
}

export function calculateAngle(p1: {x:number, y:number}, p2: {x:number, y:number}, p3: {x:number, y:number}) {
  const a = distance(p2, p3);
  const b = distance(p1, p3);
  const c = distance(p1, p2);
  if (a === 0 || c === 0) return 0;
  const cosB = (a*a + c*c - b*b) / (2 * a * c);
  const clampedCosB = Math.max(-1, Math.min(1, cosB));
  return Math.acos(clampedCosB) * (180 / Math.PI);
}

export function calculatePolygonArea(points: {x: number, y: number}[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

export function calculatePolygonCentroid(points: {x: number, y: number}[]): {x: number, y: number} {
  if (points.length === 0) return {x: 0, y: 0};
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return { x: cx, y: cy };
}

export function getNextPointName(existingNames: string[]) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let i = 0;
  while (true) {
    for (const char of alphabet) {
      const name = i === 0 ? char : `${char}${i}`;
      if (!existingNames.includes(name)) {
        return name;
      }
    }
    i++;
  }
}
