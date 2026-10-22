import { planeFromPoints } from './geometry.js';

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const sub = (a, b) => a.map((value, i) => value - b[i]);
const validatePoint = point => {
  if (!Array.isArray(point) || point.length !== 3 || ![0, 1, 2].every(i => Number.isFinite(point[i]))) {
    throw new TypeError('Expected a finite 3D position array');
  }
};

/**
 * Precompute outward unit supporting planes of an untransformed convex solid.
 * Only body faces occlude; slicing planes and renderer display flags are irrelevant.
 * Each classification is a camera snapshot. pointVisible tests the solid boundary:
 * interior and off-body points return false (within scale-relative roundoff).
 */
export function createSolidVisibility(shape) {
  const positions = new Map(shape.vertices.map(vertex => [vertex.id, [...vertex.position]]));
  const centroid = [0, 1, 2].map(axis => [...positions.values()].reduce((sum, p) => sum + p[axis] / positions.size, 0));
  const radius = Math.max(...[...positions.values()].map(p => Math.hypot(...sub(p, centroid))));
  const boundaryTolerance = radius * 1e-10;
  const planes = shape.faces.map(face => {
    const origin = positions.get(face[0]);
    let { normal } = planeFromPoints(origin, positions.get(face[1]), positions.get(face[2]));
    if (dot(normal, sub(centroid, origin)) > 0) normal = normal.map(value => -value);
    return { normal, origin, ids: new Set(face) };
  });
  const vertexFaces = [...positions.keys()].map(id => [id, planes.filter(plane => plane.ids.has(id))]);
  const edgeFaces = shape.edges.map(([a, b]) => planes.filter(plane => plane.ids.has(a) && plane.ids.has(b)));
  return {
    classify(cameraPositionArray) {
      validatePoint(cameraPositionArray);
      if (!planes.some(plane => dot(plane.normal, sub(cameraPositionArray, plane.origin)) > 0)) {
        throw new RangeError('Camera must be external to the convex solid');
      }
      const facing = new Set(planes.filter(plane => {
        const relative = sub(cameraPositionArray, plane.origin);
        // Per-plane dot-product error, not camera distance: an enormous x must
        // not make a clearly rear-facing y plane count as a silhouette.
        const magnitude = Math.max(radius, ...relative.map((value, i) => Math.abs(value * plane.normal[i])));
        return dot(plane.normal, relative) >= -64 * Number.EPSILON * magnitude;
      }));
      return {
        vertices: Object.fromEntries(vertexFaces.map(([id, faces]) => [id, faces.some(face => facing.has(face))])),
        edges: edgeFaces.map(faces => faces.some(face => facing.has(face))),
        pointVisible(positionArray) {
          validatePoint(positionArray);
          let visibleBoundary = false;
          for (const plane of planes) {
            const distance = dot(plane.normal, sub(positionArray, plane.origin));
            if (distance > boundaryTolerance) return false;
            if (Math.abs(distance) <= boundaryTolerance && facing.has(plane)) visibleBoundary = true;
          }
          return visibleBoundary;
        },
      };
    },
  };
}
