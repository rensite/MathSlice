import test from 'node:test';
import assert from 'node:assert/strict';

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('plane angles give unit normals, signed offsets and perpendicular presets', async () => {
  const { planeFromAngles } = await import('../src/plane-controls.js');
  const state = Object.freeze({inclination:0,azimuth:0,offset:.5});
  const horizontal = planeFromAngles(state);
  assert.deepEqual(horizontal.normal,[0,1,0]);
  assert.equal(horizontal.constant,-.5);
  const vertical = planeFromAngles({inclination:90,azimuth:0,offset:-.75});
  near(vertical.normal[0],1); near(vertical.normal[1],0); near(vertical.normal[2],0);
  assert.equal(vertical.constant,.75);
  for (let inclination=0;inclination<=90;inclination+=15) for (let azimuth=0;azimuth<=360;azimuth+=30) {
    const plane = planeFromAngles({inclination,azimuth,offset:.37});
    near(Math.hypot(...plane.normal),1);
    near(plane.normal.reduce((sum,n)=>sum+n*n*.37,plane.constant),0);
  }
  assert.deepEqual(state,{inclination:0,azimuth:0,offset:.5});
});

test('plane controls reject nonfinite or invalid angles instead of poisoning rendering', async () => {
  const { planeFromAngles } = await import('../src/plane-controls.js');
  for (const state of [null,{}, {inclination:NaN,azimuth:0,offset:0},{inclination:0,azimuth:Infinity,offset:0},{inclination:0,azimuth:0,offset:NaN},{inclination:-1,azimuth:0,offset:0},{inclination:91,azimuth:0,offset:0},{inclination:0,azimuth:361,offset:0}]) assert.throws(()=>planeFromAngles(state),Error);
});
