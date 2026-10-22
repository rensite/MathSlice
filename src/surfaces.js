// Coordinates use the vertical y axis. Equations describe the sampled surfaces,
// not artificial end caps for the unbounded quadrics.
const definitions = [
  ['sphere','Шар','Шар',true,'Шар радиуса 1 с центром в начале координат.','x² + y² + z² = 1'],
  ['cylinder','Круговой цилиндр','Цилиндр',true,'Замкнутый цилиндр радиуса 1 с двумя основаниями, −1 ≤ y ≤ 1.','x² + z² = 1, −1 ≤ y ≤ 1; основания y = ±1, x² + z² ≤ 1'],
  ['cone','Круговой конус','Конус',true,'Конус с вершиной y = 1, основанием радиуса 1 при y = −1.','x² + z² = ((1 − y)/2)², −1 ≤ y ≤ 1; основание y = −1, x² + z² ≤ 1'],
  ['conefrustum','Усечённый конус','Усеч. конус',true,'Замкнутый усечённый конус: радиусы оснований 1 и 1/2, высота 2.','x² + z² = ((3 − y)/4)², −1 ≤ y ≤ 1; основания: y = −1, x² + z² ≤ 1; y = 1, x² + z² ≤ 1/4'],
  ['ellipsoid','Эллипсоид','Эллипсоид',true,'Замкнутый эллипсоид с полуосями 1,4; 1; 0,8 вдоль x, y, z.','x²/1,4² + y² + z²/0,8² = 1'],
  ['hyperboloid1','Однополостный гиперболоид','1-пол. гиперболоид',false,'Конечный фрагмент неограниченной поверхности, −1 ≤ y ≤ 1; без крышек.','x² + z² − y² = 1'],
  ['hyperboloid2','Двуполостный гиперболоид','2-пол. гиперболоид',false,'Конечный фрагмент обеих полостей неограниченной поверхности, 1 ≤ |y| ≤ √3; без крышек.','y² − x² − z² = 1'],
  ['ellipticparaboloid','Эллиптический параболоид','Элл. параболоид',false,'Конечный фрагмент неограниченной поверхности, 0 ≤ y ≤ 1; без крышки.','y = x² + z²'],
  ['hyperbolicparaboloid','Гиперболический параболоид','Гип. параболоид',false,'Конечный фрагмент неограниченной поверхности, |x| ≤ 1, |z| ≤ 1; края открыты.','y = x² − z²'],
  ['ellipticcylinder','Эллиптический цилиндр','Элл. цилиндр',false,'Конечный фрагмент неограниченной поверхности, −1 ≤ y ≤ 1; без оснований.','x²/1,4² + z²/0,8² = 1'],
  ['hyperboliccylinder','Гиперболический цилиндр','Гип. цилиндр',false,'Конечный фрагмент обеих ветвей неограниченной поверхности, |z| ≤ sinh(1), |y| ≤ 1; края открыты.','x² − z² = 1'],
  ['paraboliccylinder','Параболический цилиндр','Пар. цилиндр',false,'Конечный фрагмент неограниченной поверхности, |x| ≤ 1, |z| ≤ 1; края открыты.','y = x²'],
];
export const SURFACES = Object.freeze(Object.fromEntries(definitions.map(([id,name,shortName,closed,description,equation],i)=>[id,Object.freeze({id,name,shortName,group:i<4?'school':'university',closed,description,equation})])));

const subtract = (a,b) => a.map((v,i)=>v-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);

