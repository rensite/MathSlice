import * as THREE from 'three';

// The faint rectangle represents the plane, not the bounds of the section.
// Cut out the section itself so coplanar transparent surfaces never overlap.
export function createSectionView(shape, slice) {
  const group = new THREE.Group();
  if (!slice || slice.points.length < 3) return group;
  const normal = new THREE.Vector3(...slice.normal);
  const origin = normal.clone().multiplyScalar(-slice.constant);
  const axis = Math.abs(normal.x) < .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = axis.cross(normal).normalize();
  const v = normal.clone().cross(u);
  const projected = slice.points.map(p => {
    const offset = new THREE.Vector3(...p).sub(origin);
    return new THREE.Vector2(offset.dot(u), offset.dot(v));
  });
  const bounds = new THREE.Box3().setFromPoints(shape.vertices.map(vertex => new THREE.Vector3(...vertex.position)));
  const size = bounds.getSize(new THREE.Vector3());
  const padding = Math.max(size.x, size.y, size.z) * .3;
  const minX = Math.min(...projected.map(p => p.x)) - padding;
  const maxX = Math.max(...projected.map(p => p.x)) + padding;
  const minY = Math.min(...projected.map(p => p.y)) - padding;
  const maxY = Math.max(...projected.map(p => p.y)) + padding;
  const contour = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map(p => new THREE.Vector2(...p));
  const hole = projected.map(p => p.clone());
  if (!THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
  const triangles = THREE.ShapeUtils.triangulateShape(contour, [hole]);
  const lift = p => origin.clone().addScaledVector(u, p.x).addScaledVector(v, p.y);
  const vertices = [...contour, ...hole].map(lift);
  const exteriorGeometry = new THREE.BufferGeometry().setFromPoints(triangles.flat().map(index => vertices[index]));
  const exterior = new THREE.Mesh(exteriorGeometry, new THREE.MeshBasicMaterial({
    color: 0xefa73f, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false,
  }));
  exterior.name = 'plane-extension';
  exterior.renderOrder = 1;
  group.add(exterior);

  const borderGeometry = new THREE.BufferGeometry().setFromPoints([...contour, contour[0]].map(lift));
  const border = new THREE.Line(borderGeometry, new THREE.LineDashedMaterial({
    color: 0xc6841a, transparent: true, opacity: .42, depthWrite: false,
    dashSize: padding * .18, gapSize: padding * .12,
  }));
  border.name = 'plane-boundary';
  border.renderOrder = 1;
  border.computeLineDistances();
  group.add(border);

  const positions = [];
  for (let i = 1; i < slice.points.length - 1; i++) positions.push(...slice.points[0], ...slice.points[i], ...slice.points[i + 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: 0xefa73f, transparent: true, opacity: .58, side: THREE.DoubleSide, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  fill.name = 'section-fill';
  fill.renderOrder = 2;
  group.add(fill);
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([...slice.points, slice.points[0]].map(p => new THREE.Vector3(...p)));
  const outline = new THREE.Line(outlineGeometry, new THREE.LineBasicMaterial({ color: 0xc6841a, depthTest: false, depthWrite: false }));
  outline.name = 'section-outline';
  outline.renderOrder = 3;
  group.add(outline);
  return group;
}
