import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Circle as KonvaCircle, Line as KonvaLine, Text as KonvaText, Group, Arc as KonvaArc, Rect as KonvaRect } from 'react-konva';
import { Point, Line, Circle, Polygon, Measurement, ToolType, LineType, TextLabel, Group as GroupType } from './types';
import { generateId, distance, distancePointToLine, distancePointToSegment, distancePointToRay, getNextPointName, calculateAngle, cn, calculatePolygonArea, calculatePolygonCentroid, getIncircle, calculatePolygonPerimeter } from './lib/utils';
import { MousePointer2, CircleDot, Minus, ArrowRightLeft, ArrowUpRight, Target, Equal, Split, Circle as CircleIcon, Hexagon, Trash2, Undo2, Crosshair, Ruler, PieChart, Eraser, Type, MoveDiagonal, Triangle, ArrowDownToLine, FoldVertical, SquareDashed, Grid, X, Palette, ChevronDown, Group as GroupIcon, Ungroup, Settings, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Route } from 'lucide-react';

const SNAP_DISTANCE = 15;

export default function App() {
  const [points, setPoints] = useState<Point[]>([{ id: generateId(), name: 'A', x: 400, y: 300, type: 'free' }]);
  const [lines, setLines] = useState<Line[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [textLabels, setTextLabels] = useState<TextLabel[]>([]);
  
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [editingText, setEditingText] = useState<TextLabel | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isRulerVisible, setIsRulerVisible] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(20);
  const [gridColor, setGridColor] = useState('#cbd5e1');
  const [showGridSettings, setShowGridSettings] = useState(false);
  const [rulerState, setRulerState] = useState({ x: 400, y: 300, rotation: 0, length: 600 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [dragHandlePos, setDragHandlePos] = useState<{x: number, y: number} | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const rotationStateRef = useRef<{
    center: {x: number, y: number},
    initialAngle: number,
    initialPoints: Record<string, {x: number, y: number}>,
    initialTextRotations: Record<string, number>,
    initialTextPositions: Record<string, {x: number, y: number}>,
    freePointIds: string[],
    textIds: string[]
  } | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.tool-group')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const saveHistory = () => {
    setHistory([...history, { points, lines, circles, polygons, measurements, textLabels, groups }]);
  };
  
  const undo = () => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setPoints(lastState.points);
    setLines(lastState.lines);
    setCircles(lastState.circles);
    setPolygons(lastState.polygons);
    setMeasurements(lastState.measurements || []);
    setTextLabels(lastState.textLabels || []);
    setGroups(lastState.groups || []);
    setHistory(history.slice(0, -1));
    setSelectedIds([]);
    setEditingText(null);
    setSelectedObjectIds([]);
  };

  const clearAll = () => {
    saveHistory();
    setPoints([]);
    setLines([]);
    setCircles([]);
    setPolygons([]);
    setMeasurements([]);
    setTextLabels([]);
    setGroups([]);
    setSelectedIds([]);
    setEditingText(null);
    setSelectedObjectIds([]);
  };

  // Evaluation Engine
  const evalPoints: Record<string, {x: number, y: number}> = {};
  points.forEach(p => {
    if (p.type === 'free') evalPoints[p.id] = { x: p.x!, y: p.y! };
  });

  const evalLines: Record<string, {p1: {x:number, y:number}, dx: number, dy: number, type: LineType, p2?: {x:number, y:number}}> = {};

  let globalChanged = true;
  let globalPasses = 0;
  while(globalChanged && globalPasses < 10) {
      globalChanged = false;

      points.forEach(p => {
          if (evalPoints[p.id]) return;
          if (p.type === 'midpoint') {
              const p1 = evalPoints[p.p1!];
              const p2 = evalPoints[p.p2!];
              if (p1 && p2) { evalPoints[p.id] = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 }; globalChanged = true; }
          } else if (p.type === 'centroid') {
              const p1 = evalPoints[p.p1!];
              const p2 = evalPoints[p.p2!];
              const p3 = evalPoints[p.p3!];
              if (p1 && p2 && p3) { evalPoints[p.id] = { x: (p1.x + p2.x + p3.x)/3, y: (p1.y + p2.y + p3.y)/3 }; globalChanged = true; }
          } else if (p.type === 'intersection') {
              const l1 = evalLines[p.line1!];
              const l2 = evalLines[p.line2!];
              if (l1 && l2) {
                  const det = l1.dx * l2.dy - l1.dy * l2.dx;
                  if (Math.abs(det) > 1e-6) {
                      const u = ((l2.p1.x - l1.p1.x) * l2.dy - (l2.p1.y - l1.p1.y) * l2.dx) / det;
                      evalPoints[p.id] = { x: l1.p1.x + u * l1.dx, y: l1.p1.y + u * l1.dy };
                      globalChanged = true;
                  }
              }
          }
      });

      lines.forEach(l => {
          if (evalLines[l.id]) return;
          if (l.type === 'segment' || l.type === 'line' || l.type === 'ray') {
              const p1 = evalPoints[l.p1!];
              const p2 = evalPoints[l.p2!];
              if (p1 && p2) {
                  evalLines[l.id] = { p1, p2, dx: p2.x - p1.x, dy: p2.y - p1.y, type: l.type };
                  globalChanged = true;
              }
          } else if (l.type === 'perpendicular' || l.type === 'parallel') {
              const pt = evalPoints[l.point!];
              const base = evalLines[l.baseLine!];
              if (pt && base) {
                  let dx = base.dx;
                  let dy = base.dy;
                  if (l.type === 'perpendicular') {
                      dx = -base.dy;
                      dy = base.dx;
                      if (l.trimmed) {
                          const dxB = base.dx, dyB = base.dy, pB = base.p1;
                          const det = dx * dyB - dy * dxB;
                          if (Math.abs(det) > 1e-6) {
                              const u = ((pB.x - pt.x) * dyB - (pB.y - pt.y) * dxB) / det;
                              const ix = pt.x + u * dx;
                              const iy = pt.y + u * dy;
                              evalLines[l.id] = { p1: pt, p2: {x: ix, y: iy}, dx, dy, type: 'segment' };
                              globalChanged = true;
                              return;
                          }
                      }
                  }
                  evalLines[l.id] = { p1: pt, dx, dy, type: 'line' };
                  globalChanged = true;
              }
          } else if (l.type === 'bisector') {
              const p1 = evalPoints[l.p1!];
              const p2 = evalPoints[l.p2!]; // vertex
              const p3 = evalPoints[l.p3!];
              if (p1 && p2 && p3) {
                  const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                  const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
                  let diff = a2 - a1;
                  if (diff < 0) diff += 2 * Math.PI;
                  // Handle interior vs exterior by choosing the correct bisector
                  // If difference > PI, the interior angle bisector is actually rotated by PI
                  let bisectAngle = a1 + diff / 2;
                  if (diff > Math.PI) {
                     bisectAngle += Math.PI;
                  }
                  const dx = Math.cos(bisectAngle);
                  const dy = Math.sin(bisectAngle);
                  
                  if (l.trimmed) {
                      const dxB = p3.x - p1.x, dyB = p3.y - p1.y, pB = p1;
                      const det = dx * dyB - dy * dxB;
                      if (Math.abs(det) > 1e-6) {
                          const u = ((pB.x - p2.x) * dyB - (pB.y - p2.y) * dxB) / det;
                          const ix = p2.x + u * dx;
                          const iy = p2.y + u * dy;
                          evalLines[l.id] = { p1: p2, p2: {x: ix, y: iy}, dx, dy, type: 'segment' };
                          globalChanged = true;
                          return;
                      }
                  }
                  
                  evalLines[l.id] = { p1: p2, dx, dy, type: 'ray' };
                  globalChanged = true;
              }
          } else if (l.type === 'median') {
              const p1 = evalPoints[l.p1!];
              const p2 = evalPoints[l.p2!];
              const p3 = evalPoints[l.p3!];
              if (p1 && p2 && p3) {
                  const midX = (p2.x + p3.x) / 2;
                  const midY = (p2.y + p3.y) / 2;
                  evalLines[l.id] = { p1, dx: midX - p1.x, dy: midY - p1.y, type: 'line' };
                  globalChanged = true;
              }
          } else if (l.type === 'perp_bisector') {
              const p1 = evalPoints[l.p1!];
              const p2 = evalPoints[l.p2!];
              if (p1 && p2) {
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2;
                  evalLines[l.id] = { p1: {x: midX, y: midY}, dx: p1.y - p2.y, dy: p2.x - p1.x, type: 'line' };
                  globalChanged = true;
              }
          } else if (l.type === 'tangent') {
              const pt = evalPoints[l.point!];
              const c = circles.find(circ => circ.id === l.circle!);
              if (pt && c) {
                  let center: {x: number, y: number} | undefined;
                  let radius = 0;
                  if (c.type === 'inscribed') {
                      const poly = polygons.find(p => p.id === c.polygonId);
                      if (poly) {
                          const pts = poly.points.map(pid => evalPoints[pid]).filter(Boolean);
                          if (pts.length >= 3) {
                              const incircle = getIncircle(pts as any);
                              if (incircle) {
                                  center = incircle.center;
                                  radius = incircle.radius;
                              }
                          }
                      }
                  } else {
                      center = evalPoints[c.center!];
                      const p2 = evalPoints[c.p2!];
                      if (center && p2) {
                          radius = distance(center, p2);
                      }
                  }

                  if (center && radius > 0) {
                      const dist = distance(pt, center);
                      // floating point tolerance for equality
                      if (dist >= radius - 1e-6) {
                          const angleToCenter = Math.atan2(center.y - pt.y, center.x - pt.x);
                          const safeDist = Math.max(dist, radius); // prevent NaN if dist is very slightly less than radius due to floating point
                          const theta = Math.asin(radius / safeDist);
                          const dirAngle = l.tangentIndex === 0 ? angleToCenter + theta : angleToCenter - theta;
                          const dx = Math.cos(dirAngle);
                          const dy = Math.sin(dirAngle);
                          evalLines[l.id] = { p1: pt, dx, dy, type: 'line' };
                          globalChanged = true;
                      }
                  }
              }
          }
      });
      globalPasses++;
  }

  const getSnappedPos = (pos: { x: number, y: number }) => {
    if (!snapToGrid) return pos;
    return {
      x: Math.round(pos.x / gridSize) * gridSize,
      y: Math.round(pos.y / gridSize) * gridSize
    };
  };

  const handleStageClick = (e: any) => {
    if (editingText) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    let clickedPointId: string | null = null;
    let minPtDist = SNAP_DISTANCE;
    for (const p of points) {
        const ep = evalPoints[p.id];
        if (!ep) continue;
        const d = distance(pos, ep);
        if (d < minPtDist) {
            minPtDist = d;
            clickedPointId = p.id;
        }
    }

    let clickedLineId: string | null = null;
    if (!clickedPointId) {
        let minLineDist = SNAP_DISTANCE;
        for (const l of lines) {
            const el = evalLines[l.id];
            if (!el) continue;
            let d = Infinity;
            if (el.type === 'segment') d = distancePointToSegment(pos, el.p1, el.p2!);
            else if (el.type === 'ray') d = distancePointToRay(pos, el.p1, el.dx, el.dy);
            else d = distancePointToLine(pos, el.p1, el.dx, el.dy);

            if (d < minLineDist) {
                minLineDist = d;
                clickedLineId = l.id;
            }
        }
    }

    let clickedCircleId: string | null = null;
    if (!clickedPointId && !clickedLineId) {
        let minCircDist = SNAP_DISTANCE;
        for (const c of circles) {
            let center: {x: number, y: number} | undefined;
            let radius = 0;
            if (c.type === 'inscribed') {
                const poly = polygons.find(p => p.id === c.polygonId);
                if (!poly) continue;
                const pts = poly.points.map(pid => evalPoints[pid]).filter(Boolean);
                if (pts.length < 3) continue;
                const incircle = getIncircle(pts as any);
                if (!incircle) continue;
                center = incircle.center;
                radius = incircle.radius;
            } else {
                center = evalPoints[c.center!];
                const p2 = evalPoints[c.p2!];
                if (center && p2) {
                    radius = distance(center, p2);
                } else {
                    continue;
                }
            }
            if (!center) continue;
            const d = Math.abs(distance(pos, center) - radius);
            if (d < minCircDist) {
                minCircDist = d;
                clickedCircleId = c.id;
            }
        }
    }

    let clickedTextId: string | null = null;
    if (!clickedPointId && !clickedLineId && !clickedCircleId) {
        let minTextDist = SNAP_DISTANCE * 2;
        for (const t of textLabels) {
            const d = distance(pos, { x: t.x, y: t.y });
            if (d < minTextDist) {
                minTextDist = d;
                clickedTextId = t.id;
            }
        }
    }

    let clickedPolygonId: string | null = null;
    let clickedMeasurementId: string | null = null;
    if (!clickedPointId && !clickedLineId && !clickedCircleId && !clickedTextId) {
        const clickedOn = e.target;
        if (clickedOn.name() === 'polygon') {
            clickedPolygonId = clickedOn.id();
        } else if (clickedOn.name() === 'measurement_label') {
            clickedMeasurementId = clickedOn.id();
        } else {
            // also check parent group
            const parent = clickedOn.parent;
            if (parent && parent.name() === 'measurement_label') {
                clickedMeasurementId = parent.id();
            }
        }
    }

    if (activeTool === 'select') {
        const clickedId = clickedPointId || clickedLineId || clickedCircleId || clickedTextId || clickedPolygonId || clickedMeasurementId;
        
        if (clickedId) {
            const group = groups.find(g => g.objectIds.includes(clickedId));
            let newSelection = group ? [...group.objectIds] : [clickedId];
            
            if (e.evt.shiftKey) {
                if (selectedObjectIds.includes(clickedId)) {
                    setSelectedObjectIds(selectedObjectIds.filter(id => !newSelection.includes(id)));
                } else {
                    setSelectedObjectIds([...new Set([...selectedObjectIds, ...newSelection])]);
                }
            } else {
                setSelectedObjectIds(newSelection);
            }
        } else {
            setSelectedObjectIds([]);
        }
        return;
    }

    let historySaved = false;
    const doSaveHistory = () => {
        if (!historySaved) {
            saveHistory();
            historySaved = true;
        }
    }

    const getOrCreatePoint = () => {
        if (clickedPointId) return clickedPointId;
        doSaveHistory();
        const newId = generateId();
        const createPos = getSnappedPos(pos);
        setPoints(prev => [...prev, { id: newId, type: 'free', x: createPos.x, y: createPos.y, name: getNextPointName(points.map(p=>p.name)) }]);
        return newId;
    };

    if (activeTool === 'delete') {
        const clickedOn = e.target;
        if (clickedPolygonId) {
            doSaveHistory();
            setPolygons(prev => prev.filter(p => p.id !== clickedPolygonId));
            setMeasurements(prev => prev.filter(m => !(m.type === 'area' && m.polygonId === clickedPolygonId)));
            if (selectedObjectIds.includes(clickedPolygonId)) setSelectedObjectIds(selectedObjectIds.filter(id => id !== clickedPolygonId));
            return;
        }
        if (clickedMeasurementId) {
            doSaveHistory();
            setMeasurements(prev => prev.filter(m => m.id !== clickedMeasurementId));
            if (selectedObjectIds.includes(clickedMeasurementId)) setSelectedObjectIds(selectedObjectIds.filter(id => id !== clickedMeasurementId));
            return;
        }
        if (clickedPointId || clickedLineId || clickedCircleId || clickedTextId) {
            doSaveHistory();
            const deletedPts = new Set<string>(clickedPointId ? [clickedPointId] : []);
            const deletedLines = new Set<string>(clickedLineId ? [clickedLineId] : []);
            const deletedCircles = new Set<string>(clickedCircleId ? [clickedCircleId] : []);
            const deletedTexts = new Set<string>(clickedTextId ? [clickedTextId] : []);
            const deletedPolys = new Set<string>();

            let changed = true;
            while (changed) {
                changed = false;
                for (const p of points) {
                    if (deletedPts.has(p.id)) continue;
                    if (p.type === 'midpoint' && (deletedPts.has(p.p1!) || deletedPts.has(p.p2!))) { deletedPts.add(p.id); changed = true; }
                    else if (p.type === 'centroid' && (deletedPts.has(p.p1!) || deletedPts.has(p.p2!) || deletedPts.has(p.p3!))) { deletedPts.add(p.id); changed = true; }
                    else if (p.type === 'intersection' && (deletedLines.has(p.line1!) || deletedLines.has(p.line2!))) { deletedPts.add(p.id); changed = true; }
                }
                for (const l of lines) {
                    if (deletedLines.has(l.id)) continue;
                    if (deletedPts.has(l.p1!) || deletedPts.has(l.p2!) || deletedPts.has(l.p3!) || deletedPts.has(l.point!)) { deletedLines.add(l.id); changed = true; }
                    else if ((l.type === 'parallel' || l.type === 'perpendicular') && deletedLines.has(l.baseLine!)) { deletedLines.add(l.id); changed = true; }
                    else if (l.type === 'tangent' && deletedCircles.has(l.circle!)) { deletedLines.add(l.id); changed = true; }
                }
                for (const poly of polygons) {
                    if (deletedPolys.has(poly.id)) continue;
                    if (poly.points.some(pt => deletedPts.has(pt))) { deletedPolys.add(poly.id); changed = true; }
                }
                for (const c of circles) {
                    if (deletedCircles.has(c.id)) continue;
                    if (c.type === 'inscribed' && deletedPolys.has(c.polygonId)) { deletedCircles.add(c.id); changed = true; }
                    else if (c.type !== 'inscribed' && (deletedPts.has(c.center) || deletedPts.has(c.p2))) { deletedCircles.add(c.id); changed = true; }
                }
            }

            setPoints(prev => prev.filter(p => !deletedPts.has(p.id)));
            setLines(prev => prev.filter(l => !deletedLines.has(l.id)));
            setCircles(prev => prev.filter(c => !deletedCircles.has(c.id)));
            setTextLabels(prev => prev.filter(t => !deletedTexts.has(t.id)));
            setPolygons(prev => prev.filter(poly => !deletedPolys.has(poly.id)));

            setMeasurements(prev => prev.filter(m => {
                if (m.type === 'area') return !deletedPolys.has(m.polygonId);
                if (m.type === 'perimeter') return !m.points.some(pt => deletedPts.has(pt));
                if (m.type === 'distance') return !deletedPts.has(m.p1) && !deletedPts.has(m.p2);
                if (m.type === 'angle') return !deletedPts.has(m.p1) && !deletedPts.has(m.p2) && !deletedPts.has(m.p3);
                return true;
            }));

            setSelectedObjectIds(selectedObjectIds.filter(id => 
                !deletedPts.has(id) && !deletedLines.has(id) && !deletedCircles.has(id) && !deletedPolys.has(id) && !deletedTexts.has(id)
            ));
        }
        return;
    } else if (activeTool === 'point') {
        if (!clickedPointId) getOrCreatePoint();
    } else if (activeTool === 'segment' || activeTool === 'line' || activeTool === 'ray') {
        const pId = getOrCreatePoint();
        if (selectedIds.length === 0) {
            setSelectedIds([pId]);
        } else if (selectedIds[0] !== pId) {
            doSaveHistory();
            setLines(prev => [...prev, { id: generateId(), type: activeTool, p1: selectedIds[0], p2: pId }]);
            setSelectedIds([]);
        }
    } else if (activeTool === 'midpoint') {
        const pId = getOrCreatePoint();
        if (selectedIds.length === 0) {
            setSelectedIds([pId]);
        } else if (selectedIds[0] !== pId) {
            doSaveHistory();
            setPoints(prev => [...prev, { id: generateId(), type: 'midpoint', p1: selectedIds[0], p2: pId, name: getNextPointName(points.map(p=>p.name)) }]);
            setSelectedIds([]);
        }
    } else if (activeTool === 'perpendicular' || activeTool === 'parallel') {
        if (clickedPointId && !selectedIds.find(id => points.find(p => p.id === id))) {
            const newSel = [...selectedIds, clickedPointId];
            if (newSel.length === 2) {
                doSaveHistory();
                createPerpOrPar(newSel);
            } else setSelectedIds(newSel);
        } else if (clickedLineId && !selectedIds.find(id => lines.find(l => l.id === id))) {
            const newSel = [...selectedIds, clickedLineId];
            if (newSel.length === 2) {
                doSaveHistory();
                createPerpOrPar(newSel);
            } else setSelectedIds(newSel);
        } else if (!clickedPointId && !clickedLineId) {
            const pId = getOrCreatePoint();
            const newSel = [...selectedIds, pId];
            if (newSel.length === 2) {
                doSaveHistory();
                createPerpOrPar(newSel);
            } else setSelectedIds(newSel);
        }
    } else if (activeTool === 'bisector') {
        const pId = getOrCreatePoint();
        const newSel = [...selectedIds, pId];
        if (newSel.length === 3) {
            doSaveHistory();
            setLines(prev => [...prev, { id: generateId(), type: 'bisector', p1: newSel[0], p2: newSel[1], p3: newSel[2] }]);
            setSelectedIds([]);
        } else {
            setSelectedIds(newSel);
        }
    } else if (activeTool === 'centroid' || activeTool === 'median') {
        const pId = getOrCreatePoint();
        const newSel = [...selectedIds, pId];
        if (newSel.length === 3) {
            doSaveHistory();
            if (activeTool === 'centroid') {
                setPoints(prev => [...prev, { id: generateId(), type: 'centroid', p1: newSel[0], p2: newSel[1], p3: newSel[2], name: getNextPointName(points.map(p=>p.name)) }]);
            } else {
                setLines(prev => [...prev, { id: generateId(), type: 'median', p1: newSel[0], p2: newSel[1], p3: newSel[2] }]);
            }
            setSelectedIds([]);
        } else {
            setSelectedIds(newSel);
        }
    } else if (activeTool === 'perp_bisector') {
        const pId = getOrCreatePoint();
        const newSel = [...selectedIds, pId];
        if (newSel.length === 2) {
            doSaveHistory();
            setLines(prev => [...prev, { id: generateId(), type: 'perp_bisector', p1: newSel[0], p2: newSel[1] }]);
            setSelectedIds([]);
        } else {
            setSelectedIds(newSel);
        }
    } else if (activeTool === 'intersection') {
        if (clickedLineId && !selectedIds.includes(clickedLineId)) {
            const newSel = [...selectedIds, clickedLineId];
            if (newSel.length === 2) {
                doSaveHistory();
                setPoints(prev => [...prev, { id: generateId(), type: 'intersection', line1: newSel[0], line2: newSel[1], name: getNextPointName(points.map(p=>p.name)) }]);
                setSelectedIds([]);
            } else {
                setSelectedIds(newSel);
            }
        }
    } else if (activeTool === 'circle') {
        const pId = getOrCreatePoint();
        if (selectedIds.length === 0) {
            setSelectedIds([pId]);
        } else if (selectedIds[0] !== pId) {
            doSaveHistory();
            setCircles(prev => [...prev, { id: generateId(), center: selectedIds[0], p2: pId }]);
            setSelectedIds([]);
        }
    } else if (activeTool === 'inscribed_circle') {
        const clickedOn = e.target;
        if (clickedOn.name() === 'polygon') {
            const polyId = clickedOn.id();
            if (!circles.some(c => c.type === 'inscribed' && c.polygonId === polyId)) {
                doSaveHistory();
                setCircles(prev => [...prev, { id: generateId(), type: 'inscribed', polygonId: polyId }]);
            }
        }
        return;
    } else if (activeTool === 'tangent') {
        if (clickedPointId && !selectedIds.find(id => points.find(p => p.id === id))) {
            const newSel = [...selectedIds, clickedPointId];
            if (newSel.length === 2) {
                doSaveHistory();
                createTangent(newSel);
            } else setSelectedIds(newSel);
        } else if (clickedCircleId && !selectedIds.find(id => circles.find(c => c.id === id))) {
            const newSel = [...selectedIds, clickedCircleId];
            if (newSel.length === 2) {
                doSaveHistory();
                createTangent(newSel);
            } else setSelectedIds(newSel);
        } else if (!clickedPointId && !clickedCircleId && !clickedLineId && !clickedPolygonId && !clickedMeasurementId && !clickedTextId) {
            const pId = getOrCreatePoint();
            const newSel = [...selectedIds, pId];
            if (newSel.length === 2) {
                doSaveHistory();
                createTangent(newSel);
            } else setSelectedIds(newSel);
        }
    } else if (activeTool === 'measure_area') {
        const clickedOn = e.target;
        if (clickedOn.name() === 'polygon') {
            const polyId = clickedOn.id();
            if (!measurements.some(m => m.type === 'area' && m.polygonId === polyId)) {
                doSaveHistory();
                setMeasurements(prev => [...prev, { id: generateId(), type: 'area', polygonId: polyId }]);
            }
        }
        return;
    } else if (activeTool === 'measure_perimeter') {
        const pId = getOrCreatePoint();
        if (selectedIds.length >= 2 && pId === selectedIds[0]) {
            doSaveHistory();
            setMeasurements(prev => [...prev, { id: generateId(), type: 'perimeter', points: selectedIds }]);
            setSelectedIds([]);
        } else if (selectedIds[selectedIds.length - 1] !== pId && pId !== selectedIds[0]) {
            setSelectedIds([...selectedIds, pId]);
        }
    } else if (activeTool === 'polygon') {
        const pId = getOrCreatePoint();
        if (selectedIds.length >= 2 && pId === selectedIds[0]) {
            doSaveHistory();
            setPolygons(prev => [...prev, { id: generateId(), points: selectedIds }]);
            setSelectedIds([]);
        } else if (selectedIds[selectedIds.length - 1] !== pId && pId !== selectedIds[0]) {
            setSelectedIds([...selectedIds, pId]);
        }
    } else if (activeTool === 'measure_distance') {
        const pId = getOrCreatePoint();
        if (selectedIds.length === 0) {
            setSelectedIds([pId]);
        } else if (selectedIds[0] !== pId) {
            doSaveHistory();
            setMeasurements(prev => [...prev, { id: generateId(), type: 'distance', p1: selectedIds[0], p2: pId }]);
            setSelectedIds([]);
        }
    } else if (activeTool === 'measure_angle') {
        const pId = getOrCreatePoint();
        const newSel = [...selectedIds, pId];
        if (newSel.length === 3) {
            doSaveHistory();
            setMeasurements(prev => [...prev, { id: generateId(), type: 'angle', p1: newSel[0], p2: newSel[1], p3: newSel[2] }]);
            setSelectedIds([]);
        } else {
            setSelectedIds(newSel);
        }
    } else if (activeTool === 'text') {
        doSaveHistory();
        const newId = generateId();
        const createPos = getSnappedPos(pos);
        const newLabel = { id: newId, x: createPos.x, y: createPos.y, text: '' };
        setTextLabels(prev => [...prev, newLabel]);
        setEditingText(newLabel);
    }
  };

  const createPerpOrPar = (sel: string[]) => {
      const ptId = sel.find(id => points.find(p => p.id === id));
      const lineId = sel.find(id => lines.find(l => l.id === id));
      if (ptId && lineId) {
          setLines(prev => [...prev, { id: generateId(), type: activeTool as any, point: ptId, baseLine: lineId }]);
      }
      setSelectedIds([]);
  };

  const createTangent = (sel: string[]) => {
      const ptId = sel.find(id => points.find(p => p.id === id));
      const circleId = sel.find(id => circles.find(c => c.id === id));
      if (ptId && circleId) {
          setLines(prev => [
            ...prev,
            { id: generateId(), type: 'tangent', point: ptId, circle: circleId, tangentIndex: 0 },
            { id: generateId(), type: 'tangent', point: ptId, circle: circleId, tangentIndex: 1 }
          ]);
      }
      setSelectedIds([]);
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (pos) setMousePos(getSnappedPos(pos));
  };

  const dragStateRef = useRef<{
    startX: number,
    startY: number,
    initialPoints: Record<string, {x: number, y: number}>,
    initialTextPositions: Record<string, {x: number, y: number}>,
    totalDx?: number,
    totalDy?: number
  } | null>(null);

  const handleObjectDragStart = (e: any, id: string) => {
    if (activeTool === 'select') {
      saveHistory();
      
      let idsToMove = selectedObjectIds.includes(id) ? selectedObjectIds : [id];
      if (!selectedObjectIds.includes(id)) {
        const group = groups.find(g => g.objectIds.includes(id));
        if (group) {
          idsToMove = [...group.objectIds];
        }
        setSelectedObjectIds(idsToMove);
      }
      
      const initialPoints: Record<string, {x: number, y: number}> = {};
      const initialTextPositions: Record<string, {x: number, y: number}> = {};
      
      idsToMove.forEach(objId => {
        const pt = points.find(p => p.id === objId);
        if (pt && pt.type === 'free') {
          initialPoints[pt.id] = { ...evalPoints[pt.id] };
        }
        const ln = lines.find(l => l.id === objId);
        if (ln) {
          if (points.find(p => p.id === ln.p1!)?.type === 'free') initialPoints[ln.p1!] = { ...evalPoints[ln.p1!] };
          if (points.find(p => p.id === ln.p2!)?.type === 'free') initialPoints[ln.p2!] = { ...evalPoints[ln.p2!] };
        }
        const circ = circles.find(c => c.id === objId);
        if (circ && circ.type !== 'inscribed') {
          if (points.find(p => p.id === circ.center!)?.type === 'free') initialPoints[circ.center!] = { ...evalPoints[circ.center!] };
          if (points.find(p => p.id === circ.p2!)?.type === 'free') initialPoints[circ.p2!] = { ...evalPoints[circ.p2!] };
        }
        const poly = polygons.find(p => p.id === objId);
        if (poly) {
          poly.points.forEach(pid => {
            if (points.find(p => p.id === pid)?.type === 'free') initialPoints[pid] = { ...evalPoints[pid] };
          });
        }
        const txt = textLabels.find(t => t.id === objId);
        if (txt) {
          initialTextPositions[txt.id] = { x: txt.x, y: txt.y };
        }
      });

      dragStateRef.current = {
        startX: e.target.x(),
        startY: e.target.y(),
        initialPoints,
        initialTextPositions,
        totalDx: 0,
        totalDy: 0
      };
    }
  };

  const handleObjectDragMove = (e: any, id: string) => {
    if (activeTool !== 'select') return;
    
    if (dragStateRef.current) {
      const state = dragStateRef.current;
      const dx = e.target.x() - state.startX;
      const dy = e.target.y() - state.startY;
      
      state.totalDx = (state.totalDx || 0) + dx;
      state.totalDy = (state.totalDy || 0) + dy;
      
      setPoints(prev => prev.map(p => {
        if (state.initialPoints[p.id]) {
          return { ...p, x: state.initialPoints[p.id].x + state.totalDx, y: state.initialPoints[p.id].y + state.totalDy };
        }
        return p;
      }));
      
      setTextLabels(prev => prev.map(t => {
        if (state.initialTextPositions[t.id]) {
          return { ...t, x: state.initialTextPositions[t.id].x + state.totalDx, y: state.initialTextPositions[t.id].y + state.totalDy };
        }
        return t;
      }));
      
      if (e.target.name() === 'polygon' || e.target.name() === 'line') {
        e.target.position({ x: 0, y: 0 });
        state.startX = 0;
        state.startY = 0;
      } else {
        state.startX = e.target.x();
        state.startY = e.target.y();
      }
    }
  };

  const handleObjectDragEnd = (e: any) => {
    if (activeTool === 'select') {
      dragStateRef.current = null;
    }
  };

  const handleGroup = () => {
    if (selectedObjectIds.length < 2) return;
    saveHistory();
    
    // Remove any existing groups that intersect with the new group
    setGroups(prev => prev.filter(g => !g.objectIds.some(id => selectedObjectIds.includes(id))));
    
    const newGroup: GroupType = {
      id: generateId(),
      objectIds: [...selectedObjectIds]
    };
    setGroups(prev => [...prev, newGroup]);
    // Giữ nguyên selection sau khi nhóm
  };

  const handleUngroup = () => {
    if (selectedObjectIds.length === 0) return;
    
    // Find all groups that contain any of the selected objects
    const groupsToUngroup = groups.filter(g => 
      g.objectIds.some(id => selectedObjectIds.includes(id))
    );

    if (groupsToUngroup.length === 0) return;

    saveHistory();
    
    // Remove these groups
    const groupIdsToRemove = new Set(groupsToUngroup.map(g => g.id));
    setGroups(prev => prev.filter(g => !groupIdsToRemove.has(g.id)));

    // Select all objects that were in the ungrouped groups
    const newSelectedIds = new Set<string>();
    groupsToUngroup.forEach(g => {
      g.objectIds.forEach(id => newSelectedIds.add(id));
    });
    setSelectedObjectIds(Array.from(newSelectedIds));
  };

  const updateObjectColor = (id: string, color: string) => {
    saveHistory();
    if (points.find(p => p.id === id)) setPoints(prev => prev.map(p => p.id === id ? { ...p, color } : p));
    else if (lines.find(l => l.id === id)) setLines(prev => prev.map(l => l.id === id ? { ...l, color } : l));
    else if (circles.find(c => c.id === id)) setCircles(prev => prev.map(c => c.id === id ? { ...c, color } : c));
    else if (polygons.find(p => p.id === id)) setPolygons(prev => prev.map(p => p.id === id ? { ...p, color } : p));
    else if (textLabels.find(t => t.id === id)) setTextLabels(prev => prev.map(t => t.id === id ? { ...t, color } : t));
  };

  const updatePointCoords = (id: string, x: number, y: number) => {
    saveHistory();
    setPoints(prev => prev.map(p => p.id === id && p.type === 'free' ? { ...p, x, y } : p));
  };

  const getCursorTooltip = () => {
    if (activeTool === 'select') return '';
    if (activeTool === 'point') return 'Nhấn để tạo điểm';
    if (activeTool === 'text') return 'Nhấn để thêm văn bản';
    if (activeTool === 'delete') return 'Nhấn vào đối tượng để xóa';
    
    const step = selectedIds.length;
    switch (activeTool) {
      case 'segment': return step === 0 ? 'Chọn điểm thứ 1' : 'Chọn điểm thứ 2';
      case 'line': return step === 0 ? 'Chọn điểm thứ 1' : 'Chọn điểm thứ 2';
      case 'ray': return step === 0 ? 'Chọn điểm bắt đầu' : 'Chọn điểm hướng';
      case 'measure_distance': return step === 0 ? 'Chọn điểm thứ 1' : 'Chọn điểm thứ 2';
      case 'midpoint': return step === 0 ? 'Chọn điểm thứ 1' : 'Chọn điểm thứ 2';
      case 'perp_bisector': return step === 0 ? 'Chọn điểm thứ 1' : 'Chọn điểm thứ 2';
      case 'circle': return step === 0 ? 'Chọn tâm' : 'Chọn điểm trên đường tròn';
      case 'inscribed_circle': return 'Nhấn vào một đa giác để nội tiếp đường tròn';
      case 'bisector': return step === 0 ? 'Chọn điểm thứ 1' : step === 1 ? 'Chọn đỉnh' : 'Chọn điểm thứ 3';
      case 'measure_angle': return step === 0 ? 'Chọn điểm thứ 1' : step === 1 ? 'Chọn đỉnh' : 'Chọn điểm thứ 3';
      case 'measure_area': return 'Nhấn vào một đa giác để đo diện tích';
      case 'measure_perimeter': return step === 0 ? 'Chọn đỉnh thứ 1' : step === 1 ? 'Chọn đỉnh thứ 2' : 'Chọn đỉnh tiếp theo hoặc nhấn đỉnh đầu để đóng';
      case 'centroid': return step === 0 ? 'Chọn đỉnh thứ 1' : step === 1 ? 'Chọn đỉnh thứ 2' : 'Chọn đỉnh thứ 3';
      case 'median': return step === 0 ? 'Chọn đỉnh' : step === 1 ? 'Chọn điểm đáy thứ 1' : 'Chọn điểm đáy thứ 2';
      case 'polygon': return step === 0 ? 'Chọn đỉnh thứ 1' : step === 1 ? 'Chọn đỉnh thứ 2' : 'Chọn đỉnh tiếp theo hoặc nhấn đỉnh đầu để đóng';
      case 'tangent':
        if (step === 0) return 'Chọn một điểm hoặc một đường tròn';
        const isPointSelectedTangent = points.some(p => p.id === selectedIds[0]);
        return isPointSelectedTangent ? 'Chọn một đường tròn' : 'Chọn một điểm';
      case 'perpendicular':
      case 'parallel':
        if (step === 0) return 'Chọn một điểm hoặc một đường thẳng';
        const isPointSelected = points.some(p => p.id === selectedIds[0]);
        return isPointSelected ? 'Chọn một đường thẳng' : 'Chọn một điểm';
      default: return '';
    }
  };

  const toolGroups = [
    {
      id: 'basic',
      icon: MousePointer2,
      label: 'Cơ bản',
      tools: [
        { id: 'select', icon: MousePointer2, label: 'Chọn' },
        { id: 'text', icon: Type, label: 'Văn bản' },
        { id: 'delete', icon: Eraser, label: 'Xóa' },
      ]
    },
    {
      id: 'point',
      icon: CircleDot,
      label: 'Điểm',
      tools: [
        { id: 'point', icon: CircleDot, label: 'Điểm' },
        { id: 'midpoint', icon: Target, label: 'Trung điểm' },
        { id: 'centroid', icon: Triangle, label: 'Trọng tâm' },
        { id: 'intersection', icon: X, label: 'Giao điểm' },
      ]
    },
    {
      id: 'line',
      icon: Minus,
      label: 'Đường',
      tools: [
        { id: 'segment', icon: Minus, label: 'Đoạn thẳng' },
        { id: 'line', icon: ArrowRightLeft, label: 'Đường thẳng' },
        { id: 'ray', icon: ArrowUpRight, label: 'Tia' },
      ]
    },
    {
      id: 'special_line',
      icon: Crosshair,
      label: 'Đường đặc biệt',
      tools: [
        { id: 'perpendicular', icon: Crosshair, label: 'Vuông góc' },
        { id: 'parallel', icon: Equal, label: 'Song song' },
        { id: 'bisector', icon: Split, label: 'Phân giác góc' },
        { id: 'perp_bisector', icon: FoldVertical, label: 'Trung trực' },
        { id: 'median', icon: ArrowDownToLine, label: 'Trung tuyến' },
        { id: 'tangent', icon: ArrowUpRight, label: 'Tiếp tuyến' },
      ]
    },
    {
      id: 'shape',
      icon: Hexagon,
      label: 'Hình khối',
      tools: [
        { id: 'circle', icon: CircleIcon, label: 'Đường tròn' },
        { id: 'inscribed_circle', icon: CircleIcon, label: 'Nội tiếp' },
        { id: 'polygon', icon: Hexagon, label: 'Đa giác' },
      ]
    },
    {
      id: 'measure',
      icon: MoveDiagonal,
      label: 'Đo lường',
      tools: [
        { id: 'measure_distance', icon: MoveDiagonal, label: 'Khoảng cách' },
        { id: 'measure_angle', icon: PieChart, label: 'Góc' },
        { id: 'measure_area', icon: SquareDashed, label: 'Diện tích' },
        { id: 'measure_perimeter', icon: Route, label: 'Chu vi' },
      ]
    }
  ];

  const handleAlign = (type: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => {
    saveHistory();
    const objectBBoxes: any[] = [];
    
    selectedObjectIds.forEach(id => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const addPt = (p: {x:number, y:number}) => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        };
        
        const shiftFreeIds = new Set<string>();
        const shiftTextIds = new Set<string>();
        
        const pt = points.find(p => p.id === id);
        if (pt && evalPoints[pt.id]) {
            addPt(evalPoints[pt.id]);
            if (pt.type === 'free') shiftFreeIds.add(id);
        }
        
        const txt = textLabels.find(t => t.id === id);
        if (txt) {
            addPt({x: txt.x, y: txt.y});
            shiftTextIds.add(id);
        }
        
        const ln = lines.find(l => l.id === id);
        if (ln && evalLines[ln.id]) {
            addPt(evalLines[ln.id].p1);
            if (evalLines[ln.id].p2) addPt(evalLines[ln.id].p2!);
            if (points.find(p=>p.id===ln.p1!)?.type === 'free') shiftFreeIds.add(ln.p1!);
            if (points.find(p=>p.id===ln.p2!)?.type === 'free') shiftFreeIds.add(ln.p2!);
        }
        
        const c = circles.find(c => c.id === id);
        if (c && c.type !== 'inscribed') {
            const cp = evalPoints[c.center!];
            const p2 = evalPoints[c.p2!];
            if (cp && p2) {
                const r = distance(cp, p2);
                addPt({x: cp.x - r, y: cp.y - r});
                addPt({x: cp.x + r, y: cp.y + r});
                if (points.find(p=>p.id===c.center!)?.type === 'free') shiftFreeIds.add(c.center!);
                if (points.find(p=>p.id===c.p2!)?.type === 'free') shiftFreeIds.add(c.p2!);
            }
        }
        
        const poly = polygons.find(p => p.id === id);
        if (poly) {
           poly.points.forEach(pid => {
               if (evalPoints[pid]) addPt(evalPoints[pid]);
               if (points.find(p=>p.id===pid)?.type === 'free') shiftFreeIds.add(pid);
           });
        }
        
        if (minX !== Infinity) {
            objectBBoxes.push({id, minX, maxX, minY, maxY, shiftFreeIds, shiftTextIds});
        }
    });

    if (objectBBoxes.length < 2) return;
    
    const globalMinX = Math.min(...objectBBoxes.map(b => b.minX));
    const globalMaxX = Math.max(...objectBBoxes.map(b => b.maxX));
    const globalMinY = Math.min(...objectBBoxes.map(b => b.minY));
    const globalMaxY = Math.max(...objectBBoxes.map(b => b.maxY));
    const globalCenterX = (globalMinX + globalMaxX) / 2;
    const globalCenterY = (globalMinY + globalMaxY) / 2;
    
    const shiftedPointIds = new Set<string>();
    const shiftedTextIds = new Set<string>();

    const pointDeltas: Record<string, {dx: number, dy: number}> = {};
    const textDeltas: Record<string, {dx: number, dy: number}> = {};

    objectBBoxes.forEach(box => {
        let targetX = box.minX;
        let targetY = box.minY;
        if (type === 'left') targetX = globalMinX;
        else if (type === 'right') targetX = globalMaxX - (box.maxX - box.minX);
        else if (type === 'center-x') targetX = globalCenterX - (box.maxX - box.minX)/2;
        else if (type === 'top') targetY = globalMinY;
        else if (type === 'bottom') targetY = globalMaxY - (box.maxY - box.minY);
        else if (type === 'center-y') targetY = globalCenterY - (box.maxY - box.minY)/2;
        
        const dx = (type === 'left' || type === 'right' || type === 'center-x') ? targetX - box.minX : 0;
        const dy = (type === 'top' || type === 'bottom' || type === 'center-y') ? targetY - box.minY : 0;
        
        box.shiftFreeIds.forEach((pid: string) => {
            if (!shiftedPointIds.has(pid)) {
                pointDeltas[pid] = {dx, dy};
                shiftedPointIds.add(pid);
            }
        });
        box.shiftTextIds.forEach((tid: string) => {
            if (!shiftedTextIds.has(tid)) {
                textDeltas[tid] = {dx, dy};
                shiftedTextIds.add(tid);
            }
        });
    });

    setPoints(prev => prev.map(p => {
        if (pointDeltas[p.id] && p.type === 'free') {
            return { ...p, x: p.x + pointDeltas[p.id].dx, y: p.y + pointDeltas[p.id].dy };
        }
        return p;
    }));
    
    setTextLabels(prev => prev.map(t => {
        if (textDeltas[t.id]) {
            return { ...t, x: t.x + textDeltas[t.id].dx, y: t.y + textDeltas[t.id].dy };
        }
        return t;
    }));
  };

  const renderPropertiesPanel = () => {
    if (selectedObjectIds.length === 0) return null;
    
    if (selectedObjectIds.length > 1) {
      const colors = ['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
      return (
        <div className="absolute top-4 right-4 w-64 bg-white rounded-lg shadow-lg border border-slate-200 flex flex-col overflow-hidden z-20">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-semibold text-slate-700 text-sm">Nhiều đối tượng</h3>
            <button onClick={() => setSelectedObjectIds([])} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-2">
              <span className="text-slate-500">Màu sắc:</span>
              <div className="flex gap-2 flex-wrap">
                {colors.map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      selectedObjectIds.forEach(id => updateObjectColor(id, c));
                    }}
                    className="w-6 h-6 rounded-full border-2 border-transparent hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 mt-1">
              <span className="text-slate-500">Căn lề:</span>
              <div className="flex gap-2">
                <button onClick={() => handleAlign('left')} title="Căn trái" className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><AlignStartVertical className="w-4 h-4" /></button>
                <button onClick={() => handleAlign('center-x')} title="Căn giữa dọc" className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><AlignCenterVertical className="w-4 h-4" /></button>
                <button onClick={() => handleAlign('right')} title="Căn phải" className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><AlignEndVertical className="w-4 h-4" /></button>
                <div className="w-px bg-slate-300 mx-1"></div>
                <button onClick={() => handleAlign('top')} title="Căn trên" className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><AlignStartHorizontal className="w-4 h-4" /></button>
                <button onClick={() => handleAlign('center-y')} title="Căn giữa ngang" className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><AlignCenterHorizontal className="w-4 h-4" /></button>
                <button onClick={() => handleAlign('bottom')} title="Căn dưới" className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><AlignEndHorizontal className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const selectedObjectId = selectedObjectIds[0];
    const pt = points.find(p => p.id === selectedObjectId);
    const ln = lines.find(l => l.id === selectedObjectId);
    const circ = circles.find(c => c.id === selectedObjectId);
    const poly = polygons.find(p => p.id === selectedObjectId);
    const txt = textLabels.find(t => t.id === selectedObjectId);
    
    const obj = pt || ln || circ || poly || txt;
    if (!obj) return null;

    const colors = ['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

    return (
      <div className="absolute top-4 right-4 w-64 bg-white rounded-lg shadow-lg border border-slate-200 flex flex-col overflow-hidden z-20">
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-semibold text-slate-700 text-sm">Thuộc tính</h3>
          <button onClick={() => setSelectedObjectIds([])} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-4 text-sm">
          {/* Type & Name */}
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Loại:</span>
            <span className="font-medium text-slate-800">
              {pt ? 'Điểm' : ln ? 'Đường' : circ ? 'Đường tròn' : poly ? 'Đa giác' : 'Văn bản'}
            </span>
          </div>
          
          {pt && (
            <div className="flex justify-between items-center gap-2">
              <span className="text-slate-500 min-w-max">Tên:</span>
              <input
                type="text"
                value={pt.name}
                onChange={(e) => {
                  setPoints(prev => prev.map(p => p.id === pt.id ? { ...p, name: e.target.value } : p));
                }}
                onBlur={() => saveHistory()}
                className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* Coordinates (Editable for free points) */}
          {pt && pt.type === 'free' && (
            <div className="flex flex-col gap-2">
              <span className="text-slate-500">Tọa độ:</span>
              <div className="flex gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">X:</span>
                  <input 
                    type="number" 
                    value={Math.round(pt.x)} 
                    onChange={(e) => updatePointCoords(pt.id, Number(e.target.value), pt.y)}
                    className="w-16 px-2 py-1 border border-slate-300 rounded text-right"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">Y:</span>
                  <input 
                    type="number" 
                    value={Math.round(pt.y)} 
                    onChange={(e) => updatePointCoords(pt.id, pt.x, Number(e.target.value))}
                    className="w-16 px-2 py-1 border border-slate-300 rounded text-right"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Length (Read-only for now) */}
          {ln && ln.type === 'segment' && evalLines[ln.id] && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Độ dài:</span>
              <span className="font-medium text-slate-800">
                {distance(evalLines[ln.id].p1, evalLines[ln.id].p2!).toFixed(1)}
              </span>
            </div>
          )}

          {ln && ['perpendicular', 'bisector'].includes(ln.type) && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Chỉ hiển thị đoạn cắt:</span>
              <input
                type="checkbox"
                checked={!!ln.trimmed}
                onChange={(e) => {
                  saveHistory();
                  setLines(prev => prev.map(l => l.id === ln.id ? { ...l, trimmed: e.target.checked } : l));
                }}
                className="w-4 h-4 cursor-pointer text-indigo-500 focus:ring-indigo-500 rounded border-slate-300"
              />
            </div>
          )}

          {/* Radius (Read-only for now) */}
          {circ && circ.type !== 'inscribed' && evalPoints[circ.center!] && evalPoints[circ.p2!] && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Bán kính:</span>
              <span className="font-medium text-slate-800">
                {distance(evalPoints[circ.center!], evalPoints[circ.p2!]).toFixed(1)}
              </span>
            </div>
          )}
          
          {circ && circ.type === 'inscribed' && (
             <div className="flex justify-between items-center">
               <span className="text-slate-500">Bán kính:</span>
               <span className="font-medium text-slate-800">
                 {(() => {
                    const poly = polygons.find(p => p.id === circ.polygonId);
                    if (!poly) return '0.0';
                    const pts = poly.points.map(pid => evalPoints[pid]).filter(Boolean);
                    const incircle = getIncircle(pts as any);
                    return incircle ? incircle.radius.toFixed(1) : '0.0';
                 })()}
               </span>
             </div>
          )}

          {/* Area (Read-only) */}
          {poly && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Diện tích:</span>
                <span className="font-medium text-slate-800">
                  {(() => {
                    const pts = poly.points.map(pid => evalPoints[pid]).filter(Boolean) as {x: number, y: number}[];
                    if (pts.length < 3) return '0';
                    return Math.round(calculatePolygonArea(pts));
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-slate-500">Chu vi:</span>
                <span className="font-medium text-slate-800">
                  {(() => {
                    const pts = poly.points.map(pid => evalPoints[pid]).filter(Boolean) as {x: number, y: number}[];
                    if (pts.length < 3) return '0';
                    return Math.round(calculatePolygonPerimeter(pts));
                  })()}
                </span>
              </div>
            </>
          )}

          {/* Color Picker */}
          <div className="flex flex-col gap-2">
            <span className="text-slate-500 flex items-center gap-1"><Palette className="w-4 h-4"/> Màu sắc:</span>
            <div className="flex flex-wrap gap-2">
              {colors.map(c => (
                <button
                  key={c}
                  onClick={() => updateObjectColor(obj.id, c)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2",
                    (obj as any).color === c || (!('color' in obj) && c === '#000000') ? "border-slate-800 scale-110" : "border-transparent hover:scale-110"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getSelectedObjectTransformInfo = () => {
    if (selectedObjectIds.length === 0 || activeTool !== 'select') return null;

    let center = { x: 0, y: 0 };
    let freePointIds = new Set<string>();
    let handlePos = { x: 0, y: 0 };
    let textIds = new Set<string>();
    let allPts: {x: number, y: number}[] = [];

    selectedObjectIds.forEach(id => {
      const pt = points.find(p => p.id === id);
      const ln = lines.find(l => l.id === id);
      const circ = circles.find(c => c.id === id);
      const poly = polygons.find(p => p.id === id);
      const txt = textLabels.find(t => t.id === id);

      if (pt) {
        if (pt.type === 'free') {
          freePointIds.add(pt.id);
          allPts.push(evalPoints[pt.id]);
        }
      } else if (ln) {
        const p1 = evalPoints[ln.p1!];
        const p2 = evalPoints[ln.p2!];
        if (p1 && p2) {
          if (points.find(p => p.id === ln.p1!)?.type === 'free') freePointIds.add(ln.p1!);
          if (points.find(p => p.id === ln.p2!)?.type === 'free') freePointIds.add(ln.p2!);
          allPts.push(p1, p2);
        }
      } else if (circ) {
        if (circ.type !== 'inscribed') {
          const c = evalPoints[circ.center!];
          const p2 = evalPoints[circ.p2!];
          if (c && p2) {
            if (points.find(p => p.id === circ.center)?.type === 'free') freePointIds.add(circ.center!);
            if (points.find(p => p.id === circ.p2)?.type === 'free') freePointIds.add(circ.p2!);
            const r = distance(c, p2);
            allPts.push({x: c.x, y: c.y - r}, {x: c.x, y: c.y + r}, {x: c.x - r, y: c.y}, {x: c.x + r, y: c.y});
          }
        }
      } else if (poly) {
        const pts = poly.points.map(pid => evalPoints[pid]).filter(Boolean) as {x: number, y: number}[];
        poly.points.forEach(pid => {
          if (points.find(p => p.id === pid)?.type === 'free') freePointIds.add(pid);
        });
        allPts.push(...pts);
      } else if (txt) {
        textIds.add(txt.id);
        allPts.push({x: txt.x, y: txt.y});
      }
    });

    if (freePointIds.size === 0 && textIds.size === 0) return null;
    if (allPts.length === 0) return null;
    if (selectedObjectIds.length === 1 && points.find(p => p.id === selectedObjectIds[0])?.type === 'free') return null;

    const minX = Math.min(...allPts.map(p => p.x));
    const maxX = Math.max(...allPts.map(p => p.x));
    const minY = Math.min(...allPts.map(p => p.y));
    const maxY = Math.max(...allPts.map(p => p.y));

    center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    handlePos = { x: center.x, y: minY - 40 };

    return { center, freePointIds: Array.from(freePointIds), handlePos, textIds: Array.from(textIds), minX, minY, maxX, maxY };
  };

  const transformInfo = getSelectedObjectTransformInfo();

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden font-sans">
      <header className="bg-white border-b border-slate-200 p-3 flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm z-10 gap-3">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Hexagon className="w-6 h-6 text-indigo-600" />
            Toán Hình Trực Quan
          </h1>
        </div>

        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg">
          <div className="relative">
            <div className="flex bg-slate-100 rounded-md">
              <button
                onClick={() => setSnapToGrid(!snapToGrid)}
                className={cn(
                  "p-2 rounded-l-md flex items-center gap-2 transition-colors border-r border-slate-300",
                  snapToGrid 
                    ? "bg-indigo-100 text-indigo-700 shadow-sm" 
                    : "text-slate-600 hover:bg-slate-200"
                )}
                title="Bật/Tắt Bắt dính lưới"
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowGridSettings(!showGridSettings)}
                className={cn(
                  "p-2 rounded-r-md transition-colors",
                  showGridSettings ? "bg-slate-200 text-slate-800" : "text-slate-600 hover:bg-slate-200"
                )}
                title="Cài đặt lưới"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
            {showGridSettings && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 shadow-lg rounded-md p-3 z-50 w-64">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold text-sm text-slate-700">Cài đặt lưới</h4>
                  <button onClick={() => setShowGridSettings(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Kích thước ô lưới ({gridSize}px)</label>
                    <input 
                      type="range" 
                      min="10" 
                      max="100" 
                      step="5" 
                      value={gridSize} 
                      onChange={(e) => setGridSize(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Màu lưới</label>
                    <input 
                      type="color" 
                      value={gridColor} 
                      onChange={(e) => setGridColor(e.target.value)}
                      className="w-full h-8 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="w-px bg-slate-300 mx-1 my-2"></div>
          {toolGroups.map((group) => {
            const isActiveGroup = group.tools.some(t => t.id === activeTool);
            const activeToolInGroup = group.tools.find(t => t.id === activeTool);
            const DisplayIcon = isActiveGroup && activeToolInGroup ? activeToolInGroup.icon : group.icon;
            
            return (
              <div key={group.id} className="relative tool-group">
                <button
                  onClick={() => setOpenDropdown(openDropdown === group.id ? null : group.id)}
                  className={cn(
                    "p-2 rounded-md flex items-center gap-1 transition-colors",
                    isActiveGroup || openDropdown === group.id
                      ? "bg-white text-indigo-600 shadow-sm" 
                      : "text-slate-600 hover:bg-slate-200"
                  )}
                  title={group.label}
                >
                  <DisplayIcon className="w-5 h-5" />
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </button>
                
                {openDropdown === group.id && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg py-1 z-50 min-w-[160px]">
                    {group.tools.map(tool => (
                      <button
                        key={tool.id}
                        onClick={() => {
                          setActiveTool(tool.id as ToolType);
                          setSelectedIds([]);
                          setOpenDropdown(null);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-100",
                          activeTool === tool.id ? "text-indigo-600 font-medium" : "text-slate-700"
                        )}
                      >
                        <tool.icon className="w-4 h-4" />
                        {tool.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="w-px h-8 bg-slate-300 mx-1 self-center" />
          <button
            onClick={() => setIsRulerVisible(!isRulerVisible)}
            className={cn(
              "p-2 rounded-md flex items-center gap-2 transition-colors",
              isRulerVisible 
                ? "bg-indigo-100 text-indigo-700 shadow-sm" 
                : "text-slate-600 hover:bg-slate-200"
            )}
            title="Bật/Tắt Thước"
          >
            <Ruler className="w-5 h-5" />
          </button>
          <div className="w-px h-8 bg-slate-300 mx-1 self-center" />
          <button
            onClick={handleGroup}
            disabled={selectedObjectIds.length < 2}
            className="p-2 text-slate-600 hover:bg-slate-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Nhóm đối tượng"
          >
            <GroupIcon className="w-5 h-5" />
          </button>
          <button
            onClick={handleUngroup}
            disabled={selectedObjectIds.length === 0 || !groups.some(g => g.objectIds.some(id => selectedObjectIds.includes(id)))}
            className="p-2 text-slate-600 hover:bg-slate-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Bỏ nhóm đối tượng"
          >
            <Ungroup className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Hoàn tác"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          <button
            onClick={clearAll}
            className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors flex items-center gap-2"
            title="Xóa hết"
          >
            <Trash2 className="w-5 h-5" />
            <span className="hidden md:inline text-sm font-medium">Xóa hết</span>
          </button>
        </div>
      </header>

      <div 
        ref={containerRef} 
        className={cn(
          "flex-1 w-full relative bg-slate-50",
          activeTool === 'select' ? 'cursor-default' : (activeTool === 'delete' ? 'cursor-not-allowed' : 'cursor-crosshair')
        )}
        style={{
          backgroundImage: `radial-gradient(${gridColor} 1px, transparent 0)`,
          backgroundSize: `${gridSize}px ${gridSize}px`
        }}
      >
        <Stage
          width={dimensions.width}
          height={dimensions.height}
          onClick={handleStageClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setMousePos(null)}
        >
          <Layer>
            {polygons.map(poly => {
              const polyPoints = poly.points.map(id => evalPoints[id]).filter(Boolean);
              if (polyPoints.length < 3) return null;
              const flatPoints = polyPoints.flatMap(p => [p.x, p.y]);
              const isSelected = selectedObjectIds.includes(poly.id);
              const color = poly.color || "#4f46e5";
              return (
                <KonvaLine
                  key={poly.id}
                  id={poly.id}
                  name="polygon"
                  x={0}
                  y={0}
                  points={flatPoints}
                  closed={true}
                  fill={hoveredId === poly.id ? (activeTool === 'delete' ? "rgba(239, 68, 68, 0.2)" : `${color}33`) : (isSelected ? `${color}4D` : `${color}1A`)}
                  stroke={hoveredId === poly.id && activeTool === 'delete' ? "#ef4444" : color}
                  strokeWidth={hoveredId === poly.id || isSelected ? 3 : 2}
                  hitStrokeWidth={15}
                  lineJoin="round"
                  onMouseEnter={() => setHoveredId(poly.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  draggable={activeTool === 'select'}
                  onDragStart={(e) => handleObjectDragStart(e, poly.id)}
                  onDragMove={(e) => handleObjectDragMove(e, poly.id)}
                  onDragEnd={handleObjectDragEnd}
                />
              );
            })}

            {circles.map(circle => {
              let center = {x: 0, y: 0};
              let radius = 0;
              if (circle.type === 'inscribed') {
                  const poly = polygons.find(p => p.id === circle.polygonId);
                  if (!poly) return null;
                  const pts = poly.points.map(pid => evalPoints[pid]).filter(Boolean);
                  if (pts.length < 3) return null;
                  const incircle = getIncircle(pts as any);
                  if (!incircle) return null;
                  center = incircle.center;
                  radius = incircle.radius;
              } else {
                  const p1 = evalPoints[circle.center!];
                  const p2 = evalPoints[circle.p2!];
                  if (!p1 || !p2) return null;
                  center = p1;
                  radius = distance(p1, p2);
              }
              const isSelected = selectedObjectIds.includes(circle.id);
              const color = circle.color || "#0ea5e9";
              return (
                <KonvaCircle
                  key={circle.id}
                  x={center.x}
                  y={center.y}
                  radius={radius}
                  stroke={hoveredId === circle.id && activeTool === 'delete' ? "#ef4444" : color}
                  strokeWidth={hoveredId === circle.id || isSelected ? 3 : 2}
                  hitStrokeWidth={15}
                  onMouseEnter={() => setHoveredId(circle.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  draggable={activeTool === 'select'}
                  onDragStart={(e) => handleObjectDragStart(e, circle.id)}
                  onDragMove={(e) => handleObjectDragMove(e, circle.id)}
                  onDragEnd={handleObjectDragEnd}
                />
              );
            })}

            {lines.map(line => {
              const el = evalLines[line.id];
              if (!el) return null;
              
              const isSelected = selectedObjectIds.includes(line.id);
              const color = line.color || "#10b981";
              const strokeColor = hoveredId === line.id && activeTool === 'delete' ? "#ef4444" : color;
              const strokeWidth = hoveredId === line.id || isSelected ? 3 : 2;

              const dragProps = {
                draggable: activeTool === 'select',
                onDragStart: (e: any) => handleObjectDragStart(e, line.id),
                onDragMove: (e: any) => handleObjectDragMove(e, line.id),
                onDragEnd: handleObjectDragEnd,
              };

              if (el.type === 'segment') {
                return <KonvaLine key={line.id} name="line" x={0} y={0} points={[el.p1.x, el.p1.y, el.p2!.x, el.p2!.y]} stroke={strokeColor} strokeWidth={strokeWidth} hitStrokeWidth={15} onMouseEnter={() => setHoveredId(line.id)} onMouseLeave={() => setHoveredId(null)} {...dragProps} />;
              }
              
              const ext = 5000;
              const len = Math.hypot(el.dx, el.dy);
              if (len === 0) return null;
              const nx = el.dx / len;
              const ny = el.dy / len;
              
              if (el.type === 'ray') {
                return <KonvaLine key={line.id} name="line" x={0} y={0} points={[el.p1.x, el.p1.y, el.p1.x + nx * ext, el.p1.y + ny * ext]} stroke={strokeColor} strokeWidth={strokeWidth} hitStrokeWidth={15} onMouseEnter={() => setHoveredId(line.id)} onMouseLeave={() => setHoveredId(null)} {...dragProps} />;
              }
              
              return <KonvaLine key={line.id} name="line" x={0} y={0} points={[el.p1.x - nx * ext, el.p1.y - ny * ext, el.p1.x + nx * ext, el.p1.y + ny * ext]} stroke={strokeColor} strokeWidth={strokeWidth} hitStrokeWidth={15} onMouseEnter={() => setHoveredId(line.id)} onMouseLeave={() => setHoveredId(null)} {...dragProps} />;
            })}

            {/* Measurements */}
            {measurements.map(m => {
              if (m.type === 'distance') {
                const p1 = evalPoints[m.p1];
                const p2 = evalPoints[m.p2];
                if (!p1 || !p2) return null;
                const dist = distance(p1, p2).toFixed(1);
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const offsetX = m.labelOffset?.x ?? 0;
                const offsetY = m.labelOffset?.y ?? 0;
                const isHovered = hoveredId === m.id;
                const isSelected = selectedObjectIds.includes(m.id);
                const color = (isHovered && activeTool === 'delete') ? "#ef4444" : (isSelected ? "#b45309" : "#d97706");
                return (
                  <Group key={m.id} id={m.id} name="measurement_label"
                     onMouseEnter={() => setHoveredId(m.id)}
                     onMouseLeave={() => setHoveredId(null)}>
                    <KonvaText 
                      x={midX + 5 + offsetX} 
                      y={midY + 5 + offsetY} 
                      text={dist} 
                      fill={color} 
                      fontSize={16} 
                      fontStyle="bold" 
                      draggable={activeTool === 'select'}
                      onDragStart={(e) => {
                         if (activeTool === 'select') {
                             saveHistory();
                             e.cancelBubble = true;
                         }
                      }}
                      onDragMove={(e) => {
                         if (activeTool === 'select') {
                             const nx = e.target.x() - (midX + 5);
                             const ny = e.target.y() - (midY + 5);
                             setMeasurements(prev => prev.map(oldM => oldM.id === m.id ? { ...oldM, labelOffset: { x: nx, y: ny } } : oldM));
                         }
                      }}
                      onMouseEnter={(e) => {
                         const container = e.target.getStage()?.container();
                         if (container && activeTool === 'select') container.style.cursor = 'move';
                      }}
                      onMouseLeave={(e) => {
                         const container = e.target.getStage()?.container();
                         if (container) container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
                      }}
                    />
                  </Group>
                );
              } else if (m.type === 'angle') {
                const p1 = evalPoints[m.p1];
                const p2 = evalPoints[m.p2];
                const p3 = evalPoints[m.p3];
                if (!p1 || !p2 || !p3) return null;
                const ang = calculateAngle(p1, p2, p3).toFixed(1) + '°';
                
                const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
                let diff = a2 - a1;
                if (diff < 0) diff += 2 * Math.PI;
                
                let bisect = a1 + diff / 2;
                if (diff > Math.PI) {
                   bisect += Math.PI; // interior angle bisector
                }
                
                const textDist = 30;
                const tx = p2.x + Math.cos(bisect) * textDist;
                const ty = p2.y + Math.sin(bisect) * textDist;
                
                let rotation = a1 * 180 / Math.PI;
                let angleDeg = diff * 180 / Math.PI;
                if (angleDeg > 180) {
                  rotation = a2 * 180 / Math.PI;
                  angleDeg = 360 - angleDeg;
                }
                
                const offsetX = m.labelOffset?.x ?? 0;
                const offsetY = m.labelOffset?.y ?? 0;
                const isHovered = hoveredId === m.id;
                const isSelected = selectedObjectIds.includes(m.id);
                const color = (isHovered && activeTool === 'delete') ? "#ef4444" : (isSelected ? "#b45309" : "#d97706");
                
                return (
                  <Group key={m.id} id={m.id} name="measurement_label"
                     onMouseEnter={() => setHoveredId(m.id)}
                     onMouseLeave={() => setHoveredId(null)}>
                    <KonvaArc
                      x={p2.x}
                      y={p2.y}
                      innerRadius={0}
                      outerRadius={20}
                      angle={angleDeg}
                      rotation={rotation}
                      fill={color === "#ef4444" ? "rgba(239, 68, 68, 0.2)" : (isSelected ? "rgba(180, 83, 9, 0.2)" : "rgba(245, 158, 11, 0.2)")}
                      stroke={color}
                      strokeWidth={isSelected || (isHovered && activeTool === 'delete') ? 2 : 1}
                    />
                    <KonvaText 
                      x={tx - 15 + offsetX} 
                      y={ty - 8 + offsetY} 
                      text={ang} 
                      fill={color} 
                      fontSize={14} 
                      fontStyle="bold" 
                      draggable={activeTool === 'select'}
                      onDragStart={(e) => {
                         if (activeTool === 'select') {
                             saveHistory();
                             e.cancelBubble = true;
                         }
                      }}
                      onDragMove={(e) => {
                         if (activeTool === 'select') {
                             const nx = e.target.x() - (tx - 15);
                             const ny = e.target.y() - (ty - 8);
                             setMeasurements(prev => prev.map(oldM => oldM.id === m.id ? { ...oldM, labelOffset: { x: nx, y: ny } } : oldM));
                         }
                      }}
                      onMouseEnter={(e) => {
                         const container = e.target.getStage()?.container();
                         if (container && activeTool === 'select') container.style.cursor = 'move';
                      }}
                      onMouseLeave={(e) => {
                         const container = e.target.getStage()?.container();
                         if (container) container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
                      }}
                    />
                  </Group>
                );
              } else if (m.type === 'perimeter') {
                const pts = m.points.map(pid => evalPoints[pid]).filter(Boolean) as {x: number, y: number}[];
                if (pts.length < 3) return null;
                const perimeter = calculatePolygonPerimeter(pts);
                const centroid = calculatePolygonCentroid(pts);
                const offsetX = m.labelOffset?.x ?? 0;
                const offsetY = m.labelOffset?.y ?? 0;
                const isHovered = hoveredId === m.id;
                const isSelected = selectedObjectIds.includes(m.id);
                const color = (isHovered && activeTool === 'delete') ? "#ef4444" : (isSelected ? "#312e81" : "#4f46e5");
                return (
                  <Group key={m.id} id={m.id} name="measurement_label" x={centroid.x} y={centroid.y}
                     onMouseEnter={() => setHoveredId(m.id)}
                     onMouseLeave={() => setHoveredId(null)}>
                    <KonvaLine
                      points={pts.flatMap(p => [p.x - centroid.x, p.y - centroid.y])}
                      closed={true}
                      stroke={color}
                      strokeWidth={isSelected ? 3 : 2}
                      dash={[5, 5]}
                    />
                    <KonvaRect
                      x={offsetX - 25}
                      y={offsetY - 12}
                      width={50}
                      height={24}
                      fill="white"
                      cornerRadius={4}
                      stroke={color}
                      strokeWidth={1}
                      draggable={activeTool === 'select'}
                      onDragStart={(e) => {
                         if (activeTool === 'select') {
                             saveHistory();
                             e.cancelBubble = true;
                         }
                      }}
                      onDragMove={(e) => {
                         if (activeTool === 'select') {
                             // Limit drag distance
                             const MAX_DRAG = 50;
                             const tx = e.target.x();
                             const ty = e.target.y();
                             const dist = Math.hypot(tx - (offsetX - 25), ty - (offsetY - 12));
                             if (dist > MAX_DRAG) {
                                 const nx = (offsetX - 25) + (tx - (offsetX - 25)) * MAX_DRAG / dist;
                                 const ny = (offsetY - 12) + (ty - (offsetY - 12)) * MAX_DRAG / dist;
                                 e.target.x(nx);
                                 e.target.y(ny);
                             }
                             const rx = e.target.x() - (offsetX - 25);
                             const ry = e.target.y() - (offsetY - 12);
                             setMeasurements(prev => prev.map(oldM => oldM.id === m.id ? { ...oldM, labelOffset: { x: (oldM.labelOffset?.x || 0) + rx, y: (oldM.labelOffset?.y || 0) + ry } } : oldM));
                         }
                      }}
                      onMouseEnter={(e) => {
                         const container = e.target.getStage()?.container();
                         if (container && activeTool === 'select') container.style.cursor = 'move';
                      }}
                      onMouseLeave={(e) => {
                         const container = e.target.getStage()?.container();
                         if (container) container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
                      }}
                    />
                    <KonvaText
                      x={offsetX - 25}
                      y={offsetY - 8}
                      text={`${Math.round(perimeter)}`}
                      fill={color}
                      fontSize={14}
                      fontStyle="bold"
                      width={50}
                      align="center"
                      listening={false}
                    />
                  </Group>
                );
              } else if (m.type === 'area') {
                const poly = polygons.find(p => p.id === m.polygonId);
                if (!poly) return null;
                const pts = poly.points.map(pid => evalPoints[pid]).filter(Boolean) as {x: number, y: number}[];
                if (pts.length < 3) return null;
                const area = calculatePolygonArea(pts);
                const centroid = calculatePolygonCentroid(pts);
                const offsetX = m.labelOffset?.x ?? 0;
                const offsetY = m.labelOffset?.y ?? 0;
                const isHovered = hoveredId === m.id;
                const isSelected = selectedObjectIds.includes(m.id);
                const color = (isHovered && activeTool === 'delete') ? "#ef4444" : (isSelected ? "#312e81" : "#4f46e5");
                return (
                  <Group key={m.id} id={m.id} name="measurement_label" x={centroid.x} y={centroid.y}
                     onMouseEnter={() => setHoveredId(m.id)}
                     onMouseLeave={() => setHoveredId(null)}>
                    <KonvaText 
                      x={offsetX} 
                      y={offsetY} 
                      text={`S ≈ ${Math.round(area)}`} 
                      fontSize={16} 
                      fill={color} 
                      fontStyle="bold" 
                      stroke="#ffffff" 
                      strokeWidth={3} 
                      fillAfterStrokeEnabled={true} 
                      draggable={activeTool === 'select'}
                      onDragStart={(e) => {
                         if (activeTool === 'select') {
                             saveHistory();
                             e.cancelBubble = true;
                         }
                      }}
                      onDragMove={(e) => {
                         if (activeTool === 'select') {
                             const nx = e.target.x();
                             const ny = e.target.y();
                             setMeasurements(prev => prev.map(oldM => oldM.id === m.id ? { ...oldM, labelOffset: { x: nx, y: ny } } : oldM));
                         }
                      }}
                      onMouseEnter={(e) => {
                         const container = e.target.getStage()?.container();
                         if (container && activeTool === 'select') container.style.cursor = 'move';
                      }}
                      onMouseLeave={(e) => {
                         const container = e.target.getStage()?.container();
                         if (container) container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
                      }}
                    />
                  </Group>
                );
              }
              return null;
            })}

            {/* Temporary drawing */}
            {selectedIds.length > 0 && mousePos && (
              <Group>
                {(activeTool === 'segment' || activeTool === 'line' || activeTool === 'ray' || activeTool === 'circle' || activeTool === 'measure_distance' || activeTool === 'perp_bisector') && evalPoints[selectedIds[0]] && (
                  <KonvaLine
                    points={[evalPoints[selectedIds[0]].x, evalPoints[selectedIds[0]].y, mousePos.x, mousePos.y]}
                    stroke="#94a3b8" strokeWidth={2} dash={[5, 5]}
                  />
                )}
                {activeTool === 'midpoint' && evalPoints[selectedIds[0]] && (
                  <KonvaCircle
                    x={(evalPoints[selectedIds[0]].x + mousePos.x) / 2}
                    y={(evalPoints[selectedIds[0]].y + mousePos.y) / 2}
                    radius={5} fill="#94a3b8"
                  />
                )}
                {(activeTool === 'polygon' || activeTool === 'measure_perimeter') && (
                  <KonvaLine
                    points={[
                      ...selectedIds.map(id => evalPoints[id]).filter(Boolean).flatMap(p => [p.x, p.y]),
                      mousePos.x, mousePos.y
                    ]}
                    closed={selectedIds.length >= 2}
                    fill={selectedIds.length >= 2 ? (activeTool === 'polygon' ? "rgba(79, 70, 229, 0.1)" : "transparent") : undefined}
                    stroke="#94a3b8" strokeWidth={2} dash={[5, 5]}
                  />
                )}
                {(activeTool === 'bisector' || activeTool === 'measure_angle' || activeTool === 'centroid' || activeTool === 'median') && selectedIds.length === 1 && evalPoints[selectedIds[0]] && (
                  <KonvaLine points={[evalPoints[selectedIds[0]].x, evalPoints[selectedIds[0]].y, mousePos.x, mousePos.y]} stroke="#94a3b8" strokeWidth={2} dash={[5, 5]} />
                )}
                {(activeTool === 'bisector' || activeTool === 'measure_angle' || activeTool === 'centroid' || activeTool === 'median') && selectedIds.length === 2 && evalPoints[selectedIds[0]] && evalPoints[selectedIds[1]] && (
                  <>
                    <KonvaLine points={[evalPoints[selectedIds[0]].x, evalPoints[selectedIds[0]].y, evalPoints[selectedIds[1]].x, evalPoints[selectedIds[1]].y]} stroke="#94a3b8" strokeWidth={2} dash={[5, 5]} />
                    <KonvaLine points={[evalPoints[selectedIds[1]].x, evalPoints[selectedIds[1]].y, mousePos.x, mousePos.y]} stroke="#94a3b8" strokeWidth={2} dash={[5, 5]} />
                    {(activeTool === 'centroid' || activeTool === 'median') && (
                      <KonvaLine points={[mousePos.x, mousePos.y, evalPoints[selectedIds[0]].x, evalPoints[selectedIds[0]].y]} stroke="#94a3b8" strokeWidth={2} dash={[5, 5]} />
                    )}
                  </>
                )}
                {(activeTool === 'perpendicular' || activeTool === 'parallel' || activeTool === 'tangent') && (
                  <KonvaLine
                    points={
                      selectedIds.find(id => points.find(p => p.id === id))
                        ? [evalPoints[selectedIds.find(id => points.find(p => p.id === id))!].x, evalPoints[selectedIds.find(id => points.find(p => p.id === id))!].y, mousePos.x, mousePos.y]
                        : [mousePos.x, mousePos.y, mousePos.x + 10, mousePos.y + 10] // placeholder
                    }
                    stroke="#94a3b8" strokeWidth={2} dash={[5, 5]}
                  />
                )}
              </Group>
            )}

            {points.map(point => {
              const ep = evalPoints[point.id];
              if (!ep) return null;
              const isSelected = selectedObjectIds.includes(point.id);
              const color = point.color || (point.type === 'free' ? "#3b82f6" : "#8b5cf6");
              return (
                <Group key={point.id} x={ep.x} y={ep.y}>
                  <KonvaCircle
                    x={0}
                    y={0}
                    radius={hoveredId === point.id || isSelected ? 7 : 5}
                    fill={hoveredId === point.id && activeTool === 'delete' ? "#ef4444" : color}
                    stroke={hoveredId === point.id && activeTool === 'delete' ? "#ef4444" : (isSelected ? "#000000" : "#ffffff")}
                    strokeWidth={2}
                    draggable={activeTool === 'select' && point.type === 'free'}
                    dragBoundFunc={(pos) => getSnappedPos(pos)}
                    onDragStart={(e) => handleObjectDragStart(e, point.id)}
                    onDragMove={(e) => {
                      handleObjectDragMove(e, point.id);
                      e.target.position({ x: 0, y: 0 }); // reset relative position so it doesn't drift from text
                    }}
                    onDragEnd={(e) => {
                      handleObjectDragEnd(e);
                      e.target.position({ x: 0, y: 0 }); // reset relative position just in case
                      const container = e.target.getStage()?.container();
                      if (container && activeTool === 'select' && point.type === 'free') container.style.cursor = 'grab';
                    }}
                    onMouseEnter={(e) => {
                      setHoveredId(point.id);
                      const container = e.target.getStage()?.container();
                      if (container && activeTool === 'select' && point.type === 'free') container.style.cursor = 'grab';
                    }}
                    onMouseLeave={(e) => {
                      setHoveredId(null);
                      const container = e.target.getStage()?.container();
                      if (container) container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
                    }}
                  />
                  <KonvaText 
                    text={point.name} 
                    x={point.labelOffset?.x ?? 5} 
                    y={point.labelOffset?.y ?? -10} 
                    fontSize={14} 
                    fontFamily="sans-serif" 
                    fill={color} 
                    fontStyle="bold" 
                    stroke="#ffffff" 
                    strokeWidth={3} 
                    fillAfterStrokeEnabled={true} 
                    draggable={activeTool === 'select'}
                    onDragStart={(e) => {
                       if (activeTool === 'select') {
                           saveHistory();
                           e.cancelBubble = true;
                       }
                    }}
                    onDragMove={(e) => {
                       if (activeTool === 'select') {
                           const nx = e.target.x();
                           const ny = e.target.y();
                           setPoints(prev => prev.map(p => p.id === point.id ? { ...p, labelOffset: { x: nx, y: ny } } : p));
                       }
                    }}
                    onMouseEnter={(e) => {
                       const container = e.target.getStage()?.container();
                       if (container && activeTool === 'select') container.style.cursor = 'move';
                    }}
                    onMouseLeave={(e) => {
                       const container = e.target.getStage()?.container();
                       if (container) container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
                    }}
                  />
                </Group>
              );
            })}

            {textLabels.map(t => {
              const isSelected = selectedObjectIds.includes(t.id);
              const color = t.color || "#334155";
              return (
              <KonvaText
                key={t.id}
                x={t.x}
                y={t.y}
                rotation={t.rotation || 0}
                text={editingText?.id === t.id ? '' : t.text}
                fontSize={16}
                fontFamily="sans-serif"
                fill={color}
                stroke={isSelected ? "#cbd5e1" : undefined}
                strokeWidth={isSelected ? 1 : 0}
                draggable={activeTool === 'select'}
                dragBoundFunc={(pos) => getSnappedPos(pos)}
                onDragStart={(e) => handleObjectDragStart(e, t.id)}
                onDragMove={(e) => handleObjectDragMove(e, t.id)}
                onDragEnd={(e) => {
                  handleObjectDragEnd(e);
                  const container = e.target.getStage()?.container();
                  if (container && activeTool === 'select') container.style.cursor = 'grab';
                }}
                onDblClick={() => {
                  if (activeTool === 'select') {
                    setEditingText(t);
                  }
                }}
                onMouseEnter={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container && activeTool === 'select') container.style.cursor = 'grab';
                }}
                onMouseLeave={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container) container.style.cursor = activeTool === 'select' ? 'default' : (activeTool === 'delete' ? 'cursor-not-allowed' : 'crosshair');
                }}
              />
              );
            })}

            {isRulerVisible && (
              <Group
                x={rulerState.x}
                y={rulerState.y}
                offsetX={rulerState.length / 2}
                offsetY={20}
                rotation={rulerState.rotation}
                draggable
                onDragMove={(e) => {
                  setRulerState(prev => ({ ...prev, x: e.target.x(), y: e.target.y() }));
                }}
              >
                {/* Ruler Body */}
                <KonvaRect
                  width={rulerState.length}
                  height={40}
                  fill="rgba(255, 255, 255, 0.85)"
                  stroke="#94a3b8"
                  strokeWidth={1}
                  cornerRadius={4}
                  shadowColor="black"
                  shadowBlur={10}
                  shadowOpacity={0.1}
                  shadowOffsetY={5}
                />
                
                {/* Tick Marks */}
                {Array.from({ length: rulerState.length / 10 + 1 }).map((_, i) => {
                  const isMajor = i % 5 === 0;
                  const isText = i % 10 === 0;
                  return (
                    <Group key={i} x={i * 10} y={0}>
                      <KonvaLine
                        points={[0, 0, 0, isMajor ? 15 : 8]}
                        stroke="#64748b"
                        strokeWidth={isMajor ? 1.5 : 1}
                      />
                      {isText && (
                        <KonvaText
                          x={-10}
                          y={18}
                          text={`${i}`}
                          fontSize={10}
                          fill="#64748b"
                          width={20}
                          align="center"
                        />
                      )}
                    </Group>
                  );
                })}

                {/* Center Line / Edge */}
                <KonvaLine points={[0, 0, rulerState.length, 0]} stroke="#4f46e5" strokeWidth={1} opacity={0.5} />

                {/* Rotation Handles */}
                <Group
                  x={0}
                  y={20}
                  draggable
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    const stage = e.target.getStage();
                    const pos = stage.getPointerPosition();
                    if (!pos) return;
                    const dx = pos.x - rulerState.x;
                    const dy = pos.y - rulerState.y;
                    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    angle -= 180;
                    const snap = 15;
                    const snapped = Math.round(angle / snap) * snap;
                    if (Math.abs(angle - snapped) < 5) angle = snapped;
                    setRulerState(prev => ({ ...prev, rotation: angle }));
                    e.target.position({ x: 0, y: 20 });
                  }}
                  onMouseEnter={(e) => {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'grab';
                  }}
                  onMouseLeave={(e) => {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'default';
                  }}
                >
                  <KonvaCircle radius={15} fill="rgba(79, 70, 229, 0.1)" stroke="#4f46e5" strokeWidth={1.5} />
                  <KonvaCircle radius={4} fill="#4f46e5" />
                </Group>

                <Group
                  x={rulerState.length}
                  y={20}
                  draggable
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    const stage = e.target.getStage();
                    const pos = stage.getPointerPosition();
                    if (!pos) return;
                    const dx = pos.x - rulerState.x;
                    const dy = pos.y - rulerState.y;
                    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    const snap = 15;
                    const snapped = Math.round(angle / snap) * snap;
                    if (Math.abs(angle - snapped) < 5) angle = snapped;
                    setRulerState(prev => ({ ...prev, rotation: angle }));
                    e.target.position({ x: rulerState.length, y: 20 });
                  }}
                  onMouseEnter={(e) => {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'grab';
                  }}
                  onMouseLeave={(e) => {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'default';
                  }}
                >
                  <KonvaCircle radius={15} fill="rgba(79, 70, 229, 0.1)" stroke="#4f46e5" strokeWidth={1.5} />
                  <KonvaCircle radius={4} fill="#4f46e5" />
                </Group>

                {/* Angle Display */}
                <KonvaText
                  x={rulerState.length / 2 - 30}
                  y={12}
                  text={`${Math.round(rulerState.rotation < 0 ? rulerState.rotation + 360 : rulerState.rotation) % 360}°`}
                  fontSize={14}
                  fontStyle="bold"
                  fill="#4f46e5"
                  width={60}
                  align="center"
                />
              </Group>
            )}

            {/* Rotation Handle */}
            {transformInfo && (
              <Group>
                <KonvaRect
                  x={transformInfo.minX - 10}
                  y={transformInfo.minY - 10}
                  width={transformInfo.maxX - transformInfo.minX + 20}
                  height={transformInfo.maxY - transformInfo.minY + 20}
                  stroke="#3b82f6"
                  strokeWidth={1}
                  dash={[4, 4]}
                />
                <KonvaLine
                  points={[
                    isRotating && rotationStateRef.current ? rotationStateRef.current.center.x : transformInfo.center.x, 
                    isRotating && rotationStateRef.current ? rotationStateRef.current.center.y : transformInfo.center.y, 
                    isRotating && dragHandlePos ? dragHandlePos.x : transformInfo.handlePos.x, 
                    isRotating && dragHandlePos ? dragHandlePos.y : transformInfo.handlePos.y
                  ]}
                  stroke="#3b82f6"
                  strokeWidth={1}
                  dash={[4, 4]}
                />
                <KonvaCircle
                  x={isRotating && dragHandlePos ? dragHandlePos.x : transformInfo.handlePos.x}
                  y={isRotating && dragHandlePos ? dragHandlePos.y : transformInfo.handlePos.y}
                  radius={6}
                  fill="#ffffff"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  draggable
                  onMouseEnter={(e) => {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'grab';
                  }}
                  onMouseLeave={(e) => {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'default';
                  }}
                  onDragStart={(e) => {
                    e.cancelBubble = true;
                    saveHistory();
                    setIsRotating(true);
                    setDragHandlePos({ x: e.target.x(), y: e.target.y() });
                    const initialAngle = Math.atan2(e.target.y() - transformInfo.center.y, e.target.x() - transformInfo.center.x);
                    const initialPoints: Record<string, {x: number, y: number}> = {};
                    transformInfo.freePointIds.forEach(id => {
                      initialPoints[id] = { ...evalPoints[id] };
                    });
                    const initialTextRotations: Record<string, number> = {};
                    const initialTextPositions: Record<string, {x: number, y: number}> = {};
                    transformInfo.textIds.forEach(id => {
                      const txt = textLabels.find(t => t.id === id);
                      if (txt) {
                        initialTextRotations[id] = txt.rotation || 0;
                        initialTextPositions[id] = { x: txt.x, y: txt.y };
                      }
                    });
                    rotationStateRef.current = {
                      center: transformInfo.center,
                      initialAngle,
                      initialPoints,
                      initialTextRotations,
                      initialTextPositions,
                      freePointIds: transformInfo.freePointIds,
                      textIds: transformInfo.textIds
                    };
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    setDragHandlePos({ x: e.target.x(), y: e.target.y() });
                    if (!rotationStateRef.current) return;
                    const state = rotationStateRef.current;
                    const currentAngle = Math.atan2(e.target.y() - state.center.y, e.target.x() - state.center.x);
                    const deltaAngle = currentAngle - state.initialAngle;
                    
                    if (state.textIds && state.textIds.length > 0) {
                      setTextLabels(prev => prev.map(t => {
                        if (state.textIds.includes(t.id)) {
                          const initialPos = state.initialTextPositions[t.id];
                          const cos = Math.cos(deltaAngle);
                          const sin = Math.sin(deltaAngle);
                          const cx = state.center.x;
                          const cy = state.center.y;
                          const nx = (cos * (initialPos.x - cx)) - (sin * (initialPos.y - cy)) + cx;
                          const ny = (sin * (initialPos.x - cx)) + (cos * (initialPos.y - cy)) + cy;
                          return { ...t, x: nx, y: ny, rotation: (state.initialTextRotations[t.id] + (deltaAngle * 180 / Math.PI)) };
                        }
                        return t;
                      }));
                    }
                    
                    if (state.freePointIds && state.freePointIds.length > 0) {
                      setPoints(prev => prev.map(p => {
                        if (state.freePointIds.includes(p.id)) {
                          const initialPos = state.initialPoints[p.id];
                          const cos = Math.cos(deltaAngle);
                          const sin = Math.sin(deltaAngle);
                          const cx = state.center.x;
                          const cy = state.center.y;
                          const nx = (cos * (initialPos.x - cx)) - (sin * (initialPos.y - cy)) + cx;
                          const ny = (sin * (initialPos.x - cx)) + (cos * (initialPos.y - cy)) + cy;
                          return { ...p, x: nx, y: ny };
                        }
                        return p;
                      }));
                    }
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                    setIsRotating(false);
                    setDragHandlePos(null);
                    rotationStateRef.current = null;
                  }}
                />
              </Group>
            )}
          </Layer>
        </Stage>

        {mousePos && activeTool !== 'select' && getCursorTooltip() && (
          <div
            className="absolute pointer-events-none bg-slate-800/80 text-white text-xs px-2 py-1 rounded shadow-sm z-50 whitespace-nowrap backdrop-blur-sm"
            style={{
              left: mousePos.x + 15,
              top: mousePos.y + 15,
            }}
          >
            {getCursorTooltip()}
          </div>
        )}

        {editingText && (
          <input
            autoFocus
            value={editingText.text}
            onChange={(e) => {
              const newText = e.target.value;
              setEditingText({ ...editingText, text: newText });
              setTextLabels(prev => prev.map(t => t.id === editingText.id ? { ...t, text: newText } : t));
            }}
            onBlur={() => {
              if (editingText.text.trim() === '') {
                setTextLabels(prev => prev.filter(t => t.id !== editingText.id));
              }
              setEditingText(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            style={{
              position: 'absolute',
              top: editingText.y - 4,
              left: editingText.x - 4,
              margin: 0,
              padding: '2px 4px',
              border: '2px solid #4f46e5',
              borderRadius: '4px',
              outline: 'none',
              background: 'white',
              color: '#334155',
              fontSize: '16px',
              fontFamily: 'sans-serif',
              minWidth: '100px',
              zIndex: 100,
            }}
          />
        )}
        
        {renderPropertiesPanel()}
      </div>
      
      <div className="bg-slate-100 border-t border-slate-200 p-2 text-xs text-slate-500 flex justify-between shadow-inner">
        <div>
          {activeTool === 'select' && 'Nhấn và kéo các điểm hoặc chữ để di chuyển.'}
          {activeTool === 'point' && 'Nhấn bất kỳ đâu để tạo điểm.'}
          {activeTool === 'midpoint' && 'Chọn 2 điểm để tạo trung điểm.'}
          {activeTool === 'centroid' && 'Chọn 3 điểm để tạo trọng tâm.'}
          {activeTool === 'intersection' && 'Chọn 2 đường thẳng để tạo giao điểm.'}
          {activeTool === 'segment' && 'Chọn 2 điểm để tạo đoạn thẳng.'}
          {activeTool === 'line' && 'Chọn 2 điểm để tạo đường thẳng.'}
          {activeTool === 'ray' && 'Chọn điểm bắt đầu, sau đó chọn hướng.'}
          {activeTool === 'perpendicular' && 'Chọn 1 điểm và 1 đường thẳng.'}
          {activeTool === 'parallel' && 'Chọn 1 điểm và 1 đường thẳng.'}
          {activeTool === 'bisector' && 'Chọn 3 điểm (điểm thứ 2 là đỉnh góc).'}
          {activeTool === 'perp_bisector' && 'Chọn 2 điểm để tạo đường trung trực.'}
          {activeTool === 'median' && 'Chọn 3 điểm (điểm đầu tiên là đỉnh).'}
          {activeTool === 'circle' && 'Chọn tâm, sau đó chọn 1 điểm trên đường tròn.'}
          {activeTool === 'inscribed_circle' && 'Nhấn vào một đa giác để vẽ đường tròn nội tiếp (hoặc tương đương).'}
          {activeTool === 'tangent' && 'Chọn 1 điểm ngoại vi và 1 đường tròn để vẽ tiếp tuyến.'}
          {activeTool === 'polygon' && 'Chọn các đỉnh, nhấn lại đỉnh đầu tiên để đóng.'}
          {activeTool === 'measure_distance' && 'Chọn 2 điểm để đo khoảng cách.'}
          {activeTool === 'measure_angle' && 'Chọn 3 điểm để đo góc (điểm thứ 2 là đỉnh).'}
          {activeTool === 'measure_area' && 'Nhấn vào một đa giác để hiển thị diện tích của nó.'}
          {activeTool === 'measure_perimeter' && 'Chọn các đỉnh, nhấn lại đỉnh đầu tiên để hiển thị chu vi.'}
          {activeTool === 'text' && 'Nhấn bất kỳ đâu để thêm chữ. Nhấn đúp vào chữ ở chế độ Chọn để sửa.'}
          {activeTool === 'delete' && 'Nhấn vào điểm, đường thẳng, đường tròn, đa giác hoặc chữ để xóa.'}
        </div>
        <div className="font-medium">
          {points.length} điểm | {lines.length} đường | {circles.length} đường tròn | {polygons.length} đa giác | {measurements.length} phép đo | {textLabels.length} nhãn
        </div>
      </div>
    </div>
  );
}
