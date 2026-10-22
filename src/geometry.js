const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const scale = (v, k) => v.map(x => x * k);

/**
 * Unit plane n·p + constant = 0. Rejects nonfinite coordinates, coincident
 * points, and numerically collinear directions (sine of angle <= 1e-12).
 * The normal follows the supplied point order; inputs are never modified.
 */
export function planeFromPoints(a, b, c) {
  for (const p of [a,b,c]) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) {
      throw new Error('Expected three finite 3D points');
    }
  }
  const ab = sub(b, a), ac = sub(c, a);
  const abLength = Math.hypot(...ab), acLength = Math.hypot(...ac);
  if (!Number.isFinite(abLength) || !Number.isFinite(acLength) || !abLength || !acLength) {
    throw new Error('Points must be distinct and numerically representable');
  }
  const raw = cross(scale(ab, 1 / abLength), scale(ac, 1 / acLength));
  const length = Math.hypot(...raw);
  if (length <= 1e-12) throw new Error('Points are collinear');
  const normal = scale(raw, 1 / length);
  const constant = -dot(normal, a);
  if (!Number.isFinite(constant)) throw new Error('Plane is not numerically representable');
  return { normal, constant };
}

const planeFromTriplet = points => {
  if (!Array.isArray(points) || points.length !== 3) throw new Error('Expected exactly three plane points');
  return planeFromPoints(...points);
};

/** Compare normalized equations, ignoring normal sign; invalid inputs throw Error. */
export function samePlane(pointsA, pointsB, tolerance = 1e-6) {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('Tolerance must be finite and nonnegative');
  const a = planeFromTriplet(pointsA), b = planeFromTriplet(pointsB);
  const sign = dot(a.normal,b.normal) < 0 ? -1 : 1;
  return Math.hypot(...sub(a.normal, scale(b.normal,sign))) <= tolerance
    && Math.abs(a.constant - sign*b.constant) <= tolerance;
}

const SECTION_EPSILON = 1e-8;

/**
 * Intersect a convex polyhedron with a plane given by exactly three points.
 * Polygon vertices are unique (absolute distance tolerance 1e-8), ordered
 * counterclockwise viewed along the returned normal, starting lexicographically.
 * A disjoint plane, vertex-only touch, edge-only touch, or area <= 1e-16
 * consistently returns { points: [], area: 0, normal, constant }.
 * Coplanar faces count as actual polygons. Invalid plane inputs throw Error.
 */
export function intersectPlane(shape, points) {
  const plane = planeFromTriplet(points);
  const { normal, constant } = plane;
  const vertices = new Map(shape.vertices.map(v => [v.id, v.position]));
  const hits = [];
  const add = p => {
    if (!hits.some(q => Math.hypot(...sub(p,q)) <= SECTION_EPSILON)) hits.push([...p]);
  };
  for (const [from, to] of shape.edges) {
    const a = vertices.get(from), b = vertices.get(to);
    const da = dot(normal, a) + constant, db = dot(normal, b) + constant;
    if (Math.abs(da) <= SECTION_EPSILON) add(a);
    if (Math.abs(db) <= SECTION_EPSILON) add(b);
    if ((da < -SECTION_EPSILON && db > SECTION_EPSILON) || (db < -SECTION_EPSILON && da > SECTION_EPSILON)) {
      const t = da / (da-db);
      add(a.map((x,i) => x + t * (b[i]-x)));
    }
  }
  const empty = () => ({ points: [], area: 0, ...plane });
  if (hits.length < 3) return empty();
  const center = [0,1,2].map(i => hits.reduce((sum,p) => sum+p[i], 0)/hits.length);
  const axis = Math.abs(normal[0]) < .9 ? [1,0,0] : [0,1,0];
  const rawU = cross(axis, normal);
  const u = scale(rawU, 1 / Math.hypot(...rawU)), v = cross(normal,u);
  const angle = p => Math.atan2(dot(sub(p,center),v), dot(sub(p,center),u));
  hits.sort((a,b) => angle(a)-angle(b));
  let area = 0;
  for (let i = 0; i < hits.length; i++) {
    area += dot(normal, cross(sub(hits[i],center), sub(hits[(i+1)%hits.length],center))) / 2;
  }
  area = Math.abs(area);
  if (area <= SECTION_EPSILON ** 2) return empty();
  const compare = (a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2];
  const first = hits.reduce((best,p,i) => compare(p,hits[best]) < 0 ? i : best, 0);
  return { points: [...hits.slice(first), ...hits.slice(0,first)], area, ...plane };
}

