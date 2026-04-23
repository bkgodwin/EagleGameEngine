import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../store/index.js';
import { InputManager } from '../engine/InputManager.js';
import { PhysicsManager } from '../engine/PhysicsManager.js';
import { PlayerController } from '../engine/PlayerController.js';
import HealthBar from './HealthBar.jsx';

export default function PlayMode({ navigate }) {
  const canvasRef = useRef(null);
  const [health, setHealth] = useState(100);
  const [playerCount, setPlayerCount] = useState(1);
  const [killMessage, setKillMessage] = useState('');
  const { setIsPlaying, sceneObjects, addLog } = useStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 100, 400);

    // Camera
    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 500);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.shadowMap.enabled = true;

    // Ambient
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    scene.add(sun);

    // Grid floor
    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a5a3a });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Build scene from objects
    const killVolumes = [];
    let spawnPos = new THREE.Vector3(0, 2, 0);

    sceneObjects.forEach(obj => {
      if (obj.type === 'spawnPoint') {
        const idx = obj.spawnIndex || 0;
        if (idx === 0) spawnPos.set(obj.position?.x || 0, (obj.position?.y || 0) + 1, obj.position?.z || 0);
        return;
      }
      if (obj.type === 'killVolume') {
        killVolumes.push({ position: obj.position || { x: 0, y: 0, z: 0 }, scale: obj.scale || { x: 2, y: 2, z: 2 }, message: obj.deathMessage || 'You were killed!' });
      }

      let mesh;
      const pos = obj.position || { x: 0, y: 0, z: 0 };
      const scl = obj.scale || { x: 1, y: 1, z: 1 };
      const rot = obj.rotation || { x: 0, y: 0, z: 0 };
      const color = obj.material?.color || '#888888';
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), wireframe: !!obj.material?.wireframe });

      switch (obj.type) {
        case 'cube': mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); break;
        case 'sphere': mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), mat); break;
        case 'plane': mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide })); mesh.rotation.x = -Math.PI / 2; break;
        case 'terrain': {
          const geo = new THREE.PlaneGeometry(100, 100, 64, 64);
          geo.rotateX(-Math.PI / 2);
          if (obj.heightData) {
            const positions = geo.attributes.position;
            obj.heightData.forEach((h, i) => positions.setY(i, h));
            positions.needsUpdate = true;
            geo.computeVertexNormals();
          }
          mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3d5a2a }));
          break;
        }
        case 'directionalLight': { const l = new THREE.DirectionalLight(0xffffff, 1); l.position.set(pos.x, pos.y, pos.z); scene.add(l); return; }
        case 'pointLight': { const l = new THREE.PointLight(0xffffff, 1, 20); l.position.set(pos.x, pos.y, pos.z); scene.add(l); return; }
        default: return;
      }

      if (mesh) {
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.scale.set(scl.x, scl.y, scl.z);
        if (obj.type !== 'plane') mesh.rotation.set(rot.x, rot.y, rot.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.eagleId = obj.id;
        scene.add(mesh);
      }
    });

    // Physics
    const physics = new PhysicsManager();
    physics.addGroundPlane();

    // Input
    const input = new InputManager();

    // Player
    const player = new PlayerController(camera, physics, input);
    player.init({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z });

    // Resize
    const resizeObs = new ResizeObserver(() => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObs.observe(canvas.parentElement || canvas);

    // Pointer lock
    const requestLock = () => canvas.requestPointerLock();
    canvas.addEventListener('click', requestLock);

    // Shooting
    const onMouseDown = (e) => {
      if (e.button === 0 && document.pointerLockElement === canvas) {
        const result = player.shoot(scene, []);
        if (result) addLog(`Hit object ${result.id} at ${result.point.x.toFixed(1)},${result.point.y.toFixed(1)},${result.point.z.toFixed(1)}`);
      }
    };
    document.addEventListener('mousedown', onMouseDown);

    // Kill volume check
    function checkKillVolumes() {
      if (!player.body) return;
      const px = player.body.position.x, py = player.body.position.y, pz = player.body.position.z;
      for (const kv of killVolumes) {
        const hw = (kv.scale.x || 2) / 2, hh = (kv.scale.y || 2) / 2, hd = (kv.scale.z || 2) / 2;
        if (Math.abs(px - kv.position.x) < hw && Math.abs(py - kv.position.y) < hh && Math.abs(pz - kv.position.z) < hd) {
          const newHealth = player.takeDamage(100);
          setHealth(newHealth);
          setKillMessage(kv.message);
          setTimeout(() => { setKillMessage(''); player.respawn({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z }); setHealth(100); player.health = 100; }, 2000);
          return;
        }
      }
    }

    // Animation loop
    let animId;
    let last = performance.now();
    function animate() {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      player.update(dt);
      physics.step(dt);
      checkKillVolumes();
      setHealth(player.health);
      renderer.render(scene, camera);
    }
    animate();

    // Escape to exit
    const exitHandler = (e) => {
      if (e.key === 'Escape' && !document.pointerLockElement) {
        setIsPlaying(false);
      }
    };
    document.addEventListener('keydown', exitHandler);

    addLog('Play mode started');

    return () => {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      input.dispose();
      canvas.removeEventListener('click', requestLock);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', exitHandler);
      document.exitPointerLock?.();
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'none' }} />
      {/* Health */}
      <div style={{ position: 'absolute', top: 16, left: 16 }}>
        <HealthBar health={health} />
      </div>
      {/* Crosshair */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'white', fontSize: '20px', pointerEvents: 'none', userSelect: 'none', textShadow: '0 0 3px black', lineHeight: 1 }}>+</div>
      {/* Player count */}
      <div style={{ position: 'absolute', top: 16, right: 16, color: 'white', fontSize: '14px', background: 'rgba(0,0,0,0.5)', padding: '8px 12px', borderRadius: '4px' }}>
        Players: {playerCount}
      </div>
      {/* Kill message */}
      {killMessage && (
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', color: 'red', fontSize: '22px', fontWeight: 'bold', textShadow: '0 0 6px black', textAlign: 'center' }}>
          {killMessage}
        </div>
      )}
      {/* Exit hint */}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
        Press Escape to exit play mode
      </div>
    </div>
  );
}
