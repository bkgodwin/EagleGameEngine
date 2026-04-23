import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { useStore } from '../store/index.js';
import { saveProject as apiSaveProject } from '../api/index.js';

// --------------------------------------------------------------------------
// Canvas-based grid texture: 1 cell = 1 world unit, 2 cells = player height
// --------------------------------------------------------------------------
function makeGridTexture() {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, size, size);
  ctx.strokeRect(0, 0, size / 2, size / 2);
  ctx.strokeRect(size / 2, size / 2, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const Viewport = forwardRef((props, ref) => {
  const canvasRef = useRef(null);
  const stateRef = useRef({});
  const {
    addSceneObject, removeSceneObject, updateSceneObject,
    setSelectedObjectId, selectedObjectId, sceneObjects,
    editorMode, addLog, currentProject, settings, snapSettings, globalLighting,
  } = useStore();

  // Keep a ref to the latest store values accessible inside closures
  const storeRef = useRef({});
  storeRef.current = { selectedObjectId, editorMode, sceneObjects, settings, snapSettings, globalLighting, currentProject };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.Fog(0x0a0a1a, 200, 500);

    // ---- Camera ----
    const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    function setSize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    setSize();

    // ---- Lights ----
    const initLighting = storeRef.current.globalLighting;
    const ambient = new THREE.AmbientLight(
      new THREE.Color(initLighting.ambientColor),
      initLighting.ambientIntensity
    );
    scene.add(ambient);
    const sunLight = new THREE.DirectionalLight(
      new THREE.Color(initLighting.sunColor),
      initLighting.sunIntensity
    );
    sunLight.position.set(initLighting.sunX, initLighting.sunY, initLighting.sunZ);
    sunLight.castShadow = false;
    scene.add(sunLight);

    // ---- Grid floor with texture ----
    const gridTex = makeGridTexture();
    gridTex.repeat.set(200, 200);
    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshStandardMaterial({ map: gridTex });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.01;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const grid = new THREE.GridHelper(200, 200, 0x444444, 0x222222);
    grid.position.y = 0;
    scene.add(grid);

    // ---- Object maps ----
    const objectMap = new Map(); // id -> { mesh, data }
    const gizmoGroup = new THREE.Group();
    gizmoGroup.userData.isGizmoGroup = true;
    scene.add(gizmoGroup);

    // ---- Selection box ----
    let selectionBox = null;

    // ---- Orbit camera state ----
    const spherical = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 15 };
    const target = new THREE.Vector3(0, 0, 0);
    let isOrbiting = false;
    let isPanning = false;
    let lastMouse = { x: 0, y: 0 };

    // ---- Gizmo drag state ----
    let draggingGizmo = null; // { axis, type, objInitPos, objInitRot, objInitScale, startX, startY }

    function updateCamera() {
      camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = target.y + spherical.radius * Math.cos(spherical.phi);
      camera.position.z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(target);
    }
    updateCamera();

    // ---- Snap helper ----
    function snapValue(val, step) {
      if (!step || step <= 0) return val;
      return Math.round(val / step) * step;
    }

    // ---- Gizmo drag apply ----
    function applyGizmoDrag(clientX, clientY) {
      if (!draggingGizmo) return;
      const { axis, type, objInitPos, objInitRot, objInitScale, startX, startY } = draggingGizmo;
      const totalDx = clientX - startX;
      const totalDy = clientY - startY;
      const sel = storeRef.current.selectedObjectId;
      const entry = objectMap.get(sel);
      if (!entry) return;
      const { snapSettings: snap } = storeRef.current;

      const worldDir = new THREE.Vector3(
        axis === 'x' ? 1 : 0,
        axis === 'y' ? 1 : 0,
        axis === 'z' ? 1 : 0
      );

      if (type === 'translate') {
        const screenStart = objInitPos.clone().project(camera);
        const screenEnd = objInitPos.clone().add(worldDir).project(camera);
        const sdx = screenEnd.x - screenStart.x;
        const sdy = screenEnd.y - screenStart.y;
        const sLen = Math.sqrt(sdx * sdx + sdy * sdy);
        if (sLen < 0.001) return;
        const ndx = (totalDx / canvas.clientWidth) * 2;
        const ndy = -(totalDy / canvas.clientHeight) * 2;
        const dot = ndx * (sdx / sLen) + ndy * (sdy / sLen);
        let delta = dot * spherical.radius * 0.5;
        if (snap.enabled) delta = snapValue(delta, snap.translate);
        const newPos = objInitPos.clone().addScaledVector(worldDir, delta);
        entry.mesh.position.copy(newPos);
        updateSceneObject(sel, { position: { x: newPos.x, y: newPos.y, z: newPos.z } });
      } else if (type === 'rotate') {
        const sensitivity = 0.01;
        let delta = axis === 'y' ? totalDx * sensitivity : axis === 'x' ? totalDy * sensitivity : totalDx * sensitivity;
        if (snap.enabled) {
          const stepRad = (snap.rotate * Math.PI) / 180;
          delta = snapValue(delta, stepRad);
        }
        const nx = objInitRot.x + (axis === 'x' ? delta : 0);
        const ny = objInitRot.y + (axis === 'y' ? delta : 0);
        const nz = objInitRot.z + (axis === 'z' ? delta : 0);
        entry.mesh.rotation.set(nx, ny, nz);
        updateSceneObject(sel, { rotation: { x: nx, y: ny, z: nz } });
      } else if (type === 'scale') {
        const screenStart = objInitPos.clone().project(camera);
        const screenEnd = objInitPos.clone().add(worldDir).project(camera);
        const sdx = screenEnd.x - screenStart.x;
        const sdy = screenEnd.y - screenStart.y;
        const sLen = Math.sqrt(sdx * sdx + sdy * sdy);
        if (sLen < 0.001) return;
        const ndx = (totalDx / canvas.clientWidth) * 2;
        const ndy = -(totalDy / canvas.clientHeight) * 2;
        const dot = ndx * (sdx / sLen) + ndy * (sdy / sLen);
        let delta = dot * spherical.radius * 0.15;
        if (snap.enabled) delta = snapValue(delta, snap.scale);
        const ns = objInitScale.clone();
        if (axis === 'x') ns.x = Math.max(0.01, objInitScale.x + delta);
        else if (axis === 'y') ns.y = Math.max(0.01, objInitScale.y + delta);
        else ns.z = Math.max(0.01, objInitScale.z + delta);
        entry.mesh.scale.copy(ns);
        updateSceneObject(sel, { scale: { x: ns.x, y: ns.y, z: ns.z } });
      }
    }

    // ---- Pointer events ----
    const onMouseDown = (e) => {
      lastMouse = { x: e.clientX, y: e.clientY };

      if (e.button === 0) {
        // Check gizmo hit first
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const gizmoMeshes = [];
        gizmoGroup.traverse(obj => { if (obj.isMesh && obj.userData.gizmoAxis) gizmoMeshes.push(obj); });
        const gizmoHits = raycaster.intersectObjects(gizmoMeshes, false);
        if (gizmoHits.length > 0) {
          const gd = gizmoHits[0].object.userData;
          const sel = storeRef.current.selectedObjectId;
          const entry = objectMap.get(sel);
          if (entry) {
            draggingGizmo = {
              axis: gd.gizmoAxis,
              type: gd.gizmoType,
              objInitPos: entry.mesh.position.clone(),
              objInitRot: { x: entry.mesh.rotation.x, y: entry.mesh.rotation.y, z: entry.mesh.rotation.z },
              objInitScale: entry.mesh.scale.clone(),
              startX: e.clientX,
              startY: e.clientY,
            };
          }
          e.preventDefault();
          return;
        }
      }

      if (e.button === 2) { isOrbiting = true; e.preventDefault(); }
      if (e.button === 1) { isPanning = true; e.preventDefault(); }
    };

    const onMouseMove = (e) => {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      lastMouse = { x: e.clientX, y: e.clientY };

      if (draggingGizmo) {
        applyGizmoDrag(e.clientX, e.clientY);
        return;
      }

      if (isOrbiting) {
        spherical.theta -= dx * 0.005;
        spherical.phi -= dy * 0.005;
        spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi));
        updateCamera();
      }
      if (isPanning) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        camera.getWorldDirection(new THREE.Vector3());
        right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
        up.copy(camera.up);
        const panScale = spherical.radius * 0.001;
        target.addScaledVector(right, -dx * panScale);
        target.addScaledVector(up, dy * panScale);
        updateCamera();
      }
    };
    const onMouseUp = () => {
      draggingGizmo = null;
      isOrbiting = false;
      isPanning = false;
    };
    const onWheel = (e) => {
      spherical.radius *= 1 + e.deltaY * 0.001;
      spherical.radius = Math.max(0.5, Math.min(500, spherical.radius));
      updateCamera();
    };
    const onContextMenu = (e) => e.preventDefault();

    // ---- Click selection ----
    const onClick = (e) => {
      if (e.button !== 0) return;
      // Don't fire selection right after a gizmo drag
      if (e.detail === 1 && e.movementX === 0 && e.movementY === 0) { /* proceed */ }
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const meshes = [];
      scene.traverse(obj => {
        if (obj.isMesh && obj.userData.eagleId && obj !== selectionBox && !obj.userData.isGizmo && !obj.userData.isHelper) meshes.push(obj);
      });
      const hits = raycaster.intersectObjects(meshes, true);
      if (hits.length > 0) {
        let hit = hits[0].object;
        while (hit && !hit.userData.eagleId) hit = hit.parent;
        if (hit?.userData?.eagleId) {
          const id = hit.userData.eagleId;
          setSelectedObjectId(id);
          selectMesh(id);
          // terrain sculpting
          const { editorMode: mode, sceneObjects: objs } = storeRef.current;
          const obj2 = objs.find(o => o.id === id);
          if (obj2?.type === 'terrain' && mode === 'select') {
            const worldPt = hits[0].point;
            const entry = objectMap.get(id);
            if (entry?.terrainManager) {
              entry.terrainManager.sculpt(worldPt, obj2.terrainTool || 'raise', obj2.brushSize || 5, obj2.brushStrength || 0.1);
              // Sync height data back to store so play mode and save see it
              updateSceneObject(id, { heightData: Array.from(entry.terrainManager.heightData) });
            }
          }
        }
      } else {
        setSelectedObjectId(null);
        clearSelection();
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('click', onClick);

    // ---- Resize Observer ----
    const resizeObserver = new ResizeObserver(() => setSize());
    resizeObserver.observe(canvas.parentElement || canvas);

    // ---- Gizmo helpers ----
    function buildTranslateGizmo(pos) {
      const arrowLen = 1.2;
      const axes = [
        { dir: new THREE.Vector3(1, 0, 0), color: 0xff3333, axis: 'x' },
        { dir: new THREE.Vector3(0, 1, 0), color: 0x33ff33, axis: 'y' },
        { dir: new THREE.Vector3(0, 0, 1), color: 0x3333ff, axis: 'z' },
      ];
      axes.forEach(({ dir, color, axis }) => {
        const points = [pos.clone(), pos.clone().addScaledVector(dir, arrowLen)];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
        line.userData.isGizmo = true;
        gizmoGroup.add(line);
        const coneGeo = new THREE.ConeGeometry(0.1, 0.3, 8);
        const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color }));
        cone.position.copy(pos).addScaledVector(dir, arrowLen + 0.15);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        cone.userData.isGizmo = true;
        cone.userData.gizmoAxis = axis;
        cone.userData.gizmoType = 'translate';
        gizmoGroup.add(cone);
      });
    }

    function buildRotateGizmo(pos) {
      const radius = 1.1;
      const axes = [
        { normal: new THREE.Vector3(1, 0, 0), color: 0xff3333, axis: 'x' },
        { normal: new THREE.Vector3(0, 1, 0), color: 0x33ff33, axis: 'y' },
        { normal: new THREE.Vector3(0, 0, 1), color: 0x3333ff, axis: 'z' },
      ];
      axes.forEach(({ normal, color, axis }) => {
        const torusGeo = new THREE.TorusGeometry(radius, 0.04, 8, 36);
        const torus = new THREE.Mesh(torusGeo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        torus.position.copy(pos);
        // Orient the torus ring to face the correct axis
        if (normal.x === 1) torus.rotation.y = Math.PI / 2;
        else if (normal.z === 1) torus.rotation.x = Math.PI / 2;
        torus.userData.isGizmo = true;
        torus.userData.gizmoAxis = axis;
        torus.userData.gizmoType = 'rotate';
        gizmoGroup.add(torus);
      });
    }

    function buildScaleGizmo(pos) {
      const len = 1.2;
      const axes = [
        { dir: new THREE.Vector3(1, 0, 0), color: 0xff3333, axis: 'x' },
        { dir: new THREE.Vector3(0, 1, 0), color: 0x33ff33, axis: 'y' },
        { dir: new THREE.Vector3(0, 0, 1), color: 0x3333ff, axis: 'z' },
      ];
      axes.forEach(({ dir, color, axis }) => {
        const points = [pos.clone(), pos.clone().addScaledVector(dir, len)];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
        line.userData.isGizmo = true;
        gizmoGroup.add(line);
        const boxGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
        const box = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color }));
        box.position.copy(pos).addScaledVector(dir, len + 0.09);
        box.userData.isGizmo = true;
        box.userData.gizmoAxis = axis;
        box.userData.gizmoType = 'scale';
        gizmoGroup.add(box);
      });
    }

    function clearSelection() {
      if (selectionBox) { scene.remove(selectionBox); selectionBox = null; }
      gizmoGroup.clear();
    }

    function selectMesh(id) {
      clearSelection();
      const entry = objectMap.get(id);
      if (!entry) return;
      const box3 = new THREE.Box3().setFromObject(entry.mesh);
      const helper = new THREE.Box3Helper(box3, 0xe63946);
      helper.userData.isHelper = true;
      scene.add(helper);
      selectionBox = helper;
      // Build the correct gizmo based on current editor mode
      const pos = entry.mesh.position.clone();
      const mode = storeRef.current.editorMode;
      if (mode === 'translate') buildTranslateGizmo(pos);
      else if (mode === 'rotate') buildRotateGizmo(pos);
      else if (mode === 'scale') buildScaleGizmo(pos);
    }

    // ---- Object creation ----
    const gridTex2 = makeGridTexture();
    gridTex2.repeat.set(1, 1);

    function createObjectMesh(type, id, name, options = {}) {
      const position = options.position || { x: 0, y: 0, z: 0 };
      const rotation = options.rotation || { x: 0, y: 0, z: 0 };
      const scale = options.scale || { x: 1, y: 1, z: 1 };
      const color = options.color || '#888888';
      let mesh;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color) });

      switch (type) {
        case 'cube':
          mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
          break;
        case 'sphere':
          mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 24), mat);
          break;
        case 'plane': {
          const planeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide });
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), planeMat);
          mesh.rotation.x = -Math.PI / 2;
          break;
        }
        case 'directionalLight': {
          const light = new THREE.DirectionalLight(0xffffff, 1);
          light.castShadow = false;
          const icon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
          const group = new THREE.Group();
          group.add(light); group.add(icon);
          mesh = group;
          break;
        }
        case 'pointLight': {
          const light = new THREE.PointLight(0xffffff, 1, 20);
          const icon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
          const group = new THREE.Group();
          group.add(light); group.add(icon);
          mesh = group;
          break;
        }
        case 'spotlight': {
          const light = new THREE.SpotLight(0xffffff, 1);
          const icon = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
          const group = new THREE.Group();
          group.add(light); group.add(icon);
          mesh = group;
          break;
        }
        case 'terrain': {
          const geo = new THREE.PlaneGeometry(100, 100, 64, 64);
          geo.rotateX(-Math.PI / 2);
          const terrainTex = makeGridTexture();
          terrainTex.repeat.set(50, 50);
          const terrainMat = new THREE.MeshStandardMaterial({ map: terrainTex, side: THREE.DoubleSide });
          mesh = new THREE.Mesh(geo, terrainMat);
          break;
        }
        case 'spawnPoint': {
          const group = new THREE.Group();
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
          cone.position.y = 0.4;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xcccccc }));
          pole.position.y = 0.6;
          group.add(cone); group.add(pole);
          mesh = group;
          break;
        }
        case 'killVolume': {
          const geo = new THREE.BoxGeometry(2, 2, 2);
          const killMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, wireframe: true });
          mesh = new THREE.Mesh(geo, killMat);
          break;
        }
        case 'aiBot': {
          const group = new THREE.Group();
          const bodyMesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.35, 1.2, 4, 8),
            new THREE.MeshStandardMaterial({ color: 0xff6600 })
          );
          bodyMesh.position.y = 0.9;
          const headMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xffaa44 })
          );
          headMesh.position.y = 1.85;
          group.add(bodyMesh);
          group.add(headMesh);
          mesh = group;
          break;
        }
        default:
          mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      }

      mesh.position.set(position.x, position.y, position.z);
      mesh.rotation.set(rotation.x, rotation.y, rotation.z);
      mesh.scale.set(scale.x, scale.y, scale.z);
      mesh.userData.eagleId = id;
      mesh.userData.eagleType = type;
      mesh.userData.eagleName = name;
      mesh.traverse(child => { if (child !== mesh) child.userData.eagleId = id; });

      scene.add(mesh);

      const entry = { mesh, type, id, name };
      if (type === 'terrain') {
        entry.terrainManager = {
          segments: 64,
          width: 100,
          depth: 100,
          heightData: new Float32Array(65 * 65),
          sculpt(worldPos, tool, brushSize, strength) {
            const pos2 = mesh.geometry.attributes.position;
            const segments = 64;
            const halfW = 50, halfD = 50;
            const stepX = 100 / segments, stepZ = 100 / segments;
            for (let zi = 0; zi <= segments; zi++) {
              for (let xi = 0; xi <= segments; xi++) {
                const vx = -halfW + xi * stepX;
                const vz = -halfD + zi * stepZ;
                const dx = vx - (worldPos.x - mesh.position.x);
                const dz = vz - (worldPos.z - mesh.position.z);
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < brushSize) {
                  const falloff = 1 - dist / brushSize;
                  const idx = zi * (segments + 1) + xi;
                  if (tool === 'raise') this.heightData[idx] += strength * falloff;
                  else if (tool === 'lower') this.heightData[idx] -= strength * falloff;
                  else if (tool === 'smooth') {
                    let avg = 0, cnt = 0;
                    for (let dxi = -1; dxi <= 1; dxi++) for (let dzi = -1; dzi <= 1; dzi++) {
                      const ni = Math.max(0, Math.min(segments, zi + dzi)) * (segments + 1) + Math.max(0, Math.min(segments, xi + dxi));
                      avg += this.heightData[ni]; cnt++;
                    }
                    avg /= cnt;
                    this.heightData[idx] += (avg - this.heightData[idx]) * falloff * strength;
                  }
                  pos2.setY(idx, this.heightData[idx]);
                }
              }
            }
            pos2.needsUpdate = true;
            mesh.geometry.computeVertexNormals();
          },
          importHeightmap(imageData) {
            const pos2 = mesh.geometry.attributes.position;
            const segments = 64;
            const maxH = 20;
            const w = imageData.width, h = imageData.height;
            for (let zi = 0; zi <= segments; zi++) {
              for (let xi = 0; xi <= segments; xi++) {
                const px = Math.floor((xi / segments) * (w - 1));
                const pz = Math.floor((zi / segments) * (h - 1));
                const i4 = (pz * w + px) * 4;
                const gray = imageData.data[i4] / 255;
                const idx = zi * (segments + 1) + xi;
                this.heightData[idx] = gray * maxH;
                pos2.setY(idx, this.heightData[idx]);
              }
            }
            pos2.needsUpdate = true;
            mesh.geometry.computeVertexNormals();
          },
        };
      }

      objectMap.set(id, entry);
      return entry;
    }

    function disposeMesh(m) {
      m.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
          else child.material.dispose();
        }
      });
    }

    // ---- Load scene from store state on mount ----
    const initialObjs = storeRef.current.sceneObjects;
    initialObjs.forEach(obj => {
      if (!objectMap.has(obj.id)) {
        const entry = createObjectMesh(obj.type, obj.id, obj.name, {
          position: obj.position,
          rotation: obj.rotation,
          scale: obj.scale,
          color: obj.material?.color || obj.color || '#888888',
        });
        // Restore terrain height data if present
        if (obj.heightData && entry.terrainManager) {
          entry.terrainManager.heightData = new Float32Array(obj.heightData);
          const pos = entry.mesh.geometry.attributes.position;
          entry.terrainManager.heightData.forEach((hv, i) => pos.setY(i, hv));
          pos.needsUpdate = true;
          entry.mesh.geometry.computeVertexNormals();
        }
      }
    });

    // ---- Animation loop ----
    let animId;
    let lastSelectedId = null;
    let lastEditorMode = null;
    function animate() {
      animId = requestAnimationFrame(animate);
      const { selectedObjectId: sel, editorMode: mode } = storeRef.current;
      // Refresh gizmos if selection or mode changed
      if (sel !== lastSelectedId || mode !== lastEditorMode) {
        lastSelectedId = sel;
        lastEditorMode = mode;
        if (sel) selectMesh(sel);
        else clearSelection();
      }
      // Update selection box position (in case mesh moved via gizmo)
      if (selectionBox && sel) {
        const entry = objectMap.get(sel);
        if (entry) {
          const box3 = new THREE.Box3().setFromObject(entry.mesh);
          if (selectionBox.box) selectionBox.box.copy(box3);
          // Keep gizmo group anchored to object
          gizmoGroup.traverse(child => {
            if (child.userData.gizmoType) {
              // gizmos will be rebuilt on next selection change
            }
          });
        }
      }
      renderer.render(scene, camera);
    }
    animate();

    stateRef.current = { scene, camera, renderer, objectMap, gizmoGroup, createObjectMesh, disposeMesh, selectMesh, clearSelection, ambient, sunLight };

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('click', onClick);
      objectMap.forEach(entry => { scene.remove(entry.mesh); disposeMesh(entry.mesh); });
      objectMap.clear();
      gridTex.dispose();
      gridTex2.dispose();
      renderer.dispose();
    };
  }, []); // run once on mount

  // ---- Imperative API ----
  useImperativeHandle(ref, () => ({
    addObject(type, name) {
      const id = 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const defaultY = type === 'terrain' ? 0 : type === 'directionalLight' ? 5 : type === 'pointLight' ? 3 : 0.5;
      const position = { x: 0, y: defaultY, z: 0 };
      const scale = { x: 1, y: 1, z: 1 };
      const rotation = { x: 0, y: 0, z: 0 };
      const color = '#888888';
      const { createObjectMesh } = stateRef.current;
      if (createObjectMesh) createObjectMesh(type, id, name, { position, rotation, scale, color });
      addSceneObject({ id, name, type, position, rotation, scale, color, material: { color, wireframe: false } });
      addLog(`Added ${type}: ${name}`);
    },
    removeObject(id) {
      const { scene, objectMap, disposeMesh, clearSelection } = stateRef.current;
      if (!objectMap) return;
      const entry = objectMap.get(id);
      if (entry) {
        scene.remove(entry.mesh);
        disposeMesh(entry.mesh);
        objectMap.delete(id);
      }
      removeSceneObject(id);
      const { selectedObjectId: sel } = storeRef.current;
      if (sel === id) {
        setSelectedObjectId(null);
        if (clearSelection) clearSelection();
      }
      addLog(`Removed object ${id}`);
    },
    selectObject(id) {
      const { selectMesh, clearSelection } = stateRef.current;
      if (id && selectMesh) selectMesh(id);
      else if (clearSelection) clearSelection();
    },
    updateObjectTransform(id, pos, rot, scl) {
      const { objectMap } = stateRef.current;
      if (!objectMap) return;
      const entry = objectMap.get(id);
      if (!entry) return;
      if (pos) entry.mesh.position.set(pos.x, pos.y, pos.z);
      if (rot) entry.mesh.rotation.set(rot.x, rot.y, rot.z);
      if (scl) entry.mesh.scale.set(scl.x, scl.y, scl.z);
    },
    updateObjectMaterial(id, color, wireframe) {
      const { objectMap } = stateRef.current;
      if (!objectMap) return;
      const entry = objectMap.get(id);
      if (!entry) return;
      entry.mesh.traverse(child => {
        if (child.isMesh && child.material) {
          if (color) child.material.color = new THREE.Color(color);
          child.material.wireframe = !!wireframe;
          child.material.needsUpdate = true;
        }
      });
    },
    updateObjectLight(id, lightProps) {
      const { objectMap } = stateRef.current;
      if (!objectMap) return;
      const entry = objectMap.get(id);
      if (!entry) return;
      entry.mesh.traverse(child => {
        if (child.isLight) {
          if (lightProps.color !== undefined) child.color.set(lightProps.color);
          if (lightProps.intensity !== undefined) child.intensity = lightProps.intensity;
          if (lightProps.distance !== undefined) child.distance = lightProps.distance;
          if (lightProps.range !== undefined && child.distance !== undefined) child.distance = lightProps.range;
          if (lightProps.angle !== undefined && child.angle !== undefined) child.angle = THREE.MathUtils.degToRad(lightProps.angle);
          if (lightProps.castShadow !== undefined) child.castShadow = lightProps.castShadow;
        }
      });
    },
    updateObjectName(id, name) {
      const { objectMap } = stateRef.current;
      if (!objectMap) return;
      const entry = objectMap.get(id);
      if (entry) {
        entry.name = name;
        entry.mesh.userData.eagleName = name;
      }
    },
    importHeightmap(id, imageData) {
      const { objectMap } = stateRef.current;
      if (!objectMap) return;
      const entry = objectMap.get(id);
      if (entry?.terrainManager) {
        entry.terrainManager.importHeightmap(imageData);
        updateSceneObject(id, { heightData: Array.from(entry.terrainManager.heightData) });
      }
    },
    getSceneJSON() {
      const { objectMap } = stateRef.current;
      if (!objectMap) return { objects: [] };
      const objs = [];
      objectMap.forEach((entry, id) => {
        const { mesh, type, name } = entry;
        const obj = {
          id, type, name,
          position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
          rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
          scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
          material: {},
        };
        mesh.traverse(child => {
          if (child.isMesh && child.material?.color) {
            obj.material.color = '#' + child.material.color.getHexString();
            obj.material.wireframe = !!child.material.wireframe;
          }
        });
        if (entry.terrainManager) {
          obj.heightData = Array.from(entry.terrainManager.heightData);
        }
        // Preserve extra metadata from store
        const storeObj = storeRef.current.sceneObjects.find(o => o.id === id);
        if (storeObj) {
          ['tags', 'lightProps', 'terrainTool', 'brushSize', 'brushStrength',
           'spawnIndex', 'deathMessage', 'aiType', 'patrolRadius', 'detectRadius', 'attackDamage'].forEach(k => {
            if (storeObj[k] !== undefined) obj[k] = storeObj[k];
          });
        }
        objs.push(obj);
      });
      return { objects: objs };
    },
    loadSceneJSON(data) {
      const { scene, objectMap, disposeMesh, createObjectMesh } = stateRef.current;
      if (!objectMap || !createObjectMesh) return;
      objectMap.forEach((entry) => { scene.remove(entry.mesh); disposeMesh(entry.mesh); });
      objectMap.clear();
      const objs = data.objects || [];
      objs.forEach(obj => {
        const entry = createObjectMesh(obj.type, obj.id, obj.name, {
          position: obj.position,
          rotation: obj.rotation,
          scale: obj.scale,
          color: obj.material?.color || '#888888',
        });
        if (obj.heightData && entry.terrainManager) {
          entry.terrainManager.heightData = new Float32Array(obj.heightData);
          const pos = entry.mesh.geometry.attributes.position;
          entry.terrainManager.heightData.forEach((hv, i) => pos.setY(i, hv));
          pos.needsUpdate = true;
          entry.mesh.geometry.computeVertexNormals();
        }
      });
    },
    async saveProject() {
      const { currentProject: proj } = storeRef.current;
      if (!proj) { addLog('No project loaded', 'warn'); return; }
      try {
        const sceneData = ref.current.getSceneJSON();
        await apiSaveProject(proj.id, { name: proj.name, data: sceneData });
        addLog('Project saved ✓', 'info');
      } catch (err) {
        addLog('Save failed: ' + err.message, 'error');
      }
    },
    applySettings(settings) {
      const { renderer, scene } = stateRef.current;
      if (!renderer) return;
      if (settings.shadowQuality !== undefined || settings.shadowsEnabled !== undefined) {
        const quality = settings.shadowQuality ?? storeRef.current.settings.shadowQuality;
        const enabled = settings.shadowsEnabled !== undefined ? settings.shadowsEnabled : storeRef.current.settings.shadowsEnabled;
        if (!enabled || quality === 'off') {
          renderer.shadowMap.enabled = false;
        } else {
          renderer.shadowMap.enabled = true;
          if (quality === 'low') renderer.shadowMap.type = THREE.BasicShadowMap;
          else if (quality === 'medium') renderer.shadowMap.type = THREE.PCFShadowMap;
          else if (quality === 'high') renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        renderer.shadowMap.needsUpdate = true;
      }
      if (settings.renderDistance !== undefined && scene.fog) {
        scene.fog.near = settings.renderDistance * 0.5;
        scene.fog.far = settings.renderDistance;
      }
      if (settings.textureQuality !== undefined) {
        const base = Math.min(window.devicePixelRatio, 2);
        if (settings.textureQuality === 'low') renderer.setPixelRatio(Math.min(base, 0.75));
        else if (settings.textureQuality === 'medium') renderer.setPixelRatio(Math.min(base, 1));
        else renderer.setPixelRatio(base);
      }
    },
    applyGlobalLighting(lighting) {
      const { ambient, sunLight } = stateRef.current;
      if (!ambient || !sunLight) return;
      if (lighting.ambientColor) ambient.color.set(lighting.ambientColor);
      if (lighting.ambientIntensity !== undefined) ambient.intensity = lighting.ambientIntensity;
      if (lighting.sunColor) sunLight.color.set(lighting.sunColor);
      if (lighting.sunIntensity !== undefined) sunLight.intensity = lighting.sunIntensity;
      if (lighting.sunX !== undefined) sunLight.position.x = lighting.sunX;
      if (lighting.sunY !== undefined) sunLight.position.y = lighting.sunY;
      if (lighting.sunZ !== undefined) sunLight.position.z = lighting.sunZ;
    },
  }));

  return (
    <div className="viewport" style={{ position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div className="viewport-overlay">
        <div className="viewport-hint">RMB: Orbit · MMB: Pan · Scroll: Zoom</div>
        <div className="viewport-hint">Click: Select · Drag axis handle: Transform</div>
      </div>
    </div>
  );
});

Viewport.displayName = 'Viewport';
export default Viewport;
