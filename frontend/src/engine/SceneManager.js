import * as THREE from 'three';
export class SceneManager {
  constructor(scene) { this.scene = scene; this.objects = new Map(); }
  createObject(type, id, name, options = {}) {
    const position = options.position || { x:0,y:0,z:0 }, rotation = options.rotation || { x:0,y:0,z:0 }, scale = options.scale || { x:1,y:1,z:1 }, color = options.color || '#888888';
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color) });
    let object3d;
    switch (type) {
      case 'cube': object3d = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), mat); break;
      case 'sphere': object3d = new THREE.Mesh(new THREE.SphereGeometry(0.5,16,16), mat); break;
      case 'plane': object3d = new THREE.Mesh(new THREE.PlaneGeometry(10,10), mat); object3d.rotation.x = -Math.PI/2; break;
      case 'directionalLight': { const l=new THREE.DirectionalLight(0xffffff,1), h=new THREE.Mesh(new THREE.SphereGeometry(0.2),new THREE.MeshBasicMaterial({color:0xffff00})), g=new THREE.Group(); g.add(l);g.add(h); object3d=g; break; }
      case 'pointLight': { const l=new THREE.PointLight(0xffffff,1,20), h=new THREE.Mesh(new THREE.SphereGeometry(0.15),new THREE.MeshBasicMaterial({color:0xffaa00})), g=new THREE.Group(); g.add(l);g.add(h); object3d=g; break; }
      case 'spotlight': { const l=new THREE.SpotLight(0xffffff,1), h=new THREE.Mesh(new THREE.ConeGeometry(0.2,0.5,8),new THREE.MeshBasicMaterial({color:0xffcc00})), g=new THREE.Group(); g.add(l);g.add(h); object3d=g; break; }
      case 'terrain': { const geo=new THREE.PlaneGeometry(100,100,64,64); geo.rotateX(-Math.PI/2); object3d=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x3d5a2a})); break; }
      case 'spawnPoint': { const g=new THREE.Group(), c=new THREE.Mesh(new THREE.ConeGeometry(0.3,0.8,8),new THREE.MeshBasicMaterial({color:0xffff00})); c.position.y=0.4; g.add(c); object3d=g; break; }
      case 'killVolume': object3d=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial({color:0xff0000,transparent:true,opacity:0.3,wireframe:true})); break;
      default: object3d=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);
    }
    object3d.position.set(position.x,position.y,position.z);
    object3d.rotation.set(rotation.x,rotation.y,rotation.z);
    object3d.scale.set(scale.x,scale.y,scale.z);
    object3d.userData={id,name,type};
    this.scene.add(object3d);
    const entry={id,name,type,object3d,position,rotation,scale,color,material:{color,wireframe:false}};
    this.objects.set(id,entry); return entry;
  }
  removeObject(id) {
    const e=this.objects.get(id); if(!e) return;
    this.scene.remove(e.object3d);
    e.object3d.traverse(c=>{ if(c.geometry)c.geometry.dispose(); if(c.material){if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material.dispose();} });
    this.objects.delete(id);
  }
  getObjectById(id) { return this.objects.get(id); }
  serialize() { return Array.from(this.objects.values()).map(e=>({id:e.id,name:e.name,type:e.type,position:e.position,rotation:e.rotation,scale:e.scale,color:e.color,material:e.material})); }
  deserialize(data) { for(const[id]of this.objects)this.removeObject(id); for(const item of data)this.createObject(item.type,item.id,item.name,item); }
}
