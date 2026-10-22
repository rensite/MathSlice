const finitePosition = vertex => Array.isArray(vertex?.position)
  && vertex.position.length === 3 && vertex.position.every(Number.isFinite);

/**
 * Canonical point on an existing edge, measured from `from` toward `to`.
 * Orient lexically, round to 1e-9, and reuse vertex IDs at rounded endpoints.
 * Invalid endpoints, adjacency or ratios throw Error; inputs remain untouched.
 */
export function edgePointId(shape, from, to, t = 0.5) {
  if (!Number.isFinite(t) || t < 0 || t > 1) {
    throw new Error('Edge ratio must be a finite number in [0, 1]');
  }
  if (!shape || !Array.isArray(shape.vertices) || !Array.isArray(shape.edges)) {
    throw new Error('Expected a solid with vertices and edges');
  }
  for (const id of [from, to]) {
    const vertex = shape.vertices.find(vertex => vertex?.id === id);
    if (typeof id !== 'string' || !vertex) {
      throw new Error('Unknown vertex endpoint');
    }
    if (!finitePosition(vertex)) throw new Error('Vertex endpoints must have finite 3D coordinates');
  }
  if (from === to || !shape.edges.some(([a,b]) => a === from && b === to || a === to && b === from)) {
    throw new Error('Endpoints must form an existing edge');
  }
  const [a, b] = [from, to].sort();
  const ratio = Number((from === a ? t : 1-t).toFixed(9)) || 0;
  if (ratio === 0) return a;
  if (ratio === 1) return b;
  return `edge:${a}:${b}:${ratio}`;
}

const label = id => id.replaceAll('1', '₁');

/** Resolve canonical references only; reversed/noncanonical edge tokens return null. */
export function resolvePoint(shape, id) {
  if (typeof id !== 'string' || !shape || !Array.isArray(shape.vertices) || !Array.isArray(shape.edges)) return null;
  const vertex = shape.vertices.find(vertex => vertex?.id === id);
  if (vertex) return finitePosition(vertex) ? {id, label: label(id), position: [...vertex.position], edge: null, t: null} : null;
  const parts = id.split(':');
  if (parts.length !== 4 || parts[0] !== 'edge') return null;
  const [, from, to, token] = parts;
  const t = Number(token);
  try {
    if (edgePointId(shape, from, to, t) !== id) return null;
  } catch {
    return null;
  }
  const start = shape.vertices.find(vertex => vertex.id === from).position;
  const end = shape.vertices.find(vertex => vertex.id === to).position;
  const fraction = t === 0.5 ? '½' : t === 0.333333333 ? '⅓' : t === 0.666666667 ? '⅔' : `${Number((t*100).toFixed(7))}%`;
  return {
    id, label: `${label(from+to)}·${fraction}`,
    position: start.map((x,i) => x + t*(end[i]-x)), edge: [from,to], t,
  };
}
