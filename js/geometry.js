/**
 * Procedural 3D Geometry Generators & WebGL2 Instanced Mesh Buffers
 * Works directly via file:// or http:// without bundler/CORS restrictions.
 */
(function (global) {
  const SimuMaratona = (global.SimuMaratona = global.SimuMaratona || {});

  function createBalloonGeometry(radialSegments = 28, heightSegments = 24) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    function profile(t) {
      let y, r;
      if (t < 0.07) {
        const k = t / 0.07;
        y = -0.58 + k * 0.055;
        r = 0.055 * (1.0 - 0.55 * k) + 0.015;
      } else if (t < 0.12) {
        const k = (t - 0.07) / 0.05;
        y = -0.525 + k * 0.035;
        r = 0.032 + k * 0.025;
      } else {
        const u = (t - 0.12) / 0.88;
        const theta = u * Math.PI;
        y = -0.49 + (1.0 - Math.cos(theta)) * 0.52;
        const shape = Math.sin(theta);
        const plumpness = 0.78 + 0.28 * Math.sin(u * Math.PI * 0.85);
        const neckTaper = Math.pow(u, 0.32);
        r = 0.44 * shape * plumpness * neckTaper;
        if (u < 0.05) {
          r = Math.max(r, 0.057 * (1.0 - u / 0.05) + r * (u / 0.05));
        }
      }
      return { r, y };
    }

    const eps = 0.002;
    for (let iy = 0; iy <= heightSegments; iy++) {
      const v = iy / heightSegments;
      const p = profile(v);
      const pPrev = profile(Math.max(0, v - eps));
      const pNext = profile(Math.min(1, v + eps));
      const dr = pNext.r - pPrev.r;
      const dy = pNext.y - pPrev.y;
      const nLen = Math.hypot(dy, dr) || 1;
      const nr = dy / nLen;
      const ny = -dr / nLen;

      for (let ix = 0; ix <= radialSegments; ix++) {
        const u = ix / radialSegments;
        const phi = u * Math.PI * 2;
        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);

        const x = p.r * cosPhi;
        const z = p.r * sinPhi;
        positions.push(x, p.y, z);

        if (iy === heightSegments) {
          normals.push(0, 1, 0);
        } else {
          normals.push(nr * cosPhi, ny, nr * sinPhi);
        }
        uvs.push(u, v);
      }
    }

    const stride = radialSegments + 1;
    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < radialSegments; ix++) {
        const a = iy * stride + ix;
        const b = a + 1;
        const c = (iy + 1) * stride + ix;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
    };
  }

  function createSphereGeometry(radius = 0.5, latBands = 16, lonBands = 22) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let lat = 0; lat <= latBands; lat++) {
      const v = lat / latBands;
      const theta = v * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= lonBands; lon++) {
        const u = lon / lonBands;
        const phi = u * Math.PI * 2;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const nx = cosPhi * sinTheta;
        const ny = cosTheta;
        const nz = sinPhi * sinTheta;

        positions.push(radius * nx, radius * ny, radius * nz);
        normals.push(nx, ny, nz);
        uvs.push(u, 1 - v);
      }
    }

    const stride = lonBands + 1;
    for (let lat = 0; lat < latBands; lat++) {
      for (let lon = 0; lon < lonBands; lon++) {
        const first = lat * stride + lon;
        const second = first + stride;
        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
    };
  }

  function createRoundedBoxGeometry(bevel = 0.1) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const inner = 0.5 - bevel;
    const grid = 6;
    const faces = [
      { dir: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
      { dir: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
      { dir: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
      { dir: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      { dir: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
      { dir: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    ];

    for (let f = 0; f < faces.length; f++) {
      const face = faces[f];
      const baseVertex = positions.length / 3;

      for (let iy = 0; iy <= grid; iy++) {
        const ty = iy / grid;
        const py = ty - 0.5;
        for (let ix = 0; ix <= grid; ix++) {
          const tx = ix / grid;
          const px = tx - 0.5;

          const cx = face.dir[0] * 0.5 + face.u[0] * px + face.v[0] * py;
          const cy = face.dir[1] * 0.5 + face.u[1] * px + face.v[1] * py;
          const cz = face.dir[2] * 0.5 + face.u[2] * px + face.v[2] * py;

          const bx = Math.max(-inner, Math.min(inner, cx));
          const by = Math.max(-inner, Math.min(inner, cy));
          const bz = Math.max(-inner, Math.min(inner, cz));

          let dx = cx - bx;
          let dy = cy - by;
          let dz = cz - bz;
          const len = Math.hypot(dx, dy, dz);
          if (len > 1e-5) {
            dx /= len;
            dy /= len;
            dz /= len;
          } else {
            dx = face.dir[0];
            dy = face.dir[1];
            dz = face.dir[2];
          }

          positions.push(bx + dx * bevel, by + dy * bevel, bz + dz * bevel);
          normals.push(dx, dy, dz);
          uvs.push(tx, ty);
        }
      }

      const stride = grid + 1;
      for (let iy = 0; iy < grid; iy++) {
        for (let ix = 0; ix < grid; ix++) {
          const a = baseVertex + iy * stride + ix;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
    };
  }

  function createCylinderGeometry(rTop = 0.5, rBottom = 0.5, radialSegments = 20, capped = true) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const slope = rBottom - rTop;
    const nLen = Math.hypot(1.0, slope);
    const nr = 1.0 / nLen;
    const ny = slope / nLen;

    for (let iy = 0; iy <= 1; iy++) {
      const v = iy;
      const y = v - 0.5;
      const r = iy === 0 ? rBottom : rTop;
      for (let ix = 0; ix <= radialSegments; ix++) {
        const u = ix / radialSegments;
        const phi = u * Math.PI * 2;
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        positions.push(r * c, y, r * s);
        normals.push(nr * c, ny, nr * s);
        uvs.push(u, v);
      }
    }

    const stride = radialSegments + 1;
    for (let ix = 0; ix < radialSegments; ix++) {
      const a = ix;
      const b = ix + 1;
      const c = stride + ix;
      const d = stride + ix + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    if (capped) {
      if (rTop > 1e-4) {
        const centerIdx = positions.length / 3;
        positions.push(0, 0.5, 0);
        normals.push(0, 1, 0);
        uvs.push(0.5, 0.5);
        for (let ix = 0; ix <= radialSegments; ix++) {
          const phi = (ix / radialSegments) * Math.PI * 2;
          const c = Math.cos(phi);
          const s = Math.sin(phi);
          positions.push(rTop * c, 0.5, rTop * s);
          normals.push(0, 1, 0);
          uvs.push(0.5 + 0.5 * c, 0.5 + 0.5 * s);
        }
        for (let ix = 0; ix < radialSegments; ix++) {
          indices.push(centerIdx, centerIdx + 1 + ix + 1, centerIdx + 1 + ix);
        }
      }
      if (rBottom > 1e-4) {
        const centerIdx = positions.length / 3;
        positions.push(0, -0.5, 0);
        normals.push(0, -1, 0);
        uvs.push(0.5, 0.5);
        for (let ix = 0; ix <= radialSegments; ix++) {
          const phi = (ix / radialSegments) * Math.PI * 2;
          const c = Math.cos(phi);
          const s = Math.sin(phi);
          positions.push(rBottom * c, -0.5, rBottom * s);
          normals.push(0, -1, 0);
          uvs.push(0.5 + 0.5 * c, 0.5 + 0.5 * s);
        }
        for (let ix = 0; ix < radialSegments; ix++) {
          indices.push(centerIdx, centerIdx + 1 + ix, centerIdx + 1 + ix + 1);
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
    };
  }

  function createQuadGeometry() {
    return {
      positions: new Float32Array([
        -0.5, -0.5, 0,
         0.5, -0.5, 0,
         0.5,  0.5, 0,
        -0.5,  0.5, 0,
      ]),
      normals: new Float32Array([
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
      ]),
      uvs: new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1,
      ]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    };
  }

  class InstancedMeshBatch {
    constructor(gl, geometry, maxInstances = 2048) {
      this.gl = gl;
      this.maxInstances = maxInstances;
      this.instanceCount = 0;
      this.floatsPerInstance = 24;
      this.instanceData = new Float32Array(maxInstances * this.floatsPerInstance);

      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);

      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

      const normBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

      const uvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.uvs, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

      const idxBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
      this.indexCount = geometry.indices.length;

      this.instanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

      const strideBytes = this.floatsPerInstance * 4;
      for (let col = 0; col < 4; col++) {
        const loc = 3 + col;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, strideBytes, col * 16);
        gl.vertexAttribDivisor(loc, 1);
      }

      gl.enableVertexAttribArray(7);
      gl.vertexAttribPointer(7, 4, gl.FLOAT, false, strideBytes, 64);
      gl.vertexAttribDivisor(7, 1);

      gl.enableVertexAttribArray(8);
      gl.vertexAttribPointer(8, 4, gl.FLOAT, false, strideBytes, 80);
      gl.vertexAttribDivisor(8, 1);

      gl.bindVertexArray(null);
    }

    reset() {
      this.instanceCount = 0;
    }

    addInstance(modelMat, r, g, b, matType = 0.5, er = 0, eg = 0, eb = 0, extra = 0) {
      if (this.instanceCount >= this.maxInstances) return;
      const offset = this.instanceCount * this.floatsPerInstance;
      const data = this.instanceData;
      data.set(modelMat, offset);
      data[offset + 16] = r;
      data[offset + 17] = g;
      data[offset + 18] = b;
      data[offset + 19] = matType;
      data[offset + 20] = er;
      data[offset + 21] = eg;
      data[offset + 22] = eb;
      data[offset + 23] = extra;
      this.instanceCount++;
    }

    upload() {
      if (this.instanceCount === 0) return;
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        this.instanceData.subarray(0, this.instanceCount * this.floatsPerInstance)
      );
    }

    draw() {
      if (this.instanceCount === 0) return;
      const gl = this.gl;
      gl.bindVertexArray(this.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, this.instanceCount);
      gl.bindVertexArray(null);
    }
  }

  Object.assign(SimuMaratona, {
    createBalloonGeometry,
    createSphereGeometry,
    createRoundedBoxGeometry,
    createCylinderGeometry,
    createQuadGeometry,
    InstancedMeshBatch,
  });
})(window);
