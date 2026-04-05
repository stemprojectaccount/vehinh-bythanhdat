import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Circle as KonvaCircle, Line as KonvaLine, Text as KonvaText, Group, Arc as KonvaArc, Rect as KonvaRect } from 'react-konva';
import { Point, Line, Circle, Polygon, Measurement, ToolType, LineType, TextLabel, Group as GroupType } from './types';
import { generateId, distance, distancePointToLine, distancePointToSegment, distancePointToRay, getNextPointName, calculateAngle, cn, calculatePolygonArea, calculatePolygonCentroid } from './lib/utils';
import { MousePointer2, CircleDot, Minus, ArrowRightLeft, ArrowUpRight, Target, Equal, Split, Circle as CircleIcon, Hexagon, Trash2, Undo2, Crosshair, Ruler, PieChart, Eraser, Type, MoveDiagonal, Triangle, ArrowDownToLine, FoldVertical, SquareDashed, Grid, X, Palette, ChevronDown, Group as GroupIcon, Ungroup } from 'lucide-react';

const SNAP_DISTANCE = 15;
const GRID_SIZE = 20;

export default function App() {
  const [points, setPoints] = useState<Point[]>([]);
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

  let ptsChanged = true;
  let ptsPasses = 0;
  while(ptsChanged && ptsPasses < 5) {
      ptsChanged = false;
      points.forEach(p => {
          if (evalPoints[p.id]) return;
          if (p.type === 'midpoint') {
              const p1 = evalPoints[p.p1!];
              const p2 = evalPoints[p.p2!];
              if (p1 && p2) { evalPoints[p.id] = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 }; ptsChanged = true; }
          } else if (p.type === 'centroid') {
              const p1 = evalPoints[p.p1!];
              const p2 = evalPoints[p.p2!];
              const p3 = evalPoints[p.p3!];
              if (p1 && p2 && p3) { evalPoints[p.id] = { x: (p1.x + p2.x + p3.x)/3, y: (p1.y + p2.y + p3.y)/3 }; ptsChanged = true; }
          }
      });
      ptsPasses++;
  }

  const evalLines: Record<string, {p1: {x:number, y:number}, dx: number, dy: number, type: LineType, p2?: {x:number, y:number}}> = {};
  let changed = true;
  let passes = 0;
  while(changed && passes < 5) {
      changed = false;
      lines.forEach(l => {
          if (evalLines[l.id]) return;
          if (l.type === 'segment' || l.type === 'line' || l.type === 'ray') {
              const p1 = evalPoints[l.p1!];
              const p2 = evalPoints[l.p2!];
              if (p1 && p2) {
                  evalLines[l.id] = { p1, p2, dx: p2.x - p1.x, dy: p2.y - p1.y, type: l.type };
                  changed = true;
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
                  }
                  evalLines[l.id] = { p1: pt, dx, dy, type: 'line' };
                  changed = true;
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
                  const bisectAngle = a1 + diff / 2;
                  evalLines[l.id] = { p1: p2, dx: Math.cos(bisectAngle), dy: Math.sin(bisectAngle), type: 'line' };
                  changed = true;
              }
          } else if (l.type === 'median') {
              const p1 = evalPoints[l.p1!];
              const p2 = evalPoints[l.p2!];
              const p3 = evalPoints[l.p3!];
              if (p1 && p2 && p3) {
                  const midX = (p2.x + p3.x) / 2;
                  const midY = (p2.y + p3.y) / 2;
                  evalLines[l.id] = { p1, dx: midX - p1.x, dy: midY - p1.y, type: 'line' };
                  changed = true;
              }
          } else if (l.type === 'perp_bisector') {
              const p1 = evalPoints[l.p1!];
              const p2 = evalPoints[l.p2!];
              if (p1 && p2) {
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2;
                  evalLines[l.id] = { p1: {x: midX, y: midY}, dx: p1.y - p2.y, dy: p2.x - p1.x, type: 'line' };
                  changed = true;
              }
          }
      });
      passes++;
  }

  const getSnappedPos = (pos: { x: number, y: number }) => {
    if (!snapToGrid) return pos;
    return {
      x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE
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
            const center = evalPoints[c.center];
            const p2 = evalPoints[c.p2];
            if (!center || !p2) continue;
            const radius = distance(center, p2);
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
    if (!clickedPointId && !clickedLineId && !clickedCircleId && !clickedTextId) {
        const clickedOn = e.target;
        if (clickedOn.name() === 'polygon') {
            clickedPolygonId = clickedOn.id();
        }
    }

    if (activeTool === 'select') {
        const clickedId = clickedPointId || clickedLineId || clickedCircleId || clickedTextId || clickedPolygonId;
        
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
        if (clickedPointId || clickedLineId || clickedCircleId || clickedTextId) {
            doSaveHistory();
            if (clickedPointId) {
                const deletedPts = new Set<string>([clickedPointId]);
                let changed = true;
                while (changed) {
                    changed = false;
                    for (const p of points) {
                        if (p.type === 'midpoint' && !deletedPts.has(p.id)) {
                            if (deletedPts.has(p.p1!) || deletedPts.has(p.p2!)) {
                                deletedPts.add(p.id);
                                changed = true;
                            }
                        } else if (p.type === 'centroid' && !deletedPts.has(p.id)) {
                            if (deletedPts.has(p.p1!) || deletedPts.has(p.p2!) || deletedPts.has(p.p3!)) {
                                deletedPts.add(p.id);
                                changed = true;
                            }
                        }
                    }
                }
                setPoints(prev => prev.filter(p => !deletedPts.has(p.id)));
                setLines(prev => prev.filter(l => !deletedPts.has(l.p1!) && !deletedPts.has(l.p2!) && !deletedPts.has(l.p3!) && !deletedPts.has(l.point!)));
                setCircles(prev => prev.filter(c => !deletedPts.has(c.center) && !deletedPts.has(c.p2)));
                const deletedPolys = new Set(polygons.filter(poly => poly.points.some(pt => deletedPts.has(pt))).map(p => p.id));
                setPolygons(prev => prev.filter(poly => !deletedPolys.has(poly.id)));
                setMeasurements(prev => prev.filter(m => {
                    if (m.type === 'area') return !deletedPolys.has(m.polygonId);
                    if (m.type === 'distance') return !deletedPts.has(m.p1) && !deletedPts.has(m.p2);
                    if (m.type === 'angle') return !deletedPts.has(m.p1) && !deletedPts.has(m.p2) && !deletedPts.has(m.p3);
                    return true;
                }));
                setSelectedObjectIds(selectedObjectIds.filter(id => !deletedPts.has(id)));
            } else if (clickedLineId) {
                const deletedLines = new Set<string>([clickedLineId]);
                let changed = true;
                while (changed) {
                    changed = false;
                    for (const l of lines) {
                        if ((l.type === 'parallel' || l.type === 'perpendicular') && !deletedLines.has(l.id)) {
                            if (deletedLines.has(l.baseLine!)) {
                                deletedLines.add(l.id);
                                changed = true;
                            }
                        }
                    }
                }
                setLines(prev => prev.filter(l => !deletedLines.has(l.id)));
                setSelectedObjectIds(selectedObjectIds.filter(id => !deletedLines.has(id)));
            } else if (clickedCircleId) {
                setCircles(prev => prev.filter(c => c.id !== clickedCircleId));
                if (selectedObjectIds.includes(clickedCircleId)) setSelectedObjectIds(selectedObjectIds.filter(id => id !== clickedCircleId));
            } else if (clickedTextId) {
                setTextLabels(prev => prev.filter(t => t.id !== clickedTextId));
                if (selectedObjectIds.includes(clickedTextId)) setSelectedObjectIds(selectedObjectIds.filter(id => id !== clickedTextId));
            }
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
    } else if (activeTool === 'circle') {
        const pId = getOrCreatePoint();
        if (selectedIds.length === 0) {
            setSelectedIds([pId]);
        } else if (selectedIds[0] !== pId) {
            doSaveHistory();
            setCircles(prev => [...prev, { id: generateId(), center: selectedIds[0], p2: pId }]);
            setSelectedIds([]);
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
      
      const idsToMove = selectedObjectIds.includes(id) ? selectedObjectIds : [id];
      
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
        if (circ) {
          if (points.find(p => p.id === circ.center)?.type === 'free') initialPoints[circ.center] = { ...evalPoints[circ.center] };
          if (points.find(p => p.id === circ.p2)?.type === 'free') initialPoints[circ.p2] = { ...evalPoints[circ.p2] };
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
    setSelectedObjectIds([]);
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
      case 'bisector': return step === 0 ? 'Chọn điểm thứ 1' : step === 1 ? 'Chọn đỉnh' : 'Chọn điểm thứ 3';
      case 'measure_angle': return step === 0 ? 'Chọn điểm thứ 1' : step === 1 ? 'Chọn đỉnh' : 'Chọn điểm thứ 3';
      case 'measure_area': return 'Nhấn vào một đa giác để đo diện tích';
      case 'centroid': return step === 0 ? 'Chọn đỉnh thứ 1' : step === 1 ? 'Chọn đỉnh thứ 2' : 'Chọn đỉnh thứ 3';
      case 'median': return step === 0 ? 'Chọn đỉnh' : step === 1 ? 'Chọn điểm đáy thứ 1' : 'Chọn điểm đáy thứ 2';
      case 'polygon': return step === 0 ? 'Chọn đỉnh thứ 1' : step === 1 ? 'Chọn đỉnh thứ 2' : 'Chọn đỉnh tiếp theo hoặc nhấn đỉnh đầu để đóng';
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
        { id: 'bisector', icon: Split, label: 'Phân giác' },
        { id: 'perp_bisector', icon: FoldVertical, label: 'Trung trực' },
        { id: 'median', icon: ArrowDownToLine, label: 'Trung tuyến' },
      ]
    },
    {
      id: 'shape',
      icon: Hexagon,
      label: 'Hình khối',
      tools: [
        { id: 'circle', icon: CircleIcon, label: 'Đường tròn' },
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
      ]
    }
  ];

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
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Tên:</span>
              <span className="font-medium text-slate-800">{pt.name}</span>
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

          {/* Radius (Read-only for now) */}
          {circ && evalPoints[circ.center] && evalPoints[circ.p2] && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Bán kính:</span>
              <span className="font-medium text-slate-800">
                {distance(evalPoints[circ.center], evalPoints[circ.p2]).toFixed(1)}
              </span>
            </div>
          )}

          {/* Area (Read-only) */}
          {poly && (
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
        const c = evalPoints[circ.center];
        const p2 = evalPoints[circ.p2];
        if (c && p2) {
          if (points.find(p => p.id === circ.p2)?.type === 'free') freePointIds.add(circ.p2);
          const r = distance(c, p2);
          allPts.push({x: c.x, y: c.y - r}, {x: c.x, y: c.y + r}, {x: c.x - r, y: c.y}, {x: c.x + r, y: c.y});
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
          <button
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={cn(
              "p-2 rounded-md flex items-center gap-2 transition-colors",
              snapToGrid 
                ? "bg-indigo-100 text-indigo-700 shadow-sm" 
                : "text-slate-600 hover:bg-slate-200"
            )}
            title="Bật/Tắt Bắt dính lưới"
          >
            <Grid className="w-5 h-5" />
          </button>
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
          backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 0)',
          backgroundSize: '20px 20px'
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
              const center = evalPoints[circle.center];
              const p2 = evalPoints[circle.p2];
              if (!center || !p2) return null;
              const radius = distance(center, p2);
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
                return (
                  <Group key={m.id}>
                    <KonvaText x={midX + 5} y={midY + 5} text={dist} fill="#d97706" fontSize={16} fontStyle="bold" />
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
                
                return (
                  <Group key={m.id}>
                    <KonvaArc
                      x={p2.x}
                      y={p2.y}
                      innerRadius={0}
                      outerRadius={20}
                      angle={angleDeg}
                      rotation={rotation}
                      fill="rgba(245, 158, 11, 0.2)"
                      stroke="#d97706"
                      strokeWidth={1}
                    />
                    <KonvaText x={tx - 15} y={ty - 8} text={ang} fill="#d97706" fontSize={14} fontStyle="bold" />
                  </Group>
                );
              } else if (m.type === 'area') {
                const poly = polygons.find(p => p.id === m.polygonId);
                if (!poly) return null;
                const pts = poly.points.map(pid => evalPoints[pid]).filter(Boolean) as {x: number, y: number}[];
                if (pts.length < 3) return null;
                const area = calculatePolygonArea(pts);
                const centroid = calculatePolygonCentroid(pts);
                return (
                  <Group key={m.id} x={centroid.x} y={centroid.y}>
                    <KonvaText text={`S ≈ ${Math.round(area)}`} fontSize={16} fill="#4f46e5" fontStyle="bold" stroke="#ffffff" strokeWidth={3} fillAfterStrokeEnabled={true} />
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
                {activeTool === 'polygon' && (
                  <KonvaLine
                    points={[
                      ...selectedIds.map(id => evalPoints[id]).filter(Boolean).flatMap(p => [p.x, p.y]),
                      mousePos.x, mousePos.y
                    ]}
                    closed={selectedIds.length >= 2}
                    fill={selectedIds.length >= 2 ? "rgba(79, 70, 229, 0.1)" : undefined}
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
                {(activeTool === 'perpendicular' || activeTool === 'parallel') && (
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
                    radius={hoveredId === point.id || isSelected ? 7 : 5}
                    fill={hoveredId === point.id && activeTool === 'delete' ? "#ef4444" : color}
                    stroke={hoveredId === point.id && activeTool === 'delete' ? "#ef4444" : (isSelected ? "#000000" : "#ffffff")}
                    strokeWidth={2}
                    draggable={activeTool === 'select' && point.type === 'free'}
                    dragBoundFunc={(pos) => getSnappedPos(pos)}
                    onDragStart={(e) => handleObjectDragStart(e, point.id)}
                    onDragMove={(e) => handleObjectDragMove(e, point.id)}
                    onDragEnd={(e) => {
                      handleObjectDragEnd(e);
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
                  <KonvaText text={point.name} x={8} y={-15} fontSize={14} fontFamily="sans-serif" fill={color} fontStyle="bold" stroke="#ffffff" strokeWidth={3} fillAfterStrokeEnabled={true} />
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
          {activeTool === 'segment' && 'Chọn 2 điểm để tạo đoạn thẳng.'}
          {activeTool === 'line' && 'Chọn 2 điểm để tạo đường thẳng.'}
          {activeTool === 'ray' && 'Chọn điểm bắt đầu, sau đó chọn hướng.'}
          {activeTool === 'perpendicular' && 'Chọn 1 điểm và 1 đường thẳng.'}
          {activeTool === 'parallel' && 'Chọn 1 điểm và 1 đường thẳng.'}
          {activeTool === 'bisector' && 'Chọn 3 điểm (điểm thứ 2 là đỉnh góc).'}
          {activeTool === 'perp_bisector' && 'Chọn 2 điểm để tạo đường trung trực.'}
          {activeTool === 'median' && 'Chọn 3 điểm (điểm đầu tiên là đỉnh).'}
          {activeTool === 'circle' && 'Chọn tâm, sau đó chọn 1 điểm trên đường tròn.'}
          {activeTool === 'polygon' && 'Chọn các đỉnh, nhấn lại đỉnh đầu tiên để đóng.'}
          {activeTool === 'measure_distance' && 'Chọn 2 điểm để đo khoảng cách.'}
          {activeTool === 'measure_angle' && 'Chọn 3 điểm để đo góc (điểm thứ 2 là đỉnh).'}
          {activeTool === 'measure_area' && 'Nhấn vào một đa giác để hiển thị diện tích của nó.'}
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
