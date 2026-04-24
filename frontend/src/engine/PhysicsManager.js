import * as CANNON from 'cannon-es';
export class PhysicsManager {
  constructor() {
    this.world=new CANNON.World({gravity:new CANNON.Vec3(0,-20,0)});
    this.world.broadphase=new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep=true;
    this.bodies=new Map(); this.meshes=new Map();
  }
  addBody(id,mesh,options={}){
    const{type='dynamic',mass=1,shape='box'}=options;
    let s;
    const scl=mesh.scale||{x:1,y:1,z:1};
    if(shape==='sphere'){
      const r=(mesh.geometry?.parameters?.radius||0.5)*Math.max(scl.x,scl.y,scl.z);
      s=new CANNON.Sphere(r);
    } else if(shape==='plane'){
      s=new CANNON.Plane();
    } else {
      // Use actual mesh scale to size the box half-extents
      const hx=(mesh.geometry?.parameters?.width||1)/2*scl.x;
      const hy=(mesh.geometry?.parameters?.height||1)/2*scl.y;
      const hz=(mesh.geometry?.parameters?.depth||1)/2*scl.z;
      s=new CANNON.Box(new CANNON.Vec3(Math.max(0.01,hx),Math.max(0.01,hy),Math.max(0.01,hz)));
    }
    const body=new CANNON.Body({mass:type==='static'?0:mass,shape:s});
    body.position.set(mesh.position.x,mesh.position.y,mesh.position.z);
    if(mesh.quaternion){body.quaternion.set(mesh.quaternion.x,mesh.quaternion.y,mesh.quaternion.z,mesh.quaternion.w);}
    this.world.addBody(body); this.bodies.set(id,body); this.meshes.set(id,mesh); return body;
  }
  addStaticBox(id,position,halfExtents,quaternion){
    const s=new CANNON.Box(new CANNON.Vec3(halfExtents.x,halfExtents.y,halfExtents.z));
    const body=new CANNON.Body({mass:0,shape:s});
    body.position.set(position.x,position.y,position.z);
    if(quaternion)body.quaternion.set(quaternion.x,quaternion.y,quaternion.z,quaternion.w);
    this.world.addBody(body); this.bodies.set(id,body); return body;
  }
  addStaticPlane(id,position,quaternion){
    const body=new CANNON.Body({mass:0,shape:new CANNON.Plane()});
    body.position.set(position.x,position.y,position.z);
    if(quaternion)body.quaternion.set(quaternion.x,quaternion.y,quaternion.z,quaternion.w);
    else body.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);
    this.world.addBody(body); this.bodies.set(id,body); return body;
  }
  removeBody(id){const b=this.bodies.get(id);if(b){this.world.removeBody(b);this.bodies.delete(id);this.meshes.delete(id);}}
  applyImpulse(id, impulseX, impulseY, impulseZ) {
    const body = this.bodies.get(id);
    if (body) {
      body.applyImpulse(new CANNON.Vec3(impulseX, impulseY, impulseZ));
      body.wakeUp();
    }
  }
  step(dt){
    this.world.step(1/60,dt,3);
    for(const[id,body]of this.bodies){const m=this.meshes.get(id);if(m){m.position.set(body.position.x,body.position.y,body.position.z);m.quaternion.set(body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w);}}
  }
  addGroundPlane(){const b=new CANNON.Body({mass:0,shape:new CANNON.Plane()});b.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);this.world.addBody(b);return b;}
  addPlayerBody(id,position){
    const body=new CANNON.Body({mass:80,shape:new CANNON.Sphere(0.5),linearDamping:0.9,angularDamping:1.0,fixedRotation:true});
    body.allowSleep=false;
    body.position.set(position.x,position.y,position.z);
    this.world.addBody(body); this.bodies.set(id,body); return body;
  }
}
