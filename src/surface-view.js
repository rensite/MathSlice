import * as THREE from 'three';

export function createSurfaceModel(mesh) {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry().setFromPoints(mesh.triangles.flatMap(triangle =>
    triangle.map(index => new THREE.Vector3(...mesh.vertices[index]))));
  geometry.computeVertexNormals();
  const face = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: 0x7fa6d7, side: THREE.DoubleSide, transparent: true, opacity: .105, depthWrite: false,
  }));
  face.name = 'surface-faces';
  face.userData.face = true;
  group.add(face);

  // A bounded sample avoids an opaque-looking triangulation on smooth meshes.
  const edges = new Map();
  for (const triangle of mesh.triangles) for (let i = 0; i < 3; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3];
    edges.set(`${Math.min(a, b)}:${Math.max(a, b)}`, [a, b]);
  }
  const stride = Math.max(1, Math.ceil(edges.size / 240));
  const wireEdges = mesh.gridLines ? mesh.gridLines.flatMap(line=>line.slice(1).map((index,i)=>[line[i],index])) : [...edges.values()].filter((_, i) => i % stride === 0);
  const points = wireEdges
    .flatMap(edge => edge.map(index => new THREE.Vector3(...mesh.vertices[index])));
  const wire = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x354d70, transparent: true, opacity: .32, depthWrite: false }));
  wire.name = 'surface-wire';
  group.add(wire);
  return group;
}

// Plane coordinates use n·p + constant = 0, just like the geometry API.
export function createSurfaceSection(mesh, plane, slice) {
  const group = new THREE.Group();
  if (!Array.isArray(plane?.normal) || plane.normal.length !== 3 || !plane.normal.every(Number.isFinite) || !Number.isFinite(plane.constant)) {
    throw new RangeError('Surface section requires a finite three-component normal and finite constant');
  }
  const normal = new THREE.Vector3(...plane.normal);
  const length = normal.length();
  if (!normal.toArray().every(Number.isFinite) || !Number.isFinite(length) || length === 0 || !Number.isFinite(plane.constant)) {
    throw new RangeError('Surface section requires a finite nonzero plane normal and finite constant');
  }
  normal.divideScalar(length);
  const origin = normal.clone().multiplyScalar(-plane.constant / length);
  const axis = Math.abs(normal.x) < .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = axis.cross(normal).normalize();
  const v = normal.clone().cross(u);
  const project = point => {
    const offset = new THREE.Vector3(...point).sub(origin);
    return new THREE.Vector2(offset.dot(u), offset.dot(v));
  };
  const lift = point => origin.clone().addScaledVector(u, point.x).addScaledVector(v, point.y);
  const corners = [];
  for (let i = 0; i < 8; i++) corners.push(project([0, 1, 2].map(axis => mesh.bounds[(i >> axis) & 1 ? 'max' : 'min'][axis])));
  const size = new THREE.Vector3(...mesh.bounds.max).sub(new THREE.Vector3(...mesh.bounds.min));
  const padding = Math.max(size.x, size.y, size.z, 1e-3) * .3;
  const minX = Math.min(...corners.map(p => p.x)) - padding;
  const maxX = Math.max(...corners.map(p => p.x)) + padding;
  const minY = Math.min(...corners.map(p => p.y)) - padding;
  const maxY = Math.max(...corners.map(p => p.y)) + padding;
  const rectangle = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map(p => new THREE.Vector2(...p));
  const paths = (slice?.paths ?? []).map(path => {
    const points = path.points.map(project);
    if (path.closed && points.length > 1 && points[0].equals(points.at(-1))) points.pop();
    return { points, closed: path.closed };
  });
  const solidLoops = mesh.closed && slice?.area > 0
    ? paths.filter(path => path.closed && path.points.length >= 3 && Math.abs(THREE.ShapeUtils.area(path.points)) > 1e-12).map(path => path.points)
    : [];

  const triangulate = (contour, holes = []) => {
    // ShapeUtils may remove an explicit closing vertex: operate on copies only.
    const outer = contour.map(p => p.clone());
    const inner = holes.map(hole => hole.map(p => p.clone()));
    const triangles = THREE.ShapeUtils.triangulateShape(outer, inner);
    const vertices = [outer, ...inner].flat().map(lift);
    return new THREE.BufferGeometry().setFromPoints(triangles.flat().map(i => vertices[i]));
  };
  const addFill = (name, geometry, opacity, renderOrder) => {
    const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xefa73f, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
    }));
    object.name = name;
    object.renderOrder = renderOrder;
    group.add(object);
  };
  addFill('plane-extension', triangulate(rectangle, solidLoops), .14, 1);
  const boundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...rectangle, rectangle[0]].map(lift)),
    new THREE.LineDashedMaterial({ color: 0xc6841a, transparent: true, opacity: .42, depthWrite: false, dashSize: padding * .18, gapSize: padding * .12 }));
  boundary.name = 'plane-boundary';
  boundary.renderOrder = 1;
  boundary.computeLineDistances();
  group.add(boundary);
  for (const loop of solidLoops) addFill('section-fill', triangulate(loop), .58, 2);
  for (const path of paths) {
    if (path.points.length < 2) continue;
    const Line = path.closed ? THREE.LineLoop : THREE.Line;
    const outline = new Line(new THREE.BufferGeometry().setFromPoints(path.points.map(lift)),
      new THREE.LineBasicMaterial({ color: 0xc6841a, depthTest: false, depthWrite: false }));
    outline.name = 'section-outline';
    outline.renderOrder = 3;
    group.add(outline);
  }
  return group;
}
