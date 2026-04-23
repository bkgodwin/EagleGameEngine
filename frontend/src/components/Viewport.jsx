import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { useStore } from '../store/index.js';
import { saveProject as apiSaveProject } from '../api/index.js';

const Viewport = forwardRef((props, ref) => {
  const canvasRef = useRef(null);
  const stateRef = useRef({});
  const {
    addSceneObject, removeSceneObject, updateSceneObject,
    setSelectedObjectId, selectedObjectId, sceneObjects,
    editorMode, addLog, currentProject, settings,
  } = useStore();

  // Keep a ref to the latest store values accessible inside closures
  const storeRef = useRef({});
  storeRef.current = { selectedObjectId, editorMode, sceneObjects, settings, currentProject };

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
    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    scene.add(ambient);

    // ---- Grid ----
    const grid = new THREE.GridHelper(200, 200, 0x444444, 0x222222);
    scene.add(grid);

    // ---- Object maps ----
    const objectMap = new Map(); // id -> { mesh, data }
    const gizmoGroup = new THREE.Group();
    scene.add(gizmoGroup);

    // ---- Selection box ----
    let selectionBox = null;

    // ---- Orbit camera state ----
    const spherical = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 15 };
    const target = new THREE.Vector3(0, 0, 0);
    let isOrbiting = false;
    let isPanning = false;
    let lastMouse = { x: 0, y: 0 };

    function updateCamera() {
      camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = target.y + spherical.radius * Math.cos(spherical.phi);
      camera.position.z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(target);
    }
    updateCamera();

    // ---- Pointer events ----
    const onMouseDown = (e) => {
      if (e.button === 2) { isOrbiting = true; e.preventDefault(); }
      if (e.button === 1) { isPanning = true; e.preventDefault(); }
      lastMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e) => {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      lastMouse = { x: e.clientX, y: e.clientY };

      if (isOrbiting) {
        spherical.theta -= dx * 0.005;
        spherical.phi -= dy * 0.005;
        spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi));
        updateCamera();
      }
      if (isPanning) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        camera.getWorldDirection(new THREE.Vector3()); // ensure matrix is fresh
        right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
        up.copy(camera.up);
        const panScale = spherical.radius * 0.001;
        target.addScaledVector(right, -dx * panScale);
        target.addScaledVector(up, dy * panScale);
        updateCamera();
      }
    };
    const onMouseUp = (e) => {
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
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const meshes = [];
      scene.traverse(obj => {
        if (obj.isMesh && obj.userData.eagleId && obj !== selectionBox) meshes.push(obj);
      });
      const hits = raycaster.intersectObjects(meshes, true);
      if (hits.length > 0) {
        // Walk up to find the root object with eagleId
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
    function buildTranslateGizmo() {
      gizmoGroup.clear();
      const selected = storeRef.current.selectedObjectId;
      if (!selected || storeRef.current.editorMode !== 'translate') return;
      const entry = objectMap.get(selected);
      if (!entry) return;
      const pos = entry.mesh.position.clone();
      const arrowLen = 1.2;
      const dirs = [
        { dir: new THREE.Vector3(1, 0, 0), color: 0xff3333 },
        { dir: new THREE.Vector3(0, 1, 0), color: 0x33ff33 },
        { dir: new THREE.Vector3(0, 0, 1), color: 0x3333ff },
      ];
      dirs.forEach(({ dir, color }) => {
        const points = [pos.clone(), pos.clone().addScaledVector(dir, arrowLen)];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
        line.userData.isGizmo = true;
        gizmoGroup.add(line);
        const coneGeo = new THREE.ConeGeometry(0.06, 0.25, 8);
        const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color }));
        cone.position.copy(pos).addScaledVector(dir, arrowLen + 0.1);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        cone.userData.isGizmo = true;
        gizmoGroup.add(cone);
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
      buildTranslateGizmo();
    }

    // ---- Object creation ----
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
          const terrainMat = new THREE.MeshStandardMaterial({ color: 0x3d5a2a, wireframe: false, side: THREE.DoubleSide });
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
      // Terrain manager
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

    function disposeMesh(mesh) {
      mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }

    // ---- Load scene from store state on mount ----
    const initialObjs = storeRef.current.sceneObjects;
    initialObjs.forEach(obj => {
      if (!objectMap.has(obj.id)) {
        createObjectMesh(obj.type, obj.id, obj.name, {
          position: obj.position,
          rotation: obj.rotation,
          scale: obj.scale,
          color: obj.material?.color || obj.color || '#888888',
        });
      }
    });

    // ---- Animation loop ----
    let animId;
    let lastSelectedId = null;
    let lastEditorMode = null;
    function animate() {
      animId = requestAnimationFrame(animate);
      const { selectedObjectId: sel, editorMode: mode } = storeRef.current;
      // Refresh selection box if selected or mode changed
      if (sel !== lastSelectedId || mode !== lastEditorMode) {
        lastSelectedId = sel;
        lastEditorMode = mode;
        if (sel) selectMesh(sel);
        else clearSelection();
      }
      // Update selection box position (in case mesh moved)
      if (selectionBox && sel) {
        const entry = objectMap.get(sel);
        if (entry) {
          const box3 = new THREE.Box3().setFromObject(entry.mesh);
          if (selectionBox.box) selectionBox.box.copy(box3);
        }
      }
      renderer.render(scene, camera);
    }
    animate();

    // Store state in ref for imperative methods
    stateRef.current = { scene, camera, renderer, objectMap, gizmoGroup, createObjectMesh, disposeMesh, selectMesh, clearSelection };

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('click', onClick);
      // Dispose all
      objectMap.forEach(entry => { scene.remove(entry.mesh); disposeMesh(entry.mesh); });
      objectMap.clear();
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
      if (entry?.terrainManager) entry.terrainManager.importHeightmap(imageData);
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
        objs.push(obj);
      });
      return { objects: objs };
    },
    loadSceneJSON(data) {
      const { scene, objectMap, disposeMesh, createObjectMesh } = stateRef.current;
      if (!objectMap || !createObjectMesh) return;
      // Clear existing
      objectMap.forEach((entry) => { scene.remove(entry.mesh); disposeMesh(entry.mesh); });
      objectMap.clear();
      const objs = data.objects || [];
      objs.forEach(obj => {
        createObjectMesh(obj.type, obj.id, obj.name, {
          position: obj.position,
          rotation: obj.rotation,
          scale: obj.scale,
          color: obj.material?.color || '#888888',
        });
        if (obj.heightData) {
          const entry = objectMap.get(obj.id);
          if (entry?.terrainManager) {
            entry.terrainManager.heightData = new Float32Array(obj.heightData);
            const pos = entry.mesh.geometry.attributes.position;
            entry.terrainManager.heightData.forEach((h, i) => pos.setY(i, h));
            pos.needsUpdate = true;
            entry.mesh.geometry.computeVertexNormals();
          }
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
      // Shadow quality
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
      // Render distance / fog
      if (settings.renderDistance !== undefined && scene.fog) {
        scene.fog.near = settings.renderDistance * 0.5;
        scene.fog.far = settings.renderDistance;
      }
      // Pixel ratio based on texture quality
      if (settings.textureQuality !== undefined) {
        const base = Math.min(window.devicePixelRatio, 2);
        if (settings.textureQuality === 'low') renderer.setPixelRatio(Math.min(base, 0.75));
        else if (settings.textureQuality === 'medium') renderer.setPixelRatio(Math.min(base, 1));
        else renderer.setPixelRatio(base);
      }
    },
  }));

  return (
    <div className="viewport" style={{ position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div className="viewport-overlay">
        <div className="viewport-hint">RMB: Orbit · MMB: Pan · Scroll: Zoom</div>
        <div className="viewport-hint">Click: Select · Double-click hierarchy: Rename</div>
      </div>
    </div>
  );
});

Viewport.displayName = 'Viewport';
export default Viewport;
