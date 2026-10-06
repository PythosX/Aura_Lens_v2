import type { Lm } from "./tracker";
import type { Pt } from "./types";

export type RegionId = "eyes" | "mouth" | "forehead" | "fullFace";

export interface RegionState {
  active: boolean;
  score: number;
  quad: Pt[];
}

export type RegionStates = Record<RegionId, RegionState>;

const ZONES: Record<Exclude<RegionId, "fullFace">, number[]> = {
  eyes: [33, 133, 159, 145, 263, 362, 386, 374, 6, 168],
  mouth: [61, 291, 13, 14, 78, 308, 17, 82, 312],
  forehead: [10, 338, 297, 332, 284, 251, 107, 66, 109, 151],
};

const FULL_FACE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 400, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const mirrored = (p: Lm, W: number, H: number): Pt => ({ x: (1 - p.x) * W, y: p.y * H });

function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x-o.x)*(b.y-o.y) - (a.y-o.y)*(b.x-o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i=pts.length-1; i>=0; i--) {
    const p=pts[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function area(poly: Pt[]) {
  let s=0;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];s+=a.x*b.y-b.x*a.y;}
  return Math.abs(s)/2;
}

function pointInPoly(p: Pt, poly: Pt[]) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if(((a.y>p.y)!==(b.y>p.y)) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}

function centroid(poly: Pt[]): Pt {
  if(!poly.length) return {x:0,y:0};
  return poly.reduce((s,p)=>({x:s.x+p.x,y:s.y+p.y}),{x:0,y:0});
}

function bounds(poly: Pt[]) {
  return poly.reduce((b,p)=>({
    minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),
    minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)
  }),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
}

function overlapScore(hand: Pt[], zone: Pt[]) {
  if (hand.length < 3 || zone.length < 3) return 0;
  const hull = convexHull(hand);
  const zb = bounds(zone), hb = bounds(hull);
  const ix=Math.max(0,Math.min(zb.maxX,hb.maxX)-Math.max(zb.minX,hb.minX));
  const iy=Math.max(0,Math.min(zb.maxY,hb.maxY)-Math.max(zb.minY,hb.minY));
  if(ix*iy===0) return 0;

  const insideHand = zone.filter(p=>pointInPoly(p,hull)).length / zone.length;
  const insideZone = hand.filter(p=>pointInPoly(p,zone)).length / hand.length;
  const center = pointInPoly(centroid(zone),hull) ? 0.25 : 0;
  return Math.min(1, insideHand*0.65 + insideZone*0.35 + center);
}

function regionQuad(zone: Pt[], hand: Pt[]): Pt[] {
  const b=bounds(zone);
  const c=centroid(hand);
  const hx=Math.max(1, b.maxX-b.minX), hy=Math.max(1,b.maxY-b.minY);
  // Use the facial region as the stable base, nudged subtly toward the covering hand.
  const dx=(c.x-(b.minX+b.maxX)/2)*0.08, dy=(c.y-(b.minY+b.maxY)/2)*0.08;
  return [
    {x:b.minX+dx,y:b.minY+dy},{x:b.maxX+dx,y:b.minY+dy},
    {x:b.maxX+dx,y:b.maxY+dy},{x:b.minX+dx,y:b.maxY+dy},
  ];
}

export function detectRegions(face: Lm[], hands: Lm[][], W: number, H: number, threshold=0.12): RegionStates {
  const none: RegionState={active:false,score:0,quad:[]};
  if(face.length<400 || !hands.length) return {eyes:none,mouth:none,forehead:none,fullFace:none};

  const facePts = face.map(p=>mirrored(p,W,H));
  const handPts = hands.map(h=>h.map(p=>mirrored(p,W,H)));
  const zones = {
    eyes: convexHull(ZONES.eyes.map(i=>facePts[i]).filter(Boolean)),
    mouth: convexHull(ZONES.mouth.map(i=>facePts[i]).filter(Boolean)),
    forehead: convexHull(ZONES.forehead.map(i=>facePts[i]).filter(Boolean)),
    fullFace: convexHull(FULL_FACE.map(i=>facePts[i]).filter(Boolean)),
  };

  const states = {} as RegionStates;
  for(const id of ["eyes","mouth","forehead"] as const){
    const scores=handPts.map(h=>overlapScore(h,zones[id]));
    const score=Math.max(...scores,0);
    const hand=handPts[scores.indexOf(score)] ?? [];
    states[id]={active:score>=threshold,score,quad:score>=threshold?regionQuad(zones[id],hand):[]};
  }

  const faceArea=area(zones.fullFace);
  const combined=convexHull(handPts.flat());
  const faceCenter=centroid(zones.fullFace);
  const enclosed=combined.length>2 && pointInPoly(faceCenter,combined);
  const coverage=handPts.reduce((s,h)=>s+overlapScore(h,zones.fullFace),0);
  const twoHands=handPts.length>=2;
  const fullScore=Math.min(1, coverage/1.5 + (enclosed?0.3:0));
  states.fullFace={
    active:twoHands && faceArea>0 && fullScore>=0.5,
    score:fullScore,
    quad:twoHands && fullScore>=0.5 ? [
      {x:zones.fullFace[0].x,y:zones.fullFace[0].y},
      {x:zones.fullFace[Math.floor(zones.fullFace.length/4)].x,y:zones.fullFace[Math.floor(zones.fullFace.length/4)].y},
      {x:zones.fullFace[Math.floor(zones.fullFace.length/2)].x,y:zones.fullFace[Math.floor(zones.fullFace.length/2)].y},
      {x:zones.fullFace[Math.floor(zones.fullFace.length*3/4)].x,y:zones.fullFace[Math.floor(zones.fullFace.length*3/4)].y},
    ] : []
  };
  return states;
}
