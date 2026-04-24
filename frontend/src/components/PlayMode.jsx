import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../store/index.js';
import { InputManager } from '../engine/InputManager.js';
import { PhysicsManager } from '../engine/PhysicsManager.js';
import { PlayerController } from '../engine/PlayerController.js';
import { NetworkManager } from '../engine/NetworkManager.js';
import HealthBar from './HealthBar.jsx';
import { getToken } from '../api/index.js';

// Fetch AI agent states from the server
async function fetchAIAgents(roomId) {
  try {
    const token = getToken();
    const res = await fetch(`/api/rooms/${roomId}/ai/state`, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    if (res.ok) return await res.json();
  } catch (_) {}
  return [];
}

// Procedural rock/grass texture for terrain (no grid lines)
function makeTerrainTexture() {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#4a7c59';
  ctx.fillRect(0, 0, size, size);
  const rng = (n) => ((Math.sin(n * 127.1) * 43758.5453) % 1 + 1) % 1;
  for (let i = 0; i < 4000; i++) {
    const x = rng(i) * size;
    const y = rng(i + 1000) * size;
    const r = 1 + rng(i + 2000) * 5;
    const isRock = rng(i + 3000) > 0.55;
    if (isRock) {
      const v = Math.floor(90 + rng(i + 4000) * 40);
      ctx.fillStyle = `rgba(${v},${v - 10},${v - 20},0.45)`;
    } else {
      const g = Math.floor(80 + rng(i + 5000) * 50);
      ctx.fillStyle = `rgba(40,${g},35,0.35)`;
    }
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rng(i + 6000) * 0.8), rng(i + 7000) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Simple Web Audio sound utilities
function createAudioContext() {
  try { return new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
}
function playShootSound(audioCtx) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (_) {}
}
function playFootstepSound(audioCtx) {
  if (!audioCtx) return;
  try {
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    source.buffer = buf;
    source.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    source.start();
  } catch (_) {}
}

export default function PlayMode({ navigate }) {
  const canvasRef = useRef(null);
  const [health, setHealth] = useState(100);
  const [playerCount, setPlayerCount] = useState(1);
  const [killMessage, setKillMessage] = useState('');
  const [deathMessage, setDeathMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [shootFlash, setShootFlash] = useState(false);
  const [hitMarker, setHitMarker] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [speed, setSpeed] = useState(0);
  const { setIsPlaying, sceneObjects, addLog, currentProject, user, setOnlineCount, globalLighting, projectSettings, joinRoomId, setJoinRoomId } = useStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ---------------------------------------------------------------------------
    // Game constants
    // ---------------------------------------------------------------------------
    const FLOOR_Z_OFFSET = -0.005;       // prevent z-fighting with terrain objects
    const BOT_CENTER_Y_OFFSET = 0.9;     // capsule body center above group origin
    const AI_HIT_RADIUS = 1.2;           // projectile→AI hit distance
    const OBJECT_HIT_RADIUS_BASE = 0.6;  // minimum projectile→physics-object hit radius
    const PROJECTILE_IMPULSE_BASE = 8;   // base impulse magnitude for projectile hits
    const DEATH_ANIMATION_DURATION = 1.5; // seconds for bot death animation

    // Audio context for sounds
    const audioCtx = createAudioContext();

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

    // Global lighting from settings
    const ambientColor = globalLighting?.ambientColor || '#404060';
    const ambientIntensity = globalLighting?.ambientIntensity ?? 0.5;
    scene.add(new THREE.AmbientLight(new THREE.Color(ambientColor), ambientIntensity));

    const sun = new THREE.DirectionalLight(
      new THREE.Color(globalLighting?.sunColor || '#ffffff'),
      globalLighting?.sunIntensity ?? 1
    );
    sun.position.set(
      globalLighting?.sunX ?? 50,
      globalLighting?.sunY ?? 80,
      globalLighting?.sunZ ?? 30
    );
    sun.castShadow = true;
    scene.add(sun);

    // Terrain-textured floor
    const floorTex = makeTerrainTexture();
    floorTex.repeat.set(50, 50);
    floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    floorTex.needsUpdate = true;
    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Z_OFFSET; // slight offset to prevent z-fighting with terrain objects
    floor.receiveShadow = true;
    scene.add(floor);

    // Build scene from store objects
    const killVolumes = [];
    let spawnPos = new THREE.Vector3(0, 2, 0);
    const aiBotSpawns = [];
    const aiSpawnPoints = [];  // AI spawn point objects
    const scenePhysicsBodies = []; // { obj, mesh } for dynamic objects
    const staticCollisionMeshes = []; // planes, terrain for static physics

    sceneObjects.forEach(obj => {
      if (obj.type === 'spawnPoint') {
        if (obj.isAiSpawn) {
          // AI spawn point
          aiSpawnPoints.push({
            id: obj.id,
            position: obj.position || { x: 0, y: 0, z: 0 },
            maxEnemies: Math.min(10, Math.max(1, obj.aiSpawnMaxEnemies ?? 3)),
            spawnRate: Math.max(1, obj.aiSpawnRate ?? 5),
            aiType: obj.aiSpawnType || 'zombie',
          });
        } else {
          const idx = obj.spawnIndex || 0;
          if (idx === 0) spawnPos.set(obj.position?.x || 0, (obj.position?.y || 0) + 1, obj.position?.z || 0);
        }
        return;
      }
      if (obj.type === 'killVolume') {
        killVolumes.push({ position: obj.position || { x: 0, y: 0, z: 0 }, scale: obj.scale || { x: 2, y: 2, z: 2 }, message: obj.deathMessage || 'You were killed!' });
        return;
      }
      if (obj.type === 'aiBot') {
        aiBotSpawns.push({
          id: obj.id,
          position: obj.position || { x: 0, y: 0, z: 0 },
          aiType: obj.aiType || 'zombie',
          patrolRadius: obj.patrolRadius || 10,
          detectRadius: obj.detectRadius || 15,
          attackDamage: obj.attackDamage || 10,
        });
        return;
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
        case 'plane': {
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide }));
          mesh.rotation.x = -Math.PI / 2;
          staticCollisionMeshes.push({ obj, mesh, type: 'plane' });
          break;
        }
        case 'terrain': {
          const geo = new THREE.PlaneGeometry(100, 100, 64, 64);
          geo.rotateX(-Math.PI / 2);
          if (obj.heightData) {
            const positions = geo.attributes.position;
            obj.heightData.forEach((h, i) => positions.setY(i, h));
            positions.needsUpdate = true;
            geo.computeVertexNormals();
          }
          const terrainTex = makeTerrainTexture();
          terrainTex.repeat.set(20, 20);
          terrainTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          terrainTex.needsUpdate = true;
          mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: terrainTex }));
          staticCollisionMeshes.push({ obj, mesh, type: 'terrain' });
          break;
        }
        case 'directionalLight': {
          const lp = obj.lightProps || {};
          const l = new THREE.DirectionalLight(lp.color || '#ffffff', lp.intensity ?? 1);
          l.position.set(pos.x, pos.y, pos.z);
          if (lp.castShadow) l.castShadow = true;
          scene.add(l);
          return;
        }
        case 'pointLight': {
          const lp = obj.lightProps || {};
          const l = new THREE.PointLight(lp.color || '#ffffff', lp.intensity ?? 5, lp.range ?? 500);
          l.position.set(pos.x, pos.y, pos.z);
          if (lp.castShadow) l.castShadow = true;
          scene.add(l);
          return;
        }
        case 'spotlight': {
          const lp = obj.lightProps || {};
          const l = new THREE.SpotLight(lp.color || '#ffffff', lp.intensity ?? 5);
          l.distance = lp.range ?? 500;
          if (lp.angle) l.angle = THREE.MathUtils.degToRad(lp.angle);
          l.position.set(pos.x, pos.y, pos.z);
          if (lp.castShadow) l.castShadow = true;
          scene.add(l);
          return;
        }
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
        // Physics simulation for cubes and spheres if enabled
        if (obj.simulatePhysics && (obj.type === 'cube' || obj.type === 'sphere')) {
          scenePhysicsBodies.push({ obj, mesh });
        }
      }
    });

    // Physics
    const physics = new PhysicsManager();
    physics.addGroundPlane();

    // Add static physics bodies for planes and terrains so player/AI can stand on them
    staticCollisionMeshes.forEach(({ obj, mesh }) => {
      const scl = obj.scale || { x: 1, y: 1, z: 1 };
      const pos = obj.position || { x: 0, y: 0, z: 0 };
      if (obj.type === 'terrain') {
        if (obj.heightData && obj.heightData.length > 0) {
          // Use a per-vertex heightfield so sculpted terrain has accurate collision.
          const segments = 64;
          const worldWidth = 100 * scl.x;
          const worldDepth = 100 * scl.z;
          physics.addTerrainHeightfield(
            'static_' + obj.id,
            { x: pos.x, y: pos.y, z: pos.z },
            new Float32Array(obj.heightData),
            segments,
            worldWidth,
            worldDepth
          );
        } else {
          // Flat terrain – use a simple static box.
          const hw = 50 * scl.x;
          const hd = 50 * scl.z;
          physics.addStaticBox('static_' + obj.id, { x: pos.x, y: pos.y - 0.25, z: pos.z }, { x: hw, y: 0.25, z: hd });
        }
      } else if (obj.type === 'plane') {
        // Flat static box for plane geometry (10x10 in model space)
        const hw = 5 * scl.x;
        const hd = 5 * scl.z;
        physics.addStaticBox('static_' + obj.id, { x: pos.x, y: pos.y - 0.1, z: pos.z }, { x: hw, y: 0.1, z: hd });
      }
    });

    // Add static collision bodies for solid scene objects that don't simulate physics.
    // Without these the player and projectiles pass straight through them.
    sceneObjects.forEach(obj => {
      if (obj.simulatePhysics) return; // handled below as dynamic
      const pos = obj.position || { x: 0, y: 0, z: 0 };
      const scl = obj.scale || { x: 1, y: 1, z: 1 };
      const rot = obj.rotation || { x: 0, y: 0, z: 0 };
      if (obj.type === 'cube') {
        const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z));
        physics.addStaticBox(
          'static_' + obj.id,
          { x: pos.x, y: pos.y, z: pos.z },
          { x: scl.x * 0.5, y: scl.y * 0.5, z: scl.z * 0.5 },
          { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
        );
      } else if (obj.type === 'sphere') {
        physics.addStaticSphere('static_' + obj.id, { x: pos.x, y: pos.y, z: pos.z }, scl.x * 0.5);
      }
    });

    // Add physics bodies for objects with simulatePhysics enabled
    scenePhysicsBodies.forEach(({ obj, mesh }) => {
      const shape = obj.type === 'sphere' ? 'sphere' : 'box';
      const mass = obj.mass != null ? obj.mass : 1;
      physics.addBody(obj.id, mesh, { type: obj.enableCollision === false ? 'kinematic' : 'dynamic', mass, shape });
    });

    // Input
    const input = new InputManager();

    // Player – apply speed from projectSettings
    const walkSpeed = projectSettings?.walkSpeed ?? 12;
    const sprintSpeed = projectSettings?.sprintSpeed ?? 24;
    const player = new PlayerController(camera, physics, input);
    player.speed = walkSpeed;
    player.sprintSpeed = sprintSpeed;
    player.init({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z });

    // ---------------------------------------------------------------------------
    // Multiplayer
    // ---------------------------------------------------------------------------
    // If the user joined from the server browser, use that room ID; otherwise
    // derive one from the current project so every player in the same project
    // lands in the same room automatically.
    const storeState = useStore.getState();
    const overrideRoomId = storeState.joinRoomId;
    if (overrideRoomId) storeState.setJoinRoomId(null); // consume the override
    const roomId = overrideRoomId || (currentProject ? `project_${currentProject.id}` : 'default');
    const localPlayerId = user?.id ? `player_${user.id}_${Date.now()}` : `guest_${Math.random().toString(36).slice(2, 8)}`;
    const localUsername = user?.username || 'Player';

    const remotePlayerMeshes = new Map();
    // CSS2D-style name labels using canvas sprites
    function makeNameSprite(name) {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 48;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.roundRect ? ctx.roundRect(4, 4, cv.width - 8, cv.height - 8, 6) : ctx.fillRect(4, 4, cv.width - 8, cv.height - 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.substring(0, 20), cv.width / 2, cv.height / 2);
      const tex = new THREE.CanvasTexture(cv);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(2.0, 0.4, 1);
      sprite.userData.isNameLabel = true;
      return sprite;
    }

    function createRemotePlayerMesh(pid, username) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.3, 1.0, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x4fc3f7 })
      );
      body.position.y = 0.8;
      group.add(body);
      // Name label above player head (only visible to other players)
      const label = makeNameSprite(username || pid);
      label.position.y = 2.4;
      group.add(label);
      group.userData.playerId = pid;
      scene.add(group);
      return group;
    }

    const net = new NetworkManager();

    net.onRoomState = (players) => {
      players.forEach(p => {
        if (p.player_id !== localPlayerId && !remotePlayerMeshes.has(p.player_id)) {
          remotePlayerMeshes.set(p.player_id, {
            mesh: createRemotePlayerMesh(p.player_id, p.username),
            targetPos: p.position || { x: 0, y: 0, z: 0 },
            targetRotY: p.rotation?.y || 0,
          });
        }
      });
      setPlayerCount(net.playerCount);
      setOnlineCount(net.playerCount);
    };

    net.onPlayerJoined = (p) => {
      if (p.player_id !== localPlayerId && !remotePlayerMeshes.has(p.player_id)) {
        remotePlayerMeshes.set(p.player_id, {
          mesh: createRemotePlayerMesh(p.player_id, p.username),
          targetPos: p.position || { x: 0, y: 0, z: 0 },
          targetRotY: p.rotation?.y || 0,
        });
      }
      setPlayerCount(net.playerCount);
      setOnlineCount(net.playerCount);
      addLog(`${p.username || p.player_id} joined`);
    };

    net.onPlayerUpdated = (pid, position, rotation, _health) => {
      const entry = remotePlayerMeshes.get(pid);
      if (entry) {
        entry.targetPos = position;
        entry.targetRotY = rotation?.y || 0;
      }
    };

    net.onPlayerLeft = (pid) => {
      const entry = remotePlayerMeshes.get(pid);
      if (entry) { scene.remove(entry.mesh); remotePlayerMeshes.delete(pid); }
      setPlayerCount(net.playerCount);
      setOnlineCount(net.playerCount);
      addLog(`Player ${pid} left`);
    };

    net.onShootEvent = (msg) => {
      if (msg.origin && msg.direction) {
        const start = new THREE.Vector3(msg.origin.x, msg.origin.y, msg.origin.z);
        const dir = new THREE.Vector3(msg.direction.x, msg.direction.y, msg.direction.z).normalize();
        const end = start.clone().addScaledVector(dir, 50);
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff4444 }));
        scene.add(line);
        setTimeout(() => scene.remove(line), 120);
      }
    };

    net.onDamageEvent = (msg) => {
      if (msg.target_id === localPlayerId) {
        const newHealth = player.takeDamage(msg.amount);
        setHealth(newHealth);
      }
    };

    net.onChatMessage = (msg) => {
      setChatMessages(prev => [...prev.slice(-9), `${msg.username || msg.player_id}: ${msg.text}`]);
    };

    net.connect(roomId, localPlayerId, localUsername, currentProject?.name);

    // ---------------------------------------------------------------------------
    // Spawn AI bots from scene aiBot objects
    // ---------------------------------------------------------------------------
    const aiMeshes = new Map(); // agent_id → mesh

    function getOrCreateAIMesh(agentId, agentType) {
      if (aiMeshes.has(agentId)) return aiMeshes.get(agentId);
      const color = agentType === 'soldier' ? 0x4caf50 : 0x8b0000;
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 1.2, 4, 8),
        new THREE.MeshStandardMaterial({ color })
      );
      body.position.y = 0.9;
      group.add(body);
      group.userData.agentId = agentId;
      scene.add(group);
      aiMeshes.set(agentId, group);
      return group;
    }

    // Spawn AI agents defined in scene
    aiBotSpawns.forEach(bot => {
      const agentId = `bot_${bot.id}`;
      getOrCreateAIMesh(agentId, bot.aiType);
      const token = getToken();
      fetch(`/api/rooms/${roomId}/ai/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({
          agent_id: agentId,
          type: bot.aiType,
          position: bot.position,
        }),
      }).catch(() => {});
    });

    // AI spawn points – spawn enemies up to maxEnemies at spawnRate interval
    const aiSpawnTimers = new Map(); // spawnPointId → { count, nextSpawn }
    aiSpawnPoints.forEach(sp => {
      aiSpawnTimers.set(sp.id, { count: 0, nextSpawn: 0 });
    });

    let aiPollTimer = null;
    // AI target positions for smooth interpolation
    const aiTargetPositions = new Map(); // agent_id → {x,y,z}
    const dyingBots = new Map(); // agent_id → { mesh, elapsed }

    async function pollAI() {
      const agents = await fetchAIAgents(roomId);
      agents.forEach(agent => {
        if (agent.state === 'dead') {
          const m = aiMeshes.get(agent.agent_id);
          if (m && !dyingBots.has(agent.agent_id)) {
            // Turn red
            m.traverse(child => {
              if (child.isMesh) {
                child.material = child.material.clone();
                child.material.color.set(0xff0000);
                child.material.transparent = true;
              }
            });
            aiMeshes.delete(agent.agent_id);
            dyingBots.set(agent.agent_id, { mesh: m, elapsed: 0 });
          }
          aiTargetPositions.delete(agent.agent_id);
          // Decrement count for the spawn point tracking
          aiSpawnTimers.forEach((v, spId) => {
            if (agent.agent_id.startsWith(`aisp_${spId}_`)) v.count = Math.max(0, v.count - 1);
          });
          return;
        }
        getOrCreateAIMesh(agent.agent_id, agent.type);
        if (agent.position) {
          aiTargetPositions.set(agent.agent_id, agent.position);
        }
      });
    }

    aiPollTimer = setInterval(pollAI, 200);
    pollAI();

    // ---------------------------------------------------------------------------
    // Pointer lock
    // ---------------------------------------------------------------------------
    const requestLock = () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); };
    canvas.addEventListener('click', requestLock);

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      setIsLocked(locked);
      // Clear held key/button state when pointer lock is released so the player
      // doesn't keep moving (Escape key press doesn't always fire keyup events).
      if (!locked) input.clearKeys();
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // Resize
    const resizeObs = new ResizeObserver(() => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObs.observe(canvas.parentElement || canvas);

    // ---------------------------------------------------------------------------
    // Projectile system (ballistic arc)
    // ---------------------------------------------------------------------------
    const projectiles = []; // { mesh, velocity, lifetime }

    function spawnProjectile(origin, direction) {
      const geo = new THREE.SphereGeometry(0.07, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffee44 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin);
      // Initial velocity: forward at speed 60 + slight upward arc
      const vel = direction.clone().normalize().multiplyScalar(60);
      vel.y += 3; // slight upward arc
      scene.add(mesh);
      projectiles.push({ mesh, velocity: vel, lifetime: 3.0, hitIds: new Set() });
    }

    function updateProjectiles(dt) {
      const gravity = -30;
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.velocity.y += gravity * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.lifetime -= dt;

        // Check if projectile hits AI
        let hit = false;
        aiMeshes.forEach((aiMesh, agentId) => {
          if (p.hitIds.has(agentId)) return;
          // Check against the body center (capsule body is at BOT_CENTER_Y_OFFSET from group)
          const botCenter = aiMesh.position.clone().add(new THREE.Vector3(0, BOT_CENTER_Y_OFFSET, 0));
          const dist = p.mesh.position.distanceTo(botCenter);
          if (dist < AI_HIT_RADIUS) {
            p.hitIds.add(agentId);
            hit = true;
            setHitMarker(true);
            setTimeout(() => setHitMarker(false), 150);
            const token = getToken();
            fetch(`/api/rooms/${roomId}/ai/${agentId}/damage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
              body: JSON.stringify({ amount: weaponDamage }),
            }).catch(() => {});
          }
        });
        // Check if projectile hits physics-enabled scene objects and apply impulse
        scenePhysicsBodies.forEach(({ obj, mesh }) => {
          if (p.hitIds.has(obj.id)) return;
          const dist = p.mesh.position.distanceTo(mesh.position);
          const hitRadius = Math.max(OBJECT_HIT_RADIUS_BASE, (obj.scale?.x || 1) * OBJECT_HIT_RADIUS_BASE);
          if (dist < hitRadius) {
            p.hitIds.add(obj.id);
            hit = true;
            const impulseMag = PROJECTILE_IMPULSE_BASE / Math.max(0.1, obj.mass || 1);
            const iv = p.velocity.clone().normalize().multiplyScalar(impulseMag);
            physics.applyImpulse(obj.id, iv.x, iv.y, iv.z);
          }
        });
        // Check if projectile hits remote players
        if (net.isConnected && pvpEnabled) {
          remotePlayerMeshes.forEach((entry, pid) => {
            if (p.hitIds.has(pid)) return;
            const dist = p.mesh.position.distanceTo(entry.mesh.position);
            if (dist < 1.0) {
              p.hitIds.add(pid);
              hit = true;
              setHitMarker(true);
              setTimeout(() => setHitMarker(false), 150);
              net.sendDamage(pid, weaponDamage);
            }
          });
        }

        if (p.lifetime <= 0 || hit || p.mesh.position.y < -20) {
          scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          projectiles.splice(i, 1);
        }
      }
    }

    // Shooting
    let netUpdateAccum = 0;
    const weaponDamage = projectSettings?.weaponDamage ?? 25;
    const pvpEnabled = projectSettings?.pvpDamage ?? true;

    const onMouseDown = (e) => {
      if (e.button === 0 && document.pointerLockElement === canvas) {
        // Resume audio context on user gesture
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        // Muzzle flash + sound
        setShootFlash(true);
        setTimeout(() => setShootFlash(false), 80);
        playShootSound(audioCtx);

        // Spawn ballistic projectile
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const origin = camera.position.clone().addScaledVector(dir, 0.5);
        spawnProjectile(origin, dir);

        // Also do instant raycast for visual feedback
        const result = player.shoot(scene, []);
        if (result) {
          setHitMarker(true);
          setTimeout(() => setHitMarker(false), 150);

          // Check if hit an AI bot (fallback raycast hit)
          if (result.id && result.id.startsWith('bot_')) {
            const token = getToken();
            fetch(`/api/rooms/${roomId}/ai/${result.id}/damage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
              body: JSON.stringify({ amount: weaponDamage }),
            }).catch(() => {});
          }

          if (net.isConnected && pvpEnabled) {
            net.sendShoot(
              { x: camera.position.x, y: camera.position.y, z: camera.position.z },
              { x: dir.x, y: dir.y, z: dir.z }
            );
          }
        }
      }
    };
    document.addEventListener('mousedown', onMouseDown);

    // AI-player collision damage
    let aiDamageCooldown = 0;
    function checkAICollisions(dt) {
      aiDamageCooldown = Math.max(0, aiDamageCooldown - dt);
      if (!player.body || aiDamageCooldown > 0) return;
      const px = player.body.position.x;
      const py = player.body.position.y;
      const pz = player.body.position.z;
      aiMeshes.forEach((aiMesh) => {
        const dx = aiMesh.position.x - px;
        const dy = aiMesh.position.y - py;
        const dz = aiMesh.position.z - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1.5) {
          // Find attack damage from spawns
          const spawnData = aiBotSpawns.find(b => `bot_${b.id}` === aiMesh.userData?.agentId);
          const dmg = spawnData?.attackDamage ?? (projectSettings?.aiAttackDamage ?? 10);
          player.takeDamage(dmg);
          setHealth(player.health);
          aiDamageCooldown = 1.0; // 1 second cooldown between hits
        }
      });
    }

    // Kill volume check
    let killCooldown = false;
    let isDead = false;
    function checkKillVolumes() {
      if (!player.body || killCooldown || isDead) return;
      const px = player.body.position.x, py = player.body.position.y, pz = player.body.position.z;
      for (const kv of killVolumes) {
        const hw = (kv.scale.x || 2) / 2, hh = (kv.scale.y || 2) / 2, hd = (kv.scale.z || 2) / 2;
        if (Math.abs(px - kv.position.x) < hw && Math.abs(py - kv.position.y) < hh && Math.abs(pz - kv.position.z) < hd) {
          killCooldown = true;
          player.health = 0;
          setHealth(0);
          isDead = true;
          setDeathMessage(kv.message);
          setTimeout(() => {
            setDeathMessage('');
            isDead = false;
            player.respawn({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z });
            player.health = 100;
            setHealth(100);
            if (net.isConnected) net.sendRespawn({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z });
            killCooldown = false;
          }, 2000);
          return;
        }
      }
    }

    function checkPlayerDeath() {
      if (!player.body || killCooldown || isDead) return;
      if (player.health <= 0) {
        killCooldown = true;
        isDead = true;
        setDeathMessage('You died! Respawning...');
        setTimeout(() => {
          setDeathMessage('');
          isDead = false;
          player.respawn({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z });
          player.health = 100;
          setHealth(100);
          if (net.isConnected) net.sendRespawn({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z });
          killCooldown = false;
        }, 2000);
      }
    }

    // Animation loop
    let animId;
    let last = performance.now();
    let bobPhase = 0;
    let footstepAccum = 0;
    let gameTime = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      gameTime += dt;

      player.update(dt);
      physics.step(dt);
      updateProjectiles(dt);
      checkKillVolumes();
      checkAICollisions(dt);
      checkPlayerDeath();
      setHealth(player.health);

      // AI spawn point logic
      aiSpawnPoints.forEach(sp => {
        const timerState = aiSpawnTimers.get(sp.id);
        if (!timerState) return;
        if (timerState.count < sp.maxEnemies && gameTime >= timerState.nextSpawn) {
          timerState.count++;
          timerState.nextSpawn = gameTime + sp.spawnRate;
          const agentId = `aisp_${sp.id}_${Date.now()}`;
          getOrCreateAIMesh(agentId, sp.aiType);
          const token = getToken();
          // Spawn slightly randomized around the spawn point
          const angle = Math.random() * Math.PI * 2;
          const radius = 1 + Math.random() * 2;
          fetch(`/api/rooms/${roomId}/ai/spawn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
            body: JSON.stringify({
              agent_id: agentId,
              type: sp.aiType,
              position: {
                x: sp.position.x + Math.cos(angle) * radius,
                y: sp.position.y,
                z: sp.position.z + Math.sin(angle) * radius,
              },
            }),
          }).catch(() => {});
        }
      });

      // Camera bob + footsteps based on movement speed
      if (player.body) {
        const vx = player.body.velocity.x;
        const vz = player.body.velocity.z;
        const moveSpd = Math.sqrt(vx * vx + vz * vz);
        setSpeed(Math.round(moveSpd));
        if (moveSpd > 0.5 && player.isGrounded) {
          bobPhase += dt * moveSpd * 2.5;
          camera.position.y += Math.sin(bobPhase) * 0.035;
          // Footstep sound at each stride
          footstepAccum += dt * moveSpd;
          if (footstepAccum > 1.4) {
            footstepAccum = 0;
            playFootstepSound(audioCtx);
          }
        } else {
          footstepAccum = 0;
        }
      }

      // Smooth-interpolate AI meshes toward target positions
      aiMeshes.forEach((aiMesh, agentId) => {
        const tp = aiTargetPositions.get(agentId);
        if (tp) {
          aiMesh.position.lerp(new THREE.Vector3(tp.x || 0, tp.y || 0, tp.z || 0), 0.12);
          // Face toward movement direction
          const dx = (tp.x || 0) - aiMesh.position.x;
          const dz = (tp.z || 0) - aiMesh.position.z;
          if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
            aiMesh.rotation.y = Math.atan2(dx, dz);
          }
        }
      });

      // Animate dying bots (sink through floor + fade out)
      dyingBots.forEach((dying, agentId) => {
        dying.elapsed += dt;
        dying.mesh.position.y -= dt * 1.5; // sink through floor
        const opacity = Math.max(0, 1 - dying.elapsed / DEATH_ANIMATION_DURATION);
        dying.mesh.traverse(child => {
          if (child.isMesh) child.material.opacity = opacity;
        });
        if (dying.elapsed >= DEATH_ANIMATION_DURATION) {
          scene.remove(dying.mesh);
          dyingBots.delete(agentId);
        }
      });

      // Interpolate remote players
      remotePlayerMeshes.forEach(entry => {
        const tp = entry.targetPos;
        if (tp) {
          entry.mesh.position.lerp(new THREE.Vector3(tp.x, tp.y, tp.z), 0.2);
        }
        entry.mesh.rotation.y = entry.targetRotY || 0;
      });

      // Send position to server at ~20 Hz
      netUpdateAccum += dt;
      if (netUpdateAccum >= 0.05 && net.isConnected && player.body) {
        netUpdateAccum = 0;
        net.sendUpdate(
          { x: player.body.position.x, y: player.body.position.y, z: player.body.position.z },
          { y: player.yaw },
          player.health
        );
        setPlayerCount(net.playerCount);
        setOnlineCount(net.playerCount);
      }

      renderer.render(scene, camera);
    }
    animate();

    // Escape to exit (only when pointer lock is released)
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
      net.disconnect();
      clearInterval(aiPollTimer);
      // Clean up remaining projectiles
      projectiles.forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
      // Clean up dying bots
      dyingBots.forEach(dying => { scene.remove(dying.mesh); });
      setOnlineCount(0);
      canvas.removeEventListener('click', requestLock);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', exitHandler);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.exitPointerLock?.();
      floorTex.dispose();
      if (audioCtx) audioCtx.close().catch(() => {});
      renderer.dispose();
    };
  // PlayMode sets up the entire 3D scene on mount. Re-running when sceneObjects etc.
  // change would destroy and recreate the whole scene mid-play, which is not desired.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'none' }} />

      {/* Pointer-lock overlay */}
      {!isLocked && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', pointerEvents: 'none',
        }}>
          <div style={{ color: 'white', fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>🖱 Click to Play</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
            WASD: Move · Space: Jump · Click: Shoot · Escape: Exit
          </div>
        </div>
      )}

      {/* Health */}
      <div style={{ position: 'absolute', top: 16, left: 16 }}>
        <HealthBar health={health} />
      </div>

      {/* Muzzle flash */}
      {shootFlash && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(255,255,180,0.18)',
          pointerEvents: 'none', borderRadius: 0,
        }} />
      )}

      {/* Crosshair / hit marker */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        color: hitMarker ? '#ff4444' : 'white',
        fontSize: hitMarker ? '22px' : '20px',
        fontWeight: hitMarker ? 900 : 400,
        pointerEvents: 'none', userSelect: 'none',
        textShadow: '0 0 3px black', lineHeight: 1,
        transition: 'color 0.1s',
      }}>+</div>

      {/* Player count */}
      <div style={{ position: 'absolute', top: 16, right: 16, color: 'white', fontSize: '14px', background: 'rgba(0,0,0,0.5)', padding: '8px 12px', borderRadius: '4px' }}>
        Players: {playerCount}
      </div>

      {/* Speed indicator */}
      {speed > 0.5 && (
        <div style={{ position: 'absolute', bottom: 48, right: 16, color: 'rgba(255,255,255,0.6)', fontSize: '12px', background: 'rgba(0,0,0,0.4)', padding: '4px 8px', borderRadius: '3px' }}>
          {speed} m/s
        </div>
      )}

      {/* Kill message */}
      {killMessage && (
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', color: 'red', fontSize: '22px', fontWeight: 'bold', textShadow: '0 0 6px black', textAlign: 'center' }}>
          {killMessage}
        </div>
      )}

      {/* Death / respawn message */}
      {deathMessage && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }}>
          <div style={{ color: '#ff4444', fontSize: '36px', fontWeight: 'bold', textShadow: '0 0 12px #ff0000', marginBottom: '12px' }}>💀 You Died</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '18px' }}>{deathMessage}</div>
        </div>
      )}

      {/* Chat messages */}
      {chatMessages.length > 0 && (
        <div style={{ position: 'absolute', bottom: 48, left: 16, display: 'flex', flexDirection: 'column', gap: '4px', pointerEvents: 'none' }}>
          {chatMessages.map((msg, i) => (
            <div key={i} style={{ color: 'white', fontSize: '13px', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '3px' }}>{msg}</div>
          ))}
        </div>
      )}

      {/* Exit hint (when locked) */}
      {isLocked && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
          WASD: Move · Shift: Sprint · Ctrl: Crouch · Space: Jump · Click: Shoot · Escape: Exit
        </div>
      )}
    </div>
  );
}