const shape = (id, name, ids, positions, edges, faces) => ({
  id, name,
  vertices: ids.map((id, i) => ({ id, label: id, position: positions[i] })),
  edges, faces,
});

export const SHAPES = {
  cube: shape('cube', 'Куб', ['A','B','C','D','A1','B1','C1','D1'],
    [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]],
    [['A','B'],['B','C'],['C','D'],['D','A'],['A1','B1'],['B1','C1'],['C1','D1'],['D1','A1'],['A','A1'],['B','B1'],['C','C1'],['D','D1']],
    [['A','D','C','B'],['A1','B1','C1','D1'],['A','B','B1','A1'],['B','C','C1','B1'],['C','D','D1','C1'],['D','A','A1','D1']]),
  prism: shape('prism', 'Треугольная призма', ['A','B','C','A1','B1','C1'],
    [[-1,-1,-.8],[1,-1,-.8],[0,-1,1],[-1,1,-.8],[1,1,-.8],[0,1,1]],
    [['A','B'],['B','C'],['C','A'],['A1','B1'],['B1','C1'],['C1','A1'],['A','A1'],['B','B1'],['C','C1']],
    [['A','C','B'],['A1','B1','C1'],['A','B','B1','A1'],['B','C','C1','B1'],['C','A','A1','C1']]),
  pyramid: shape('pyramid', 'Четырёхугольная пирамида', ['A','B','C','D','S'],
    [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[0,1.5,0]],
    [['A','B'],['B','C'],['C','D'],['D','A'],['A','S'],['B','S'],['C','S'],['D','S']],
    [['A','D','C','B'],['A','B','S'],['B','C','S'],['C','D','S'],['D','A','S']]),
  cuboid: shape('cuboid', 'Прямоугольный параллелепипед', ['A','B','C','D','A1','B1','C1','D1'],
    [[-1.5,-1,-.75],[1.5,-1,-.75],[1.5,-1,.75],[-1.5,-1,.75],[-1.5,1,-.75],[1.5,1,-.75],[1.5,1,.75],[-1.5,1,.75]],
    [['A','B'],['B','C'],['C','D'],['D','A'],['A1','B1'],['B1','C1'],['C1','D1'],['D1','A1'],['A','A1'],['B','B1'],['C','C1'],['D','D1']],
    [['A','D','C','B'],['A1','B1','C1','D1'],['A','B','B1','A1'],['B','C','C1','B1'],['C','D','D1','C1'],['D','A','A1','D1']]),
  hexprism: shape('hexprism', 'Правильная шестиугольная призма',
    ['A','B','C','D','E','F','A1','B1','C1','D1','E1','F1'],
    [-1,1].flatMap(y => Array.from({length: 6}, (_, i) => [Math.cos(i*Math.PI/3), y, Math.sin(i*Math.PI/3)])),
    [['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A'],
      ['A1','B1'],['B1','C1'],['C1','D1'],['D1','E1'],['E1','F1'],['F1','A1'],
      ['A','A1'],['B','B1'],['C','C1'],['D','D1'],['E','E1'],['F','F1']],
    [['A','B','C','D','E','F'],['F1','E1','D1','C1','B1','A1'],
      ['A','A1','B1','B'],['B','B1','C1','C'],['C','C1','D1','D'],
      ['D','D1','E1','E'],['E','E1','F1','F'],['F','F1','A1','A']]),
  octahedron: shape('octahedron', 'Правильный октаэдр', ['A','B','C','D','S','T'],
    [[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1,0],[0,-1,0]],
    [['A','B'],['B','C'],['C','D'],['D','A'],['A','S'],['B','S'],['C','S'],['D','S'],['A','T'],['B','T'],['C','T'],['D','T']],
    [['A','B','S'],['B','C','S'],['C','D','S'],['D','A','S'],['B','A','T'],['C','B','T'],['D','C','T'],['A','D','T']]),
};
