import { planeFromPoints } from './geometry.js';

const EPS = 1e-9;
const dot = (a,b) => a.reduce((s,x,i) => s+x*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale = (a,k) => a.map(x => x*k);
const add = (a,b) => a.map((x,i) => x+b[i]);

/** Unit, closest-to-origin line; segment is clipped only when a convex solid is supplied.
 * Relation uses 1e-9 angular/distance tolerances after normalization, plus
 * floating-point roundoff allowance for very large normalized constants.
 * Face winding is immaterial; normals are oriented away from the vertex centroid.
 */
export function intersectPlanes(firstPlane, secondPlane, shape) {
  const normalize = p => {
    if (!Array.isArray(p?.normal) || p.normal.length !== 3 || !p.normal.every(Number.isFinite) || !Number.isFinite(p.constant)) throw new Error('Expected a finite plane equation');
    const largest = Math.max(...p.normal.map(Math.abs));
    if (!largest) throw new Error('Plane normal must be nonzero');
    const reduced = p.normal.map(x => x/largest), length = Math.hypot(...reduced);
    const constant = (p.constant/length)/largest;
    if (!Number.isFinite(constant)) throw new Error('Plane is not numerically representable');
    return {normal: reduced.map(x => x/length),constant};
  };
  const a = normalize(firstPlane), b = normalize(secondPlane);
  const raw = cross(a.normal,b.normal), length = Math.hypot(...raw);
  // Unit normals make this angular threshold independent of equation scaling.
  if (length <= 1e-9) {
    const sign = dot(a.normal,b.normal) < 0 ? -1 : 1;
    const roundoff = 8*Number.EPSILON*Math.max(Math.abs(a.constant),Math.abs(b.constant));
    return {relation:Math.abs(a.constant-sign*b.constant) <= EPS+roundoff ? 'coincident' : 'parallel',line:null,segment:[]};
  }
  const point = scale(cross(add(scale(a.normal,b.constant),scale(b.normal,-a.constant)),raw),1/(length*length));
  const line = {point,direction:scale(raw,1/length)};
  return {relation:'intersecting',line,segment:shape ? clipLine(line,shape) : []};
}

function clipLine({point,direction},shape) {
  if (!Array.isArray(shape.vertices) || shape.vertices.length < 4 || !Array.isArray(shape.faces) || shape.faces.length < 4) throw new Error('Expected a closed convex solid');
  const vertices = new Map(shape.vertices.map(v => [v.id,v.position]));
  const center = [0,1,2].map(i => shape.vertices.reduce((s,v) => s+v.position[i],0)/shape.vertices.length);
  let low = -Infinity, high = Infinity;
  for (const face of shape.faces) {
    const coords = face.map(id => vertices.get(id));
    let boundary;
    for (let i=1; i<coords.length-1 && !boundary; i++) {
      try { boundary = planeFromPoints(coords[0],coords[i],coords[i+1]); } catch { /* Skip a collinear polygon corner. */ }
    }
    if (!boundary) throw new Error('Invalid solid face');
    const sign = dot(boundary.normal,center)+boundary.constant > 0 ? -1 : 1;
    const distance = sign*(dot(boundary.normal,point)+boundary.constant);
    const slope = sign*dot(boundary.normal,direction);
    if (Math.abs(slope) <= 1e-12) {
      if (distance > EPS) return [];
    } else {
      const t = -distance/slope;
      if (slope > 0) high = Math.min(high,t); else low = Math.max(low,t);
    }
  }
  if (low > high+EPS) return [];
  if (!Number.isFinite(low) || !Number.isFinite(high)) throw new Error('Solid must bound the line');
  const at = t => add(point,scale(direction,t));
  return high-low <= EPS ? [at((low+high)/2)] : [at(low),at(high)];
}
