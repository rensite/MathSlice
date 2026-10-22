import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createSectionView } from './section-view.js';

// Screen-space widths stay readable on phones; native WebGL lines are usually 1px.
function wideLine(points,name,width,opacity,order,{color=0x00a67d,dashed=false}={}) {
  const geometry=new LineGeometry().setPositions(points.flatMap(point=>point.toArray()));
  const material=new LineMaterial({color,linewidth:width,worldUnits:false,transparent:true,opacity,depthTest:false,depthWrite:false,dashed,dashSize:.12,gapSize:.07});
  const line=new Line2(geometry,material);
  line.name=name;line.renderOrder=order;
  if(dashed)line.computeLineDistances();
  return line;
}

// Compose existing exact section/plane holes, recoloring only the second plane.
export function createPlaneIntersectionView(shape,slices,intersection,{showIntersection=false}={}) {
  const group=new THREE.Group();
  slices.forEach((slice,index)=>{
    if(index===1&&intersection?.relation==='coincident')return;
    const plane=createSectionView(shape,slice);
    plane.name=index?'plane-beta':'plane-alpha';
    if(index)plane.traverse(object=>{
      if(object.material?.color)object.material.color.set(object.name==='section-fill'||object.name==='plane-extension'?0x9c78cf:0x70509b);
    });
    group.add(plane);
  });
  if(!showIntersection||intersection?.relation!=='intersecting')return group;
  const {point,direction}=intersection.line;
  const origin=new THREE.Vector3(...point),axis=new THREE.Vector3(...direction).normalize();
  const bounds=new THREE.Box3().setFromPoints(shape.vertices.map(vertex=>new THREE.Vector3(...vertex.position)));
  const padding=bounds.getSize(new THREE.Vector3()).length()*.3;
  const parameters=shape.vertices.map(vertex=>new THREE.Vector3(...vertex.position).sub(origin).dot(axis));
  const ends=[Math.min(...parameters)-padding,Math.max(...parameters)+padding].map(t=>origin.clone().addScaledVector(axis,t));
  group.add(wideLine(ends,'planes-intersection-line',2,.85,4,{dashed:true}));
  if(intersection.segment.length===2){
    const points=intersection.segment.map(point=>new THREE.Vector3(...point));
    group.add(wideLine(points,'planes-intersection-halo',12,.22,5));
    group.add(wideLine(points,'planes-intersection-contrast',7.5,.95,6,{color:0xffffff}));
    group.add(wideLine(points,'planes-intersection-segment',4.5,1,7));
  }
  return group;
}
