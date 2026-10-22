import test from 'node:test';
import assert from 'node:assert/strict';
import * as surfaces from '../src/surfaces.js';

const ids = ['sphere','cylinder','cone','conefrustum','ellipsoid','hyperboloid1','hyperboloid2','ellipticparaboloid','hyperbolicparaboloid','ellipticcylinder','hyperboliccylinder','paraboliccylinder'];
const {surfaceMesh, sliceSurface} = surfaces;
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub = (a,b) => a.map((x,i)=>x-b[i]);
test('catalog has twelve explicitly bounded solids or finite surface fragments', () => {
  assert.deepEqual(Object.keys(surfaces.SURFACES), ids);
  for (const [i,id] of ids.entries()) {
    const def=surfaces.SURFACES[id];
    assert.equal(def.id,id);
    assert.equal(def.group,i<4?'school':'university');
    for(const key of ['name','shortName','description','equation']) assert.ok(typeof def[key]==='string' && def[key].length>0);
    assert.equal(def.closed,['sphere','cylinder','cone','conefrustum','ellipsoid'].includes(id));
    if(!def.closed) assert.match(def.description,/конечный фрагмент/i);
  }
});

test('cap equations bound the disks rather than describing entire planes', () => {
  for(const id of ['cylinder','cone','conefrustum']) assert.match(surfaces.SURFACES[id].equation,/x² \+ z² ≤ 1/);
  assert.match(surfaces.SURFACES.conefrustum.equation,/x² \+ z² ≤ 1\/4/);
});
test('all meshes have finite indexed nondegenerate triangles and tight bounds; solids are watertight', () => {
  for (const id of ids) {
    const m=surfaceMesh(id,24), edges=new Map();
    assert.equal(m.closed,surfaces.SURFACES[id].closed);
    assert.ok(m.vertices.length>20 && m.triangles.length>20);
    for(const p of m.vertices) {
      assert.equal(p.length,3);
      p.forEach((v,k)=>assert.ok(Number.isFinite(v) && v>=m.bounds.min[k] && v<=m.bounds.max[k] && Math.abs(v)<=2));
    }
    for(let k=0;k<3;k++) {
      assert.equal(m.bounds.min[k],Math.min(...m.vertices.map(p=>p[k])));
      assert.equal(m.bounds.max[k],Math.max(...m.vertices.map(p=>p[k])));
    }
    for(const t of m.triangles) {
      assert.equal(t.length,3);
      t.forEach(i=>assert.ok(Number.isInteger(i) && i>=0 && i<m.vertices.length));
      assert.ok(Math.hypot(...cross(sub(m.vertices[t[1]],m.vertices[t[0]]),sub(m.vertices[t[2]],m.vertices[t[0]])))>1e-12,id);
      for(let j=0;j<3;j++) {const key=[t[j],t[(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}
    }
    if(m.closed) for(const count of edges.values()) assert.equal(count,2,id);
    if(surfaces.SURFACES[id].group==='school') {assert.equal(m.bounds.min[1],-1); assert.equal(m.bounds.max[1],1);}
  }
});
const horizontal = y => ({normal:[0,1,0],constant:-y});
const near = (actual,expected,tolerance=.015) => assert.ok(Math.abs(actual-expected)<=expected*tolerance,`${actual} vs ${expected}`);
test('analytic sections of closed solids have approximate circle and ellipse areas', () => {
  for(const [id,y,area] of [['sphere',0,Math.PI],['sphere',.5,.75*Math.PI],['cylinder',0,Math.PI],['cone',0,Math.PI/4],['conefrustum',0,Math.PI*.75**2],['ellipsoid',0,Math.PI*1.4*.8]]) {
    const section=sliceSurface(surfaceMesh(id),horizontal(y));
    assert.equal(section.paths.length,1,id);
    assert.equal(section.paths[0].closed,true,id);
    near(section.area,area);
  }
  near(sliceSurface(surfaceMesh('cylinder'),{normal:[1,0,0],constant:0}).area,4);
});
test('disjoint sections and vertex tangencies have no paths and zero solid area', () => {
  for(const id of ['sphere','cone','cylinder']) {
    assert.deepEqual(sliceSurface(surfaceMesh(id),horizontal(3)),{paths:[],area:0});
  }
  assert.deepEqual(sliceSurface(surfaceMesh('sphere'),horizontal(1)),{paths:[],area:0});
  assert.deepEqual(sliceSurface(surfaceMesh('cone'),horizontal(1)),{paths:[],area:0});
});
test('coplanar cylinder caps cancel fan diagonals and produce only one perimeter', () => {
  for(const y of [-1,1]) {
    const section=sliceSurface(surfaceMesh('cylinder'),horizontal(y));
    assert.equal(section.paths.length,1);
    assert.equal(section.paths[0].closed,true);
    assert.equal(section.paths[0].points.length,36);
    for(const [x,,z] of section.paths[0].points) near(x*x+z*z,1,1e-10);
    near(section.area,Math.PI);
  }
});
test('open quadrics retain open hyperbolas, separate sheets, and null areas', () => {
  for(const id of ['hyperboloid1','hyperboloid2']) {
    const section=sliceSurface(surfaceMesh(id),{normal:[0,0,1],constant:0});
    assert.equal(section.area,null);
    assert.equal(section.paths.length,2,id);
    assert.ok(section.paths.every(p=>!p.closed));
  }
  const m=surfaceMesh('hyperboloid2');
  for(const y of [-1.4,1.4]) {
    const s=sliceSurface(m,horizontal(y));
    assert.equal(s.paths.length,1);
    assert.equal(s.paths[0].closed,true);
    assert.equal(s.area,null);
    for(const p of s.paths[0].points) assert.ok(Math.abs(p[1]-y)<1e-10);
  }
  assert.deepEqual(sliceSurface(m,horizontal(0)),{paths:[],area:null});
  for(const id of ids.filter(id=>!surfaces.SURFACES[id].closed)) assert.equal(sliceSurface(surfaceMesh(id),horizontal(5)).area,null);
});
test('disconnected solids yield separate loops rather than a global angle sort', () => {
  const a=surfaceMesh('sphere'), b=surfaceMesh('sphere');
  const offset=a.vertices.length;
  const m={closed:true,vertices:[...a.vertices.map(p=>[p[0]-1.5,p[1],p[2]]),...b.vertices.map(p=>[p[0]+1.5,p[1],p[2]])],triangles:[...a.triangles,...b.triangles.map(t=>t.map(i=>i+offset))]};
  const s=sliceSurface(m,horizontal(0));
  assert.equal(s.paths.length,2);
  assert.ok(s.paths.every(p=>p.closed));
  near(s.area,2*Math.PI);
  for(const path of s.paths) assert.ok(path.points.every(p=>p[0]<0) || path.points.every(p=>p[0]>0));
});
test('nested closed contours subtract holes instead of filling their convex hull', () => {
  const n=48,vertices=[],triangles=[];
  for(let i=0;i<n;i++) for(let j=0;j<n;j++) {
    const u=2*Math.PI*i/n,v=2*Math.PI*j/n,r=1+.3*Math.cos(v);
    vertices.push([r*Math.cos(u),.3*Math.sin(v),r*Math.sin(u)]);
  }
  for(let i=0;i<n;i++) for(let j=0;j<n;j++) {
    const a=i*n+j,b=((i+1)%n)*n+j,c=i*n+(j+1)%n,d=((i+1)%n)*n+(j+1)%n;
    triangles.push([a,b,c],[b,d,c]);
  }
  const s=sliceSurface({vertices,triangles,closed:true},horizontal(0));
  assert.equal(s.paths.length,2);
  assert.ok(s.paths.every(p=>p.closed));
  near(s.area,Math.PI*(1.3**2-.7**2));
});
test('vertices satisfy their quadric equations, with caps only on school solids', () => {
  const residual = {
    sphere:(x,y,z)=>x*x+y*y+z*z-1,
    cylinder:(x,y,z)=>x*x+z*z-1,
    cone:(x,y,z)=>x*x+z*z-((1-y)/2)**2,
    conefrustum:(x,y,z)=>x*x+z*z-((3-y)/4)**2,
    ellipsoid:(x,y,z)=>(x/1.4)**2+y*y+(z/.8)**2-1,
    hyperboloid1:(x,y,z)=>x*x+z*z-y*y-1,
    hyperboloid2:(x,y,z)=>y*y-x*x-z*z-1,
    ellipticparaboloid:(x,y,z)=>y-x*x-z*z,
    hyperbolicparaboloid:(x,y,z)=>y-x*x+z*z,
    ellipticcylinder:(x,y,z)=>(x/1.4)**2+(z/.8)**2-1,
    hyperboliccylinder:(x,y,z)=>x*x-z*z-1,
    paraboliccylinder:(x,y)=>y-x*x,
  };
  for(const id of ids) {
    const m=surfaceMesh(id,25);
    for(const p of m.vertices) {
      if(['cylinder','cone','conefrustum'].includes(id) && Math.abs(p[1])===1) continue;
      assert.ok(Math.abs(residual[id](...p))<1e-12,id);
    }
    // Connectivity per actual analytic branch, not bridges across empty space.
    const adjacency=m.vertices.map(()=>new Set());
    for(const t of m.triangles) for(let k=0;k<3;k++) {adjacency[t[k]].add(t[(k+1)%3]);adjacency[t[(k+1)%3]].add(t[k]);}
    const visited=new Set();let components=0;
    for(let i=0;i<m.vertices.length;i++) if(!visited.has(i)) {
      components++;const queue=[i];visited.add(i);
      for(let k=0;k<queue.length;k++) for(const next of adjacency[queue[k]]) if(!visited.has(next)) {visited.add(next);queue.push(next);}
    }
    assert.equal(components,['hyperboloid2','hyperboliccylinder'].includes(id)?2:1,id);
  }
});
test('all catalog contours are finite, coplanar, stitched, and contain no zero-length edges', () => {
  const planes=[horizontal(0),horizontal(.37),{normal:[1,0,0],constant:0},{normal:[.3,.8,-.4],constant:.13}];
  for(const id of ids) for(const plane of planes) {
    const section=sliceSurface(surfaceMesh(id),plane);
    assert.ok(section.area===null || (Number.isFinite(section.area) && section.area>=0),id);
    assert.equal(section.area===null,!surfaces.SURFACES[id].closed);
    for(const path of section.paths) {
      assert.ok(path.points.length>=(path.closed?3:2));
      for(const p of path.points) {
        assert.ok(p.every(Number.isFinite));
        assert.ok(Math.abs(p.reduce((s,v,k)=>s+v*plane.normal[k],plane.constant))<1e-9);
      }
      for(let i=1;i<path.points.length;i++) assert.ok(Math.hypot(...sub(path.points[i],path.points[i-1]))>1e-7);
    }
  }
});
test('oblique sphere sections and scaled plane equations retain their analytic area', () => {
  const m=surfaceMesh('sphere');
  const a=sliceSurface(m,{normal:[1,2,2],constant:-1.2});
  const b=sliceSurface(m,{normal:[-10,-20,-20],constant:12});
  near(a.area,Math.PI*(1-.4**2));
  near(a.area,b.area,1e-12);
});
test('edge tangency is not a spurious section polygon', () => {
  assert.deepEqual(sliceSurface(surfaceMesh('cylinder'),{normal:[1,0,0],constant:-1}),{paths:[],area:0});
});
test('triangle-soup seams within 1e-7 weld into one cap perimeter', () => {
  const original=surfaceMesh('cylinder'),vertices=[],triangles=[];
  for(const triangle of original.triangles) {
    const t=[];
    for(const index of triangle) {
      const p=original.vertices[index];
      t.push(vertices.length);
      vertices.push([p[0]+(vertices.length%2?2e-8:-2e-8),p[1],p[2]]);
    }
    triangles.push(t);
  }
  const section=sliceSurface({vertices,triangles,closed:true},horizontal(1));
  assert.equal(section.paths.length,1);
  assert.equal(section.paths[0].closed,true);
  assert.equal(section.paths[0].points.length,36);
  near(section.area,Math.PI);
});
test('bad planes and malformed mesh indices are rejected', () => {
  const m=surfaceMesh('sphere');
  for(const p of [null,{},horizontal(NaN),{normal:[0,0,0],constant:0},{normal:[1,2],constant:0},{normal:[Infinity,0,1],constant:0},{normal:[0,1,0],constant:'0'}]) assert.throws(()=>sliceSurface(m,p),/plane/i);
  for(const bad of [null,{}, {...m,closed:undefined},{...m,vertices:[[NaN,0,0]]},{...m,triangles:[[0,1,-1]]},{...m,triangles:[[0,1,m.vertices.length]]}]) assert.throws(()=>sliceSurface(bad,horizontal(0)),/mesh/i);
});
test('mesh rejects unknown IDs and invalid or excessive resolutions', () => {
  assert.throws(()=>surfaceMesh('fake'),/surface|поверх|unknown/i);
  for(const r of [0,2,-1,3.5,NaN,Infinity,1000,'36']) assert.throws(()=>surfaceMesh('sphere',r),/resolution/i);
});
