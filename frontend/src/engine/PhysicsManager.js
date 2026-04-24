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
    if(shape==='sphere')s=new CANNON.Sphere(mesh.geometry?.parameters?.radius||0.5);
    else if(shape==='plane')s=new CANNON.Plane();
    else s=new CANNON.Box(new CANNON.Vec3(0.5,0.5,0.5));
    const body=new CANNON.Body({mass:type==='static'?0:mass,shape:s});
    body.position.set(mesh.position.x,mesh.position.y,mesh.position.z);
    this.world.addBody(body); this.bodies.set(id,body); this.meshes.set(id,mesh); return body;
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