/** Resolution is an integer in [8, 128]; periodic seams and poles share indices. */
export function surfaceMesh(id, resolution = 36) {
  if(!Object.hasOwn(SURFACES,id)) throw new RangeError('Unknown surface');
  if(!Number.isInteger(resolution) || resolution<8 || resolution>128) throw new RangeError('resolution must be an integer from 8 to 128');
  const n=resolution, vertices=[], triangles=[], gridLines=[], welded=new Map();
  const vertex = p => {
    const key=p.map(v=>Math.round(v*1e10)).join(',');
    if(!welded.has(key)) {welded.set(key,vertices.length);vertices.push(p);}
    return welded.get(key);
  };
  const triangle = (a,b,c) => {
    if(new Set([a,b,c]).size<3) return;
    if(Math.hypot(...cross(subtract(vertices[b],vertices[a]),subtract(vertices[c],vertices[a])))>1e-12) triangles.push([a,b,c]);
  };
  const grid = (fn, periodic=false) => {
    const rows=[];
    for(let i=0;i<=n;i++) {
      const row=[];
      for(let j=0;j<=(periodic?n-1:n);j++) row.push(vertex(fn(j/n,i/n)));
      rows.push(row);
    }
    for(let i=0;i<n;i++) for(let j=0;j<n;j++) {
      const k=periodic?(j+1)%n:j+1;
      triangle(rows[i][j],rows[i+1][j],rows[i][k]);
      triangle(rows[i][k],rows[i+1][j],rows[i+1][k]);
    }
    const samples=Array.from({length:5},(_,i)=>Math.round(i*n/4));
    const line = (indices,closed=false) => {
      const ids=indices.filter((index,i)=>!i || index!==indices[i-1]);
      if(new Set(ids).size<2) return;
      if(closed && ids[0]!==ids.at(-1)) ids.push(ids[0]);
      gridLines.push(ids);
    };
    for(const i of samples) line(rows[i],periodic);
    for(const j of samples) if(!periodic || j<n) line(rows.map(row=>row[j]));
    return rows;
  };
  const revolution = (fn, sx=1, sz=1) => grid((u,v)=>{
    const [r,y]=fn(v), a=2*Math.PI*u;
    return [sx*r*Math.cos(a),y,sz*r*Math.sin(a)];
  },true);
  const caps = rows => {
    for(const [ring,top] of [[rows[0],false],[rows[n],true]]) {
      const center=vertex([0,vertices[ring[0]][1],0]);
      for(let j=0;j<n;j++) {
        const k=(j+1)%n;
        if(top) triangle(center,ring[k],ring[j]);
        else triangle(center,ring[j],ring[k]);
      }
    }
  };
  if(id==='sphere' || id==='ellipsoid') revolution(v=>{
    const a=Math.PI*(v-.5);return [Math.cos(a),Math.sin(a)];
  },id==='ellipsoid'?1.4:1,id==='ellipsoid'?.8:1);
  else if(['cylinder','cone','conefrustum'].includes(id)) {
    const rows=revolution(v=>[id==='cone'?1-v:id==='conefrustum'?1-v/2:1,2*v-1]);caps(rows);
  } else if(id==='hyperboloid1') revolution(v=>{const y=2*v-1;return [Math.sqrt(1+y*y),y];});
  else if(id==='hyperboloid2') for(const sign of [-1,1]) revolution(v=>[Math.SQRT2*v,sign*Math.sqrt(1+2*v*v)]);
  else if(id==='ellipticparaboloid') revolution(v=>[v,v*v]);
  else if(id==='ellipticcylinder') revolution(v=>[1,2*v-1],1.4,.8);
  else if(id==='hyperboliccylinder') for(const sign of [-1,1]) grid((u,v)=>[sign*Math.cosh(2*u-1),2*v-1,Math.sinh(2*u-1)]);
  else grid((u,v)=>{const x=2*u-1,z=2*v-1;return [x,id==='hyperbolicparaboloid'?x*x-z*z:x*x,z];});
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const p of vertices) for(let k=0;k<3;k++) {bounds.min[k]=Math.min(bounds.min[k],p[k]);bounds.max[k]=Math.max(bounds.max[k],p[k]);}
  return {vertices,triangles,gridLines,bounds,closed:SURFACES[id].closed};
}

/** Intersect the actual triangles, preserving their contour graph (no hull).
 * Paths omit a duplicated closing point. A closed surface has a polygonal
 * section area; an open fragment deliberately has no enclosed-solid area.
 */
