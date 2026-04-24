import * as CANNON from 'cannon-es';
export class PhysicsManager {
  constructor() {
    this.world=new CANNON.World({gravity:new CANNON.Vec3(0,-20,0)});
    // NaiveBroadphase is the cannon-es default and reliably detects all dynamic↔static pairs.
    // SAPBroadphase can miss pairs on first contact after bodies are added, causing the player
    // to pass through static objects on the initial frame.
    this.world.broadphase=new CANNON.NaiveBroadphase();
    this.world.allowSleep=true;
    // More solver iterations → constraint impulses converge before integration, so fast-moving
    // bodies (player at 12–24 m/s) no longer tunnel through static geometry.
    this.world.solver.iterations=20;
    this.bodies=new Map(); this.meshes=new Map();

    // Named materials let us register a ContactMaterial that zeroes out restitution between
    // the player sphere and all environment geometry, preventing any bouncing or jitter.
    this.playerMat=new CANNON.Material('player');
    this.envMat=new CANNON.Material('env');
    // Player ↔ environment: no bounce, no friction (character controller manages XZ speed directly)
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.playerMat,this.envMat,{
      friction:0.0, restitution:0.0,
    }));
    // Environment ↔ environment: normal friction for dynamic objects rolling/sliding
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.envMat,this.envMat,{
      friction:0.4, restitution:0.0,
    }));
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
    // Apply friction damping so objects don't slide/roll forever
    const body=new CANNON.Body({mass:type==='static'?0:mass,shape:s,linearDamping:0.35,angularDamping:0.45,material:this.envMat});
    body.position.set(mesh.position.x,mesh.position.y,mesh.position.z);
    if(mesh.quaternion){body.quaternion.set(mesh.quaternion.x,mesh.quaternion.y,mesh.quaternion.z,mesh.quaternion.w);}
    this.world.addBody(body); this.bodies.set(id,body); this.meshes.set(id,mesh); return body;
  }
  addStaticBox(id,position,halfExtents,quaternion){
    const s=new CANNON.Box(new CANNON.Vec3(halfExtents.x,halfExtents.y,halfExtents.z));
    const body=new CANNON.Body({mass:0,shape:s,material:this.envMat});
    body.position.set(position.x,position.y,position.z);
    if(quaternion)body.quaternion.set(quaternion.x,quaternion.y,quaternion.z,quaternion.w);
    this.world.addBody(body); this.bodies.set(id,body); return body;
  }
  addStaticSphere(id,position,radius){
    const body=new CANNON.Body({mass:0,shape:new CANNON.Sphere(Math.max(0.01,radius)),material:this.envMat});
    body.position.set(position.x,position.y,position.z);
    this.world.addBody(body); this.bodies.set(id,body); return body;
  }
  addStaticPlane(id,position,quaternion){
    const body=new CANNON.Body({mass:0,shape:new CANNON.Plane(),material:this.envMat});
    body.position.set(position.x,position.y,position.z);
    if(quaternion)body.quaternion.set(quaternion.x,quaternion.y,quaternion.z,quaternion.w);
    else body.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);
    this.world.addBody(body); this.bodies.set(id,body); return body;
  }
  /**
   * Add a heightfield collision body that matches a sculpted terrain mesh.
   * heightData is a Float32Array with layout: heightData[row*(segments+1)+col].
   * Row index maps to Z axis, column index maps to X axis (matches Three.js PlaneGeometry
   * after rotateX(-PI/2)).
   */
  addTerrainHeightfield(id,position,heightData,segments,worldWidth,worldDepth){
    const verts=segments+1;
    // CANNON Heightfield data[xi][zi]: xi=col (X axis), zi=row (Z axis)
    const data=[];
    for(let col=0;col<=segments;col++){
      const colArr=[];
      for(let row=0;row<=segments;row++){
        colArr.push(heightData[row*verts+col]||0);
      }
      data.push(colArr);
    }
    const elementSize=worldWidth/segments;
    let minVal=Infinity,maxVal=-Infinity;
    for(let i=0;i<heightData.length;i++){if(heightData[i]<minVal)minVal=heightData[i];if(heightData[i]>maxVal)maxVal=heightData[i];}
    if(!isFinite(minVal))minVal=0;
    if(!isFinite(maxVal)||maxVal<=minVal)maxVal=minVal+1;
    const shape=new CANNON.Heightfield(data,{minValue:minVal,maxValue:maxVal,elementSize});
    const body=new CANNON.Body({mass:0,material:this.envMat});
    body.addShape(shape);
    // Heightfield origin is at (0,0) corner; shift so it is centred on the mesh position
    body.position.set(position.x-worldWidth/2,position.y,position.z-worldDepth/2);
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
  addGroundPlane(){const b=new CANNON.Body({mass:0,shape:new CANNON.Plane(),material:this.envMat});b.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);this.world.addBody(b);return b;}
  addPlayerBody(id,position){
    const body=new CANNON.Body({mass:80,shape:new CANNON.Sphere(0.5),linearDamping:0.9,angularDamping:1.0,fixedRotation:true,material:this.playerMat});
    body.allowSleep=false;
    body.position.set(position.x,position.y,position.z);
    this.world.addBody(body); this.bodies.set(id,body); return body;
  }
  /**
   * Return an array of contact-normal vectors that point AWAY from the given body (toward open
   * space). Used by PlayerController to project the desired move direction onto wall surfaces so
   * the player cannot push through them even when XZ velocity is set directly each frame.
   *
   * cannon-es ContactEquation convention: ni points FROM bi TOWARD bj.
   * So if body === bi  →  ni goes body→other  →  "away from body" = -ni
   *    if body === bj  →  ni goes other→body  →  "away from body" = +ni
   */
  getContactNormalsForBody(id){
    const body=this.bodies.get(id);
    if(!body||!this.world.contacts||this.world.contacts.length===0)return[];
    const normals=[];
    for(const c of this.world.contacts){
      if(c.bi!==body&&c.bj!==body)continue;
      const flip=c.bi===body; // when flip=true: ni points FROM body TOWARD other → away-from-body normal = -ni
      normals.push({x:flip?-c.ni.x:c.ni.x,y:flip?-c.ni.y:c.ni.y,z:flip?-c.ni.z:c.ni.z});
    }
    return normals;
  }
}
