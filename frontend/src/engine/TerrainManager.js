import * as THREE from 'three';

/**
 * TerrainManager – heightmap-based terrain mesh with sculpting tools.
 * Integrates directly with a Three.js Scene.
 */
export class TerrainManager {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.width = 100;
    this.depth = 100;
    this.segments = 64; // 64x64 grid = 65x65 vertices
    this.heightData = null; // Float32Array of length (segments+1)*(segments+1)
    this.maxHeight = 20;
  }

  // ── Creation ──────────────────────────────────────────────────────────────

  createTerrain(options = {}) {
    this.width = options.width ?? this.width;
    this.depth = options.depth ?? this.depth;
    this.segments = options.segments ?? this.segments;
    this.maxHeight = options.maxHeight ?? this.maxHeight;

    const verts = this.segments + 1;
    this.heightData = new Float32Array(verts * verts).fill(0);

    this.geometry = new THREE.PlaneGeometry(
      this.width,
      this.depth,
      this.segments,
      this.segments
    );
    this.geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.MeshLambertMaterial({
      color: 0x4a7c59,
      wireframe: false,
      side: THREE.DoubleSide,
    });

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.userData = { type: 'terrain', id: options.id ?? 'terrain' };
    this.scene.add(this.mesh);

    return this.mesh;
  }

  removeTerrain() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
      this.geometry = null;
      this.heightData = null;
    }
  }

  // ── Sculpting ─────────────────────────────────────────────────────────────

  /**
   * Apply a sculpt operation at a world-space position.
   * @param {THREE.Vector3} worldPos  Hit point on terrain surface
   * @param {'raise'|'lower'|'smooth'|'flatten'} tool
   * @param {number} brushSize  Radius in world units
   * @param {number} strength   0..1
   */
  sculpt(worldPos, tool, brushSize = 8, strength = 0.5) {
    if (!this.geometry || !this.heightData) return;

    const posAttr = this.geometry.attributes.position;
    const verts = this.segments + 1;
    const halfW = this.width / 2;
    const halfD = this.depth / 2;
    const cellW = this.width / this.segments;
    const cellD = this.depth / this.segments;

    // Determine affected vertex range
    const minCol = Math.max(0, Math.floor((worldPos.x - brushSize + halfW) / cellW));
    const maxCol = Math.min(this.segments, Math.ceil((worldPos.x + brushSize + halfW) / cellW));
    const minRow = Math.max(0, Math.floor((worldPos.z - brushSize + halfD) / cellD));
    const maxRow = Math.min(this.segments, Math.ceil((worldPos.z + brushSize + halfD) / cellD));

    if (tool === 'smooth') {
      this._smooth(minCol, maxCol, minRow, maxRow, brushSize, worldPos, strength);
    } else {
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const idx = row * verts + col;
          const vx = col * cellW - halfW;
          const vz = row * cellD - halfD;
          const dist = Math.sqrt((vx - worldPos.x) ** 2 + (vz - worldPos.z) ** 2);
          if (dist > brushSize) continue;

          // Cosine falloff
          const falloff = Math.cos((dist / brushSize) * (Math.PI / 2));
          const delta = strength * falloff * 0.3;

          if (tool === 'raise') {
            this.heightData[idx] = Math.min(this.maxHeight, this.heightData[idx] + delta);
          } else if (tool === 'lower') {
            this.heightData[idx] = Math.max(0, this.heightData[idx] - delta);
          } else if (tool === 'flatten') {
            const target = this._averageHeightAt(worldPos);
            this.heightData[idx] += (target - this.heightData[idx]) * falloff * strength * 0.1;
          }
        }
      }
    }

    this._applyHeightData();
    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  _smooth(minCol, maxCol, minRow, maxRow, brushSize, worldPos, strength) {
    const verts = this.segments + 1;
    const halfW = this.width / 2;
    const halfD = this.depth / 2;
    const cellW = this.width / this.segments;
    const cellD = this.depth / this.segments;
    const copy = this.heightData.slice();

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const vx = col * cellW - halfW;
        const vz = row * cellD - halfD;
        const dist = Math.sqrt((vx - worldPos.x) ** 2 + (vz - worldPos.z) ** 2);
        if (dist > brushSize) continue;

        // Average of neighbours
        let sum = 0, count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr <= this.segments && nc >= 0 && nc <= this.segments) {
              sum += copy[nr * verts + nc];
              count++;
            }
          }
        }
        const avg = sum / count;
        const falloff = Math.cos((dist / brushSize) * (Math.PI / 2));
        const idx = row * verts + col;
        this.heightData[idx] += (avg - this.heightData[idx]) * falloff * strength * 0.3;
      }
    }
  }

  _averageHeightAt(worldPos) {
    const verts = this.segments + 1;
    const halfW = this.width / 2;
    const halfD = this.depth / 2;
    const cellW = this.width / this.segments;
    const cellD = this.depth / this.segments;
    const col = Math.round((worldPos.x + halfW) / cellW);
    const row = Math.round((worldPos.z + halfD) / cellD);
    const c = Math.max(0, Math.min(this.segments, col));
    const r = Math.max(0, Math.min(this.segments, row));
    return this.heightData[r * verts + c];
  }

  // ── Heightmap Import / Export ─────────────────────────────────────────────

  /**
   * Import a grayscale heightmap from an HTMLImageElement or ImageData.
   */
  importHeightmap(imageOrData) {
    if (!this.heightData) this.createTerrain();

    const verts = this.segments + 1;
    const canvas = document.createElement('canvas');
    canvas.width = verts;
    canvas.height = verts;
    const ctx = canvas.getContext('2d');

    if (imageOrData instanceof HTMLImageElement) {
      ctx.drawImage(imageOrData, 0, 0, verts, verts);
    } else if (imageOrData instanceof ImageData) {
      const tmp = document.createElement('canvas');
      tmp.width = imageOrData.width;
      tmp.height = imageOrData.height;
      tmp.getContext('2d').putImageData(imageOrData, 0, 0);
      ctx.drawImage(tmp, 0, 0, verts, verts);
    }

    const pixels = ctx.getImageData(0, 0, verts, verts).data;
    for (let i = 0; i < verts * verts; i++) {
      const r = pixels[i * 4]; // red channel (greyscale)
      this.heightData[i] = (r / 255) * this.maxHeight;
    }

    this._applyHeightData();
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /** Load height data from a plain JS number array (from project JSON). */
  importHeightArray(arr) {
    if (!this.heightData) this.createTerrain();
    for (let i = 0; i < arr.length && i < this.heightData.length; i++) {
      this.heightData[i] = arr[i];
    }
    this._applyHeightData();
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /** Export height data as a plain Array for JSON serialisation. */
  exportHeightArray() {
    return this.heightData ? Array.from(this.heightData) : [];
  }

  /**
   * Export as a greyscale PNG data-URL (for download).
   */
  exportHeightmapDataURL() {
    const verts = this.segments + 1;
    const canvas = document.createElement('canvas');
    canvas.width = verts;
    canvas.height = verts;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(verts, verts);

    for (let i = 0; i < verts * verts; i++) {
      const v = Math.round(((this.heightData[i] ?? 0) / this.maxHeight) * 255);
      imgData.data[i * 4] = v;
      imgData.data[i * 4 + 1] = v;
      imgData.data[i * 4 + 2] = v;
      imgData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /** Bilinearly interpolated height at world (x, z). */
  getHeightAt(x, z) {
    if (!this.heightData) return 0;
    const verts = this.segments + 1;
    const halfW = this.width / 2;
    const halfD = this.depth / 2;
    const fx = ((x + halfW) / this.width) * this.segments;
    const fz = ((z + halfD) / this.depth) * this.segments;
    const col0 = Math.max(0, Math.min(this.segments, Math.floor(fx)));
    const col1 = Math.min(this.segments, col0 + 1);
    const row0 = Math.max(0, Math.min(this.segments, Math.floor(fz)));
    const row1 = Math.min(this.segments, row0 + 1);
    const tx = fx - col0;
    const tz = fz - row0;
    const h00 = this.heightData[row0 * verts + col0];
    const h10 = this.heightData[row0 * verts + col1];
    const h01 = this.heightData[row1 * verts + col0];
    const h11 = this.heightData[row1 * verts + col1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  setWireframe(v) {
    if (this.material) this.material.wireframe = v;
  }

  setColor(hex) {
    if (this.material) this.material.color.set(hex);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _applyHeightData() {
    const posAttr = this.geometry.attributes.position;
    const verts = this.segments + 1;
    // After PlaneGeometry.rotateX(-PI/2): Y is the height axis
    for (let row = 0; row <= this.segments; row++) {
      for (let col = 0; col <= this.segments; col++) {
        const i = row * verts + col;
        posAttr.setY(i, this.heightData[i]);
      }
    }
  }

  /** Serialise for project JSON. */
  toJSON() {
    return {
      width: this.width,
      depth: this.depth,
      segments: this.segments,
      maxHeight: this.maxHeight,
      heightData: this.exportHeightArray(),
      color: this.material ? '#' + this.material.color.getHexString() : '#4a7c59',
    };
  }

  /** Restore from project JSON. */
  fromJSON(data) {
    this.createTerrain({
      width: data.width,
      depth: data.depth,
      segments: data.segments,
      maxHeight: data.maxHeight,
    });
    if (data.color) this.setColor(data.color);
    if (data.heightData && data.heightData.length > 0) {
      this.importHeightArray(data.heightData);
    }
  }
}
