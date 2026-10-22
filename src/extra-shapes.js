// Independent sandbox catalog: the original six solids and course stay untouched.
const EPSILON = 1e-9;
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = vector => vector.map(x => x / Math.hypot(...vector));
const letters = count => Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));

/**
 * Small analytic convex hull, used only at module initialization (at most 20
 * vertices). Supporting triples identify planes, not triangle faces: collect
 * ALL coplanar vertices, deduplicate by membership, then wind each polygon
 * outward. Thus pentagon diagonals never become selectable/rendered edges.
 */
function boundary(positions) {
  const polygons = new Map();
  for (let a = 0; a < positions.length - 2; a++) {
    for (let b = a + 1; b < positions.length - 1; b++) {
      for (let c = b + 1; c < positions.length; c++) {
        const raw = cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]));
        if (Math.hypot(...raw) < EPSILON) continue;
        let normal = unit(raw);
        const distances = positions.map(p => dot(normal, sub(p, positions[a])));
        const positive = distances.some(d => d > EPSILON);
        const negative = distances.some(d => d < -EPSILON);
        if (positive && negative) continue;
        if (positive) normal = normal.map(x => -x);
        const indices = distances.flatMap((d, i) => Math.abs(d) <= EPSILON ? [i] : []);
        const key = indices.join(',');
        if (polygons.has(key)) continue;
        const center = [0, 1, 2].map(axis => indices.reduce((sum, i) => sum + positions[i][axis], 0) / indices.length);
        const u = unit(sub(positions[indices[0]], center));
        const v = cross(normal, u);
        const angle = i => {
          const relative = sub(positions[i], center);
          return Math.atan2(dot(relative, v), dot(relative, u));
        };
        polygons.set(key, indices.sort((i, j) => angle(i) - angle(j)));
      }
    }
  }
  return [...polygons.values()];
}

function entry(id, name, shortName, positions, ids = letters(positions.length)) {
  const faces = boundary(positions).map(face => face.map(i => ids[i]));
  const edges = new Map();
  for (const face of faces) for (let i = 0; i < face.length; i++) {
    const edge = [face[i], face[(i + 1) % face.length]];
    const key = [...edge].sort().join(':');
    if (!edges.has(key)) edges.set(key, edge);
  }
  return {
    id, name, shortName,
    vertices: ids.map((id, i) => ({ id, label: id, position: positions[i] })),
    edges: [...edges.values()], faces,
  };
}

const ring = (count, y, radius = 1.1) => Array.from({ length: count }, (_, i) => {
  const angle = -Math.PI / 2 + i * 2 * Math.PI / count;
  return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
});
const prism = (base, shift) => [...base, ...base.map(p => p.map((x, i) => x + shift[i]))];
const prismIds = count => [...letters(count), ...letters(count).map(id => `${id}1`)];
const square = [[-1,-1,-1], [1,-1,-1], [1,-1,1], [-1,-1,1]];
const phi = (1 + Math.sqrt(5)) / 2;
const signs = [-1, 1];
// Golden-ratio coordinates, uniformly scaled; both solids rest at y = -1.
const dodecahedron = [
  ...signs.flatMap(x => signs.flatMap(y => signs.map(z => [x, y, z]))),
  ...signs.flatMap(a => signs.flatMap(b => [[0, a / phi, b * phi], [a / phi, b * phi, 0], [b * phi, 0, a / phi]])),
].map(p => p.map(x => x / phi));
const icosahedron = signs.flatMap(a => signs.flatMap(b => [
  [0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a],
])).map(p => p.map(x => x / phi));

export const EXTRA_SHAPES = {
  tetrahedron: entry('tetrahedron', 'Правильный тетраэдр', 'Тетраэдр',
    [...ring(3, -1), [0, -1 + 1.1 * Math.sqrt(2), 0]], ['A', 'B', 'C', 'S']),
  obliqueprism: entry('obliqueprism', 'Наклонная треугольная призма', 'Наклонная призма',
    prism([[-1,-1,-.8], [.8,-1,-.8], [-.1,-1,.8]], [.5, 2, .3]), prismIds(3)),
  obliquecuboid: entry('obliquecuboid', 'Наклонный параллелепипед', 'Наклонный параллелепипед',
    prism([[-1.2,-1,-.8], [.6,-1,-.8], [.8,-1,.8], [-1,-1,.8]], [.5, 2, .25]), prismIds(4)),
  pentaprism: entry('pentaprism', 'Правильная пятиугольная призма', 'Пятиугольная призма',
    prism(ring(5, -1), [0, 2, 0]), prismIds(5)),
  pentapyramid: entry('pentapyramid', 'Правильная пятиугольная пирамида', 'Пятиугольная пирамида',
    [...ring(5, -1), [0, 1.5, 0]], ['A', 'B', 'C', 'D', 'E', 'S']),
  truncatedpyramid: entry('truncatedpyramid', 'Правильная усечённая четырёхугольная пирамида', 'Усечённая пирамида',
    [...square, ...square.map(([x, , z]) => [x * .5, 1, z * .5])], prismIds(4)),
  dodecahedron: entry('dodecahedron', 'Правильный додекаэдр', 'Додекаэдр', dodecahedron),
  icosahedron: entry('icosahedron', 'Правильный икосаэдр', 'Икосаэдр', icosahedron),
};
