import * as THREE from 'three';

export function createSolidEdges(shape) {
  const group=new THREE.Group();group.name='solid-edges';
  const positions=new Map(shape.vertices.map(vertex=>[vertex.id,vertex.position]));
  group.userData.endpoints=new Float32Array(shape.edges.flatMap(edge=>edge.flatMap(id=>positions.get(id))));
  for(const [name,material] of [
    ['solid-visible-edges',new THREE.LineBasicMaterial({color:0x354d70,transparent:true,opacity:.86,depthWrite:false})],
    ['solid-hidden-edges',new THREE.LineDashedMaterial({color:0x647d9d,transparent:true,opacity:.36,depthWrite:false,dashSize:.1,gapSize:.07})],
  ]){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(shape.edges.length*6),3).setUsage(THREE.DynamicDrawUsage));
    const line=new THREE.LineSegments(geometry,material);
    line.name=name;line.renderOrder=1;group.add(line);
  }
  updateSolidEdges(group,shape.edges.map(()=>true));
  return group;
}

export function updateSolidEdges(group,visibleEdges) {
  const key=visibleEdges.map(visible=>visible?'1':'0').join('');
  if(group.userData.visibility===key)return;
  group.userData.visibility=key;
  const endpoints=group.userData.endpoints;
  for(const [index,line] of group.children.entries()){
    const attribute=line.geometry.getAttribute('position');
    let count=0;
    visibleEdges.forEach((visible,i)=>{
      if(visible!==(index===0))return;
      attribute.array.set(endpoints.subarray(i*6,i*6+6),count*6);count++;
    });
    line.geometry.setDrawRange(0,count*2);attribute.needsUpdate=true;
    line.geometry.computeBoundingSphere();
    if(line.material.isLineDashedMaterial)line.computeLineDistances();
  }
}