export function sliceSurface(mesh, plane) {
  const vector = p => Array.isArray(p) && p.length===3 && p.every(Number.isFinite);
  if(!plane || !vector(plane.normal) || !Number.isFinite(plane.constant)) throw new TypeError('Invalid plane');
  const length=Math.hypot(...plane.normal);
  if(!Number.isFinite(length) || length===0) throw new TypeError('Invalid plane normal');
  const normal=plane.normal.map(v=>v/length), constant=plane.constant/length;
  if(!Number.isFinite(constant)) throw new TypeError('Invalid plane constant');
  if(!mesh || !Array.isArray(mesh.vertices) || !mesh.vertices.every(vector) || !Array.isArray(mesh.triangles) || typeof mesh.closed!=='boolean' || !mesh.triangles.every(t=>Array.isArray(t) && t.length===3 && t.every(i=>Number.isInteger(i) && i>=0 && i<mesh.vertices.length))) throw new TypeError('Invalid mesh');
  const epsilon=1e-7, points=[], buckets=new Map(), segments=new Map();
  const weld = p => {
    // Project before welding: near-coplanar input vertices remain on the plane.
    const distance=dot(normal,p)+constant;
    p=p.map((v,k)=>v-distance*normal[k]);
    const cell=p.map(v=>Math.floor(v/epsilon));
    for(let x=-1;x<=1;x++) for(let y=-1;y<=1;y++) for(let z=-1;z<=1;z++) {
      const nearby=buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','));
      if(nearby) for(const id of nearby) if(Math.hypot(...subtract(points[id],p))<=epsilon) return id;
    }
    const id=points.length,key=cell.join(',');points.push(p);
    if(!buckets.has(key)) buckets.set(key,[]);
    buckets.get(key).push(id);return id;
  };
  const edge = (a,b,kind,side=0) => {
    if(a===b) return;
    const key=a<b?`${a}:${b}`:`${b}:${a}`;
    if(!segments.has(key)) segments.set(key,{a,b,coplanar:0,cut:false,sides:0});
    const s=segments.get(key);
    if(kind==='coplanar') s.coplanar++;
    if(kind==='cut') s.cut=true;
    s.sides |= side;
  };
  const distances=mesh.vertices.map(p=>dot(normal,p)+constant);
  const signs=distances.map(d=>Math.abs(d)<=epsilon?0:Math.sign(d));
  for(const triangle of mesh.triangles) {
    const s=triangle.map(i=>signs[i]);
    if(s.every(v=>v===0)) {
      const ids=triangle.map(i=>weld(mesh.vertices[i]));
      for(let k=0;k<3;k++) edge(ids[k],ids[(k+1)%3],'coplanar');
      continue;
    }
    if(s.every(v=>v>0) || s.every(v=>v<0)) continue;
    const hits=[];
    for(let k=0;k<3;k++) {
      const a=triangle[k],b=triangle[(k+1)%3];
      if(signs[a]===0) hits.push(weld(mesh.vertices[a]));
      if(signs[a]*signs[b]<0) {
        const t=distances[a]/(distances[a]-distances[b]);
        hits.push(weld(mesh.vertices[a].map((v,j)=>v+t*(mesh.vertices[b][j]-v))));
      }
    }
    const unique=[...new Set(hits)];
    if(unique.length===2) {
      const alongEdge=s.filter(v=>v===0).length===2;
      edge(unique[0],unique[1],alongEdge?'edge':'cut',alongEdge?(s.includes(1)?1:2):0);
    }
  }
  const edges=[...segments.values()].filter(s=>s.coplanar===1 || (s.coplanar===0 && (s.cut || s.sides===3 || (!mesh.closed && s.sides!==0))));
  const adjacent=new Map();
  edges.forEach((e,id)=>{for(const p of [e.a,e.b]) {if(!adjacent.has(p)) adjacent.set(p,[]);adjacent.get(p).push(id);}});
  const visited=new Set(), paths=[];
  const walk = (start,first) => {
    const chain=[start];let current=start,next=first,closed=false;
    while(next!==undefined && !visited.has(next)) {
      visited.add(next);
      const e=edges[next];current=e.a===current?e.b:e.a;
      if(current===start) {closed=true;break;}
      chain.push(current);
      const neighbors=adjacent.get(current);
      if(neighbors.length!==2) break;
      next=neighbors.find(id=>!visited.has(id));
    }
    if(chain.length>=2) paths.push({points:chain.map(i=>points[i]),closed});
  };
  // Endpoints and junctions first; remaining degree-two components are loops.
  for(const [p,neighbors] of adjacent) if(neighbors.length!==2) for(const e of neighbors) if(!visited.has(e)) walk(p,e);
  edges.forEach((e,i)=>{if(!visited.has(i)) walk(e.a,i);});
  let area=null;
  if(mesh.closed) {
    area=0;
    const loops=paths.filter(path=>path.closed);
    // Drop the most normal-aligned coordinate for stable 2D containment.
    const drop=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    const axes=[0,1,2].filter(k=>k!==drop);
    const contains = (loop,p) => {
      const [u,v]=axes;let inside=false;
      for(let i=0,j=loop.length-1;i<loop.length;j=i++) {
        const a=loop[i],b=loop[j];
        if((a[v]>p[v])!==(b[v]>p[v]) && p[u]<(b[u]-a[u])*(p[v]-a[v])/(b[v]-a[v])+a[u]) inside=!inside;
      }
      return inside;
    };
    for(const path of loops) {
      let twice=0;
      const origin=path.points[0];
      for(let i=1;i<path.points.length-1;i++) twice+=dot(normal,cross(subtract(path.points[i],origin),subtract(path.points[i+1],origin)));
      const depth=loops.filter(other=>other!==path && contains(other.points,origin)).length;
      area+=(depth%2?-1:1)*Math.abs(twice)/2;
    }
    area=Math.max(0,area);
  }
  return {paths,area};
}
