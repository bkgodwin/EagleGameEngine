import * as THREE from 'three';
export class PlayerController {
  constructor(camera,physicsManager,inputManager){
    this.camera=camera; this.physics=physicsManager; this.input=inputManager;
    this.health=100; this.speed=6; this.sprintSpeed=12; this.jumpVelocity=8;
    this.isGrounded=false; this.yaw=0; this.pitch=0; this.bodyId='player'; this.body=null;
    this.isCrouching=false;
    this._moveDir=new THREE.Vector3();
    this._groundedFrames=0;
  }
  init(spawnPosition={x:0,y:2,z:0}){
    this.body=this.physics.addPlayerBody(this.bodyId,spawnPosition);
    this.camera.position.set(spawnPosition.x,spawnPosition.y+0.8,spawnPosition.z);
    this.body.addEventListener('collide',(e)=>{
      // Accept any contact where the contact normal has a significant upward component
      const ni=e.contact.ni;
      if((ni.y>0.3)||(ni.y<-0.3&&e.contact.bi===this.body)){
        this.isGrounded=true;
        this._groundedFrames=3; // stay grounded for a few frames
      }
    });
  }
  update(dt){
    const delta=this.input.getMouseDelta();
    this.yaw-=delta.x*0.002; this.pitch-=delta.y*0.002;
    this.pitch=Math.max(-Math.PI/2+0.01,Math.min(Math.PI/2-0.01,this.pitch));
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch,this.yaw,0,'YXZ'));
    if(!this.body)return;
    // Decay grounded state
    if(this._groundedFrames>0){this._groundedFrames--;if(this._groundedFrames===0)this.isGrounded=false;}
    const isCrouching=this.input.isKeyDown('ControlLeft')||this.input.isKeyDown('ControlRight')||this.input.isKeyDown('Control');
    this.isCrouching=isCrouching;
    const sprint=(this.input.isKeyDown('ShiftLeft')||this.input.isKeyDown('Shift'))&&!isCrouching;
    const spd=isCrouching?this.speed*0.5:sprint?this.sprintSpeed:this.speed;
    const fwd=new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
    const right=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    this._moveDir.set(0,0,0);
    if(this.input.isKeyDown('KeyW')||this.input.isKeyDown('w'))this._moveDir.addScaledVector(fwd,spd);
    if(this.input.isKeyDown('KeyS')||this.input.isKeyDown('s'))this._moveDir.addScaledVector(fwd,-spd);
    if(this.input.isKeyDown('KeyA')||this.input.isKeyDown('a'))this._moveDir.addScaledVector(right,-spd);
    if(this.input.isKeyDown('KeyD')||this.input.isKeyDown('d'))this._moveDir.addScaledVector(right,spd);
    this.body.velocity.x=this._moveDir.x; this.body.velocity.z=this._moveDir.z;
    if((this.input.isKeyDown('Space')||this.input.isKeyDown(' '))&&this.isGrounded&&!isCrouching){this.body.velocity.y=this.jumpVelocity;this.isGrounded=false;this._groundedFrames=0;}
    const eyeHeight=isCrouching?0.3:0.8;
    this.camera.position.set(this.body.position.x,this.body.position.y+eyeHeight,this.body.position.z);
  }
  shoot(scene){
    const ray=new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0,0),this.camera);
    const meshes=[]; scene.traverse(o=>{if(o.isMesh&&o.userData.eagleId)meshes.push(o);});
    const hits=ray.intersectObjects(meshes);
    if(hits.length>0){
      const pt=hits[0].point;
      const geo=new THREE.BufferGeometry().setFromPoints([this.camera.position.clone(),pt.clone()]);
      const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xffff00}));
      scene.add(line); setTimeout(()=>scene.remove(line),100);
      return{id:hits[0].object.userData.eagleId,point:pt};
    }
    return null;
  }
  takeDamage(amount){this.health=Math.max(0,this.health-amount);return this.health;}
  respawn(pos={x:0,y:2,z:0}){
    this.health=100;
    if(this.body){this.body.position.set(pos.x,pos.y,pos.z);this.body.velocity.set(0,0,0);}
    this.camera.position.set(pos.x,pos.y+0.8,pos.z);
  }
}
