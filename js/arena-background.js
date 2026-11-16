/**
 * ContestArenaBackground — WebGL2 3D Programming Contest Arena Animation
 * Works directly via file:// (double-click on index.html) or http:// without bundler/CORS restrictions.
 */
(function (global) {
  const SimuMaratona = (global.SimuMaratona = global.SimuMaratona || {});

  const {
    createMat4,
    multiply,
    perspective,
    ortho,
    lookAt,
    MatrixStack,
    clamp,
    lerp,
    createBalloonGeometry,
    createSphereGeometry,
    createRoundedBoxGeometry,
    createCylinderGeometry,
    createQuadGeometry,
    InstancedMeshBatch,
    SHADOW_VS,
    SHADOW_FS,
    SCENE_VS,
    SCENE_FS,
    STRING_VS,
    STRING_FS,
    PARTICLE_VS,
    PARTICLE_FS,
    VOLUMETRIC_VS,
    VOLUMETRIC_FS,
    POST_VS,
    BLOOM_EXTRACT_FS,
    BLOOM_BLUR_FS,
    COMPOSITE_FS,
    createProgram,
  } = SimuMaratona;

  const PROBLEM_BALLOON_COLORS = [
    [0.98, 0.08, 0.22], // A: Crimson Red
    [0.06, 0.42, 1.00], // B: Cobalt Blue
    [1.00, 0.68, 0.02], // C: Golden Amber
    [0.02, 0.84, 0.44], // D: Emerald Green
    [0.58, 0.18, 0.96], // E: Royal Violet
    [1.00, 0.34, 0.04], // F: Sunset Orange
    [0.00, 0.84, 0.88], // G: Cyber Cyan
    [0.95, 0.14, 0.64], // H: Hot Magenta
    [0.48, 0.92, 0.08], // I: Electric Lime
    [0.92, 0.95, 1.00], // J: Pearl White
  ];

  const TEAM_HOODIE_COLORS = [
    [0.14, 0.28, 0.62], // Navy Blue
    [0.68, 0.12, 0.22], // Crimson
    [0.08, 0.46, 0.42], // Teal
    [0.38, 0.18, 0.62], // Deep Purple
    [0.78, 0.42, 0.08], // Amber Gold
    [0.16, 0.20, 0.30], // Charcoal Slate
    [0.12, 0.52, 0.28], // Forest Green
    [0.58, 0.16, 0.46], // Plum
  ];

  const SKIN_TONES = [
    [0.95, 0.78, 0.66],
    [0.86, 0.66, 0.52],
    [0.72, 0.50, 0.36],
    [0.50, 0.34, 0.24],
    [0.90, 0.73, 0.60],
  ];

  const HAIR_COLORS = [
    [0.09, 0.08, 0.11],
    [0.24, 0.14, 0.09],
    [0.44, 0.24, 0.11],
    [0.70, 0.48, 0.20],
    [0.14, 0.17, 0.24],
  ];

  const THEMES = {
    cyber: {
      name: 'Contest Night',
      fogColor: [0.022, 0.036, 0.082],
      floorColor: [0.038, 0.056, 0.108],
      accentColor: [0.12, 0.68, 1.0],
      lightDir: [0.28, 0.88, 0.36],
      bloomStrength: 0.55,
    },
    finals: {
      name: 'World Finals Gold',
      fogColor: [0.042, 0.032, 0.075],
      floorColor: [0.058, 0.048, 0.098],
      accentColor: [1.0, 0.68, 0.18],
      lightDir: [0.32, 0.86, 0.38],
      bloomStrength: 0.60,
    },
    emerald: {
      name: 'Accepted Matrix',
      fogColor: [0.018, 0.048, 0.058],
      floorColor: [0.030, 0.065, 0.082],
      accentColor: [0.08, 0.92, 0.62],
      lightDir: [0.25, 0.89, 0.35],
      bloomStrength: 0.58,
    },
  };

  class ContestArenaBackground {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        depth: true,
        powerPreference: 'high-performance',
      });
      if (!gl) {
        throw new Error('WebGL2 is required to run ContestArenaBackground.');
      }
      this.gl = gl;

      this.themeKey = options.theme || 'cyber';
      this.theme = { ...THEMES[this.themeKey] };
      this.cameraMode = options.cameraMode || 'cinematic';

      this.time = 0;
      this.running = true;
      this.mouseX = 0;
      this.mouseY = 0;
      this.smoothMouseX = 0;
      this.smoothMouseY = 0;
      this.scrollOffset = 0;

      this.stack = new MatrixStack(32);
      this.viewMat = createMat4();
      this.projMat = createMat4();
      this.viewProjMat = createMat4();
      this.lightViewMat = createMat4();
      this.lightProjMat = createMat4();
      this.lightViewProjMat = createMat4();

      this.cameraPos = new Float32Array([0, 4.35, 10.9]);
      this.cameraTarget = new Float32Array([0, 1.45, 0.4]);
      this.cameraRight = new Float32Array([1, 0, 0]);
      this.cameraUp = new Float32Array([0, 1, 0]);

      this._initShaders();
      this._initMeshes();
      this._initShadowMap();
      this._initPostProcessBuffers();
      this._initArenaSimulation();
      this._bindEvents();
      this.resize();
    }

    _initShaders() {
      const gl = this.gl;
      this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS);
      this.sceneProg = createProgram(gl, SCENE_VS, SCENE_FS);
      this.stringProg = createProgram(gl, STRING_VS, STRING_FS);
      this.particleProg = createProgram(gl, PARTICLE_VS, PARTICLE_FS);
      this.volumetricProg = createProgram(gl, VOLUMETRIC_VS, VOLUMETRIC_FS);
      this.bloomExtractProg = createProgram(gl, POST_VS, BLOOM_EXTRACT_FS);
      this.bloomBlurProg = createProgram(gl, POST_VS, BLOOM_BLUR_FS);
      this.compositeProg = createProgram(gl, POST_VS, COMPOSITE_FS);

      this.uniforms = {
        shadow: {
          lightViewProj: gl.getUniformLocation(this.shadowProg, 'u_lightViewProj'),
        },
        scene: {
          viewProj: gl.getUniformLocation(this.sceneProg, 'u_viewProj'),
          lightViewProj: gl.getUniformLocation(this.sceneProg, 'u_lightViewProj'),
          cameraPos: gl.getUniformLocation(this.sceneProg, 'u_cameraPos'),
          lightDir: gl.getUniformLocation(this.sceneProg, 'u_lightDir'),
          time: gl.getUniformLocation(this.sceneProg, 'u_time'),
          shadowMap: gl.getUniformLocation(this.sceneProg, 'u_shadowMap'),
          fogColor: gl.getUniformLocation(this.sceneProg, 'u_fogColor'),
          accentColor: gl.getUniformLocation(this.sceneProg, 'u_accentColor'),
          pointLights: gl.getUniformLocation(this.sceneProg, 'u_pointLights'),
          pointColors: gl.getUniformLocation(this.sceneProg, 'u_pointColors'),
        },
        string: {
          viewProj: gl.getUniformLocation(this.stringProg, 'u_viewProj'),
        },
        particle: {
          viewProj: gl.getUniformLocation(this.particleProg, 'u_viewProj'),
          cameraRight: gl.getUniformLocation(this.particleProg, 'u_cameraRight'),
          cameraUp: gl.getUniformLocation(this.particleProg, 'u_cameraUp'),
        },
        volumetric: {
          viewProj: gl.getUniformLocation(this.volumetricProg, 'u_viewProj'),
          cameraPos: gl.getUniformLocation(this.volumetricProg, 'u_cameraPos'),
        },
        bloomExtract: {
          sceneTex: gl.getUniformLocation(this.bloomExtractProg, 'u_sceneTex'),
        },
        bloomBlur: {
          tex: gl.getUniformLocation(this.bloomBlurProg, 'u_tex'),
          direction: gl.getUniformLocation(this.bloomBlurProg, 'u_direction'),
        },
        composite: {
          sceneTex: gl.getUniformLocation(this.compositeProg, 'u_sceneTex'),
          bloomTex: gl.getUniformLocation(this.compositeProg, 'u_bloomTex'),
          bloomStrength: gl.getUniformLocation(this.compositeProg, 'u_bloomStrength'),
          vignette: gl.getUniformLocation(this.compositeProg, 'u_vignette'),
        },
      };
    }

    _initMeshes() {
      const gl = this.gl;
      this.boxBatch = new InstancedMeshBatch(gl, createRoundedBoxGeometry(0.11, 3), 2400);
      this.sphereBatch = new InstancedMeshBatch(gl, createSphereGeometry(0.5, 16, 22), 1024);
      this.cylBatch = new InstancedMeshBatch(gl, createCylinderGeometry(0.5, 0.5, 18, true), 1024);
      this.balloonBatch = new InstancedMeshBatch(gl, createBalloonGeometry(28, 22), 256);
      this.quadBatch = new InstancedMeshBatch(gl, createQuadGeometry(), 256);
      this.coneBatch = new InstancedMeshBatch(gl, createCylinderGeometry(0.22, 1.55, 24, false), 32);

      this.maxStringVertices = 256 * 16;
      this.stringData = new Float32Array(this.maxStringVertices * 7);
      this.stringVertexCount = 0;
      this.stringVao = gl.createVertexArray();
      gl.bindVertexArray(this.stringVao);
      this.stringBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.stringBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.stringData.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
      gl.bindVertexArray(null);

      const quadGeo = createQuadGeometry();
      this.maxParticles = 900;
      this.particleInstanceData = new Float32Array(this.maxParticles * 10);
      this.activeParticleCount = 0;

      this.particleVao = gl.createVertexArray();
      gl.bindVertexArray(this.particleVao);

      const pQuadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pQuadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, quadGeo.positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

      const pIdxBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pIdxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadGeo.indices, gl.STATIC_DRAW);

      this.particleInstBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInstBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.particleInstanceData.byteLength, gl.DYNAMIC_DRAW);

      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 0);
      gl.vertexAttribDivisor(1, 1);

      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 12);
      gl.vertexAttribDivisor(2, 1);

      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 40, 28);
      gl.vertexAttribDivisor(3, 1);

      gl.bindVertexArray(null);

      this.postVao = gl.createVertexArray();
      gl.bindVertexArray(this.postVao);
      const postPosBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, postPosBuf);
      gl.bufferData(gl.ARRAY_BUFFER, quadGeo.positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

      const postUvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, postUvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, quadGeo.uvs, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

      const postIdxBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, postIdxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadGeo.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
    }

    _initShadowMap() {
      const gl = this.gl;
      this.shadowSize = 2048;
      this.shadowFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);

      this.shadowDepthTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.DEPTH_COMPONENT24,
        this.shadowSize,
        this.shadowSize,
        0,
        gl.DEPTH_COMPONENT,
        gl.UNSIGNED_INT,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        this.shadowDepthTex,
        0
      );
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _initPostProcessBuffers() {
      this.sceneFbo = null;
      this.sceneColorTex = null;
      this.sceneDepthRb = null;
      this.bloomFbos = [null, null];
      this.bloomTexs = [null, null];
    }

    _allocateScreenBuffers(width, height) {
      const gl = this.gl;
      const w = Math.max(1, width);
      const h = Math.max(1, height);
      const bw = Math.max(1, Math.floor(w / 2));
      const bh = Math.max(1, Math.floor(h / 2));

      if (this.sceneFbo) {
        gl.deleteFramebuffer(this.sceneFbo);
        gl.deleteTexture(this.sceneColorTex);
        gl.deleteRenderbuffer(this.sceneDepthRb);
        for (let i = 0; i < 2; i++) {
          gl.deleteFramebuffer(this.bloomFbos[i]);
          gl.deleteTexture(this.bloomTexs[i]);
        }
      }

      this.sceneFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);

      this.sceneColorTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.sceneColorTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneColorTex, 0);

      this.sceneDepthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.sceneDepthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.sceneDepthRb);

      for (let i = 0; i < 2; i++) {
        this.bloomFbos[i] = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbos[i]);
        this.bloomTexs[i] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.bloomTexs[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.bloomTexs[i], 0);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.fboWidth = w;
      this.fboHeight = h;
      this.bloomWidth = bw;
      this.bloomHeight = bh;
    }

    _initArenaSimulation() {
      this.workstations = [];
      this.carriers = [];
      this.balloons = [];
      this.particles = [];
      this.pointLights = new Float32Array(6 * 4);
      this.pointColors = new Float32Array(6 * 3);

      const rowsZ = [1.85, -1.95, -5.65];
      const colsX = [-6.8, -2.65, 2.65, 6.8];

      let teamIndex = 0;
      for (let r = 0; r < rowsZ.length; r++) {
        for (let c = 0; c < colsX.length; c++) {
          const wx = colsX[c];
          const wz = rowsZ[r];
          const deskYaw = wx < 0 ? 0.16 : -0.16;
          const hoodie = TEAM_HOODIE_COLORS[teamIndex % TEAM_HOODIE_COLORS.length];

          const isCelebrating = (teamIndex === 1 || teamIndex === 2 || teamIndex === 6 || teamIndex === 9);
          const stateTimer = 4.5 + (teamIndex * 2.3) % 9.0;

          const cosY = Math.cos(deskYaw);
          const sinY = Math.sin(deskYaw);
          const localPoleX = -0.92;
          const localPoleZ = -0.18;
          const poleTop = new Float32Array([
            wx + localPoleX * cosY + localPoleZ * sinY,
            1.72,
            wz - localPoleX * sinY + localPoleZ * cosY,
          ]);

          const members = [];
          for (let m = 0; m < 3; m++) {
            const offsetX = (m - 1) * 0.56;
            const holdsBalloon = (m === 2 && teamIndex % 2 === 0) || (m === 0 && teamIndex % 3 === 1);
            const member = {
              seatOffset: offsetX,
              skin: SKIN_TONES[(teamIndex * 3 + m) % SKIN_TONES.length],
              hair: HAIR_COLORS[(teamIndex * 5 + m * 2) % HAIR_COLORS.length],
              hoodie,
              hasGlasses: (teamIndex + m) % 2 === 0,
              hasHeadphones: (teamIndex + m) % 3 !== 1,
              phase: teamIndex * 1.7 + m * 2.1,
              holdsBalloon,
              handAnchor: new Float32Array([wx + offsetX, 1.08, wz + 0.35]),
            };
            members.push(member);

            if (holdsBalloon) {
              const pColorIdx = (teamIndex * 2 + m) % PROBLEM_BALLOON_COLORS.length;
              this._createBalloon(
                member.handAnchor,
                PROBLEM_BALLOON_COLORS[pColorIdx],
                1.18 + (m % 2) * 0.18,
                0.215,
                50 + teamIndex * 3 + m
              );
            }
          }

          const ws = {
            id: teamIndex,
            x: wx,
            z: wz,
            yaw: deskYaw,
            hoodie,
            state: isCelebrating ? 'celebrating' : 'focused',
            celebrationBlend: isCelebrating ? 1.0 : 0.0,
            stateTimer,
            poleTop,
            members,
            balloonCount: 2 + (teamIndex % 4),
          };

          for (let b = 0; b < ws.balloonCount; b++) {
            const colorIdx = (teamIndex * 3 + b * 2) % PROBLEM_BALLOON_COLORS.length;
            this._createBalloon(
              ws.poleTop,
              PROBLEM_BALLOON_COLORS[colorIdx],
              1.15 + (b % 3) * 0.24,
              0.23,
              ws.id
            );
          }

          this.workstations.push(ws);
          teamIndex++;
        }
      }

      const carrierConfigs = [
        { lane: 'promenade', x: -3.6, z: 4.55, dir: 1, speed: 0.68, state: 'focused', balloons: [0, 1, 3] },
        { lane: 'promenade', x: -0.6, z: 4.82, dir: -1, speed: 0.74, state: 'celebrating', balloons: [2, 4, 0] },
        { lane: 'promenade', x: 2.4, z: 4.45, dir: -1, speed: 0.64, state: 'focused', balloons: [6, 7, 1] },
        { lane: 'promenade', x: 5.2, z: 4.75, dir: -1, speed: 0.78, state: 'celebrating', balloons: [3, 2, 5] },
        { lane: 'promenade', x: -5.8, z: 4.70, dir: 1, speed: 0.72, state: 'celebrating', balloons: [0, 6, 8] },

        { lane: 'central', x: -0.44, z: 2.8, dir: 1, speed: 0.72, state: 'celebrating', balloons: [3, 2, 7] },
        { lane: 'central', x: 0.44, z: 0.4, dir: -1, speed: 0.66, state: 'focused', balloons: [1, 5, 6] },
        { lane: 'central', x: -0.38, z: -2.4, dir: 1, speed: 0.76, state: 'focused', balloons: [4, 8] },
        { lane: 'central', x: 0.40, z: -4.8, dir: 1, speed: 0.74, state: 'celebrating', balloons: [0, 2, 3] },

        { lane: 'leftAisle', x: -4.72, z: 2.5, dir: -1, speed: 0.68, state: 'focused', balloons: [5, 1] },
        { lane: 'leftAisle', x: -4.65, z: -1.8, dir: 1, speed: 0.78, state: 'celebrating', balloons: [2, 6, 8] },

        { lane: 'rightAisle', x: 4.68, z: 2.4, dir: 1, speed: 0.74, state: 'celebrating', balloons: [0, 4, 9] },
        { lane: 'rightAisle', x: 4.75, z: -2.2, dir: -1, speed: 0.65, state: 'focused', balloons: [3, 7] },

        { lane: 'midCross', x: -1.8, z: -0.05, dir: 1, speed: 0.70, state: 'focused', balloons: [1, 2] },
      ];

      carrierConfigs.forEach((cfg, idx) => {
        const carrier = {
          id: idx,
          lane: cfg.lane,
          x: cfg.x,
          y: 0,
          z: cfg.z,
          yaw: 0,
          targetYaw: 0,
          dir: cfg.dir,
          speed: cfg.speed,
          state: cfg.state,
          celebrationBlend: cfg.state === 'celebrating' ? 1.0 : 0.0,
          stateTimer: 5.5 + (idx * 1.9) % 7.0,
          phase: idx * 2.4,
          skin: SKIN_TONES[idx % SKIN_TONES.length],
          hair: HAIR_COLORS[(idx * 3) % HAIR_COLORS.length],
          hoodie: TEAM_HOODIE_COLORS[(idx + 2) % TEAM_HOODIE_COLORS.length],
          hasHeadphones: true,
          hasGlasses: idx % 2 === 0,
          rightHandAnchor: new Float32Array([cfg.x + 0.25, 1.35, cfg.z]),
          leftHandAnchor: new Float32Array([cfg.x - 0.25, 1.15, cfg.z]),
          balloonRefs: [],
        };

        cfg.balloons.forEach((colorIdx, bIdx) => {
          const b = this._createBalloon(
            carrier.rightHandAnchor,
            PROBLEM_BALLOON_COLORS[colorIdx % PROBLEM_BALLOON_COLORS.length],
            1.22 + bIdx * 0.22,
            0.24,
            100 + idx
          );
          carrier.balloonRefs.push(b);
        });

        this.carriers.push(carrier);
      });

      for (let i = 0; i < 140; i++) {
        this.particles.push({
          x: (Math.random() - 0.5) * 24,
          y: 0.4 + Math.random() * 6.5,
          z: -8 + Math.random() * 15,
          vx: (Math.random() - 0.5) * 0.14,
          vy: 0.10 + Math.random() * 0.20,
          vz: (Math.random() - 0.5) * 0.14,
          r: 0.30 + Math.random() * 0.45,
          g: 0.65 + Math.random() * 0.35,
          b: 1.0,
          a: 0.30 + Math.random() * 0.35,
          size: 0.055 + Math.random() * 0.075,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 1.5,
          type: 1.0,
          life: 9999,
        });
      }

      this.workstations.forEach((ws) => {
        if (ws.state === 'celebrating') {
          this._spawnConfettiBurst(ws.x, 1.8, ws.z, 24);
        }
      });
      this.carriers.forEach((c) => {
        if (c.state === 'celebrating') {
          this._spawnConfettiBurst(c.x, 1.9, c.z, 18);
        }
      });
    }

    _createBalloon(anchorRef, color, stringLength = 1.35, radius = 0.23, groupId = 0) {
      const spreadX = (Math.random() - 0.5) * 0.36;
      const spreadZ = (Math.random() - 0.5) * 0.36;
      const b = {
        anchor: anchorRef,
        prevAx: anchorRef[0],
        prevAy: anchorRef[1],
        prevAz: anchorRef[2],
        x: anchorRef[0] + spreadX,
        y: anchorRef[1] + stringLength,
        z: anchorRef[2] + spreadZ,
        vx: 0,
        vy: 0,
        vz: 0,
        offsetX: spreadX * 0.45,
        offsetZ: spreadZ * 0.45,
        color,
        stringLength,
        radius,
        groupId,
        phase: Math.random() * Math.PI * 2,
        excitation: 0,
      };
      this.balloons.push(b);
      return b;
    }

    _spawnConfettiBurst(x, y, z, count = 28) {
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= this.maxParticles) break;
        const col = PROBLEM_BALLOON_COLORS[i % PROBLEM_BALLOON_COLORS.length];
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 1.8;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 0.5,
          y: y + Math.random() * 0.4,
          z: z + (Math.random() - 0.5) * 0.5,
          vx: Math.cos(angle) * speed,
          vy: 1.4 + Math.random() * 2.2,
          vz: Math.sin(angle) * speed,
          r: col[0],
          g: col[1],
          b: col[2],
          a: 0.95,
          size: 0.055 + Math.random() * 0.045,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 9.0,
          type: 0.0,
          life: 2.6 + Math.random() * 1.8,
        });
      }
    }

    triggerCelebrationWave() {
      this.workstations.forEach((ws, idx) => {
        if (idx % 2 === 0 || Math.random() < 0.7) {
          ws.state = 'celebrating';
          ws.stateTimer = 5.0 + Math.random() * 3.5;
          this._spawnConfettiBurst(ws.x, 1.75, ws.z, 26);
        }
      });
      this.carriers.forEach((c, idx) => {
        if (idx % 2 === 0 || c.lane === 'promenade') {
          c.state = 'celebrating';
          c.stateTimer = 6.0 + Math.random() * 3.0;
          this._spawnConfettiBurst(c.x, 1.95, c.z, 24);
        }
      });
    }

    setCompetitorMood(mode) {
      this.moodOverride = mode;
      if (mode === 'focused') {
        this.workstations.forEach((ws, i) => {
          ws.state = i === 2 ? 'celebrating' : 'focused';
          ws.stateTimer = 8.0;
        });
        this.carriers.forEach((c, i) => {
          c.state = i === 1 ? 'celebrating' : 'focused';
          c.stateTimer = 8.0;
        });
      } else if (mode === 'celebrating') {
        this.workstations.forEach((ws, i) => {
          ws.state = i % 4 === 0 ? 'focused' : 'celebrating';
          ws.stateTimer = 8.0;
          if (ws.state === 'celebrating') this._spawnConfettiBurst(ws.x, 1.8, ws.z, 20);
        });
        this.carriers.forEach((c, i) => {
          c.state = i % 4 === 0 ? 'focused' : 'celebrating';
          c.stateTimer = 8.0;
          if (c.state === 'celebrating') this._spawnConfettiBurst(c.x, 1.9, c.z, 20);
        });
      } else {
        this.moodOverride = null;
        this.workstations.forEach((ws, i) => {
          ws.state = i % 3 === 0 ? 'celebrating' : 'focused';
        });
        this.carriers.forEach((c, i) => {
          c.state = i % 2 === 0 ? 'focused' : 'celebrating';
        });
      }
    }

    setCameraMode(mode) {
      this.cameraMode = mode;
    }

    setTheme(themeKey) {
      if (THEMES[themeKey]) {
        this.themeKey = themeKey;
        this.theme = { ...THEMES[themeKey] };
      }
    }

    _bindEvents() {
      this._onResize = () => this.resize();
      this._onMouseMove = (e) => {
        this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
      };
      this._onScroll = () => {
        const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
        this.scrollOffset = clamp(window.scrollY / maxScroll, 0, 1);
      };
      window.addEventListener('resize', this._onResize);
      window.addEventListener('mousemove', this._onMouseMove, { passive: true });
      window.addEventListener('scroll', this._onScroll, { passive: true });
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height || !this.sceneFbo) {
        this.canvas.width = width;
        this.canvas.height = height;
        this._allocateScreenBuffers(width, height);
      }
    }

    update(dt) {
      const clampedDt = Math.min(dt, 0.05);
      this.time += clampedDt;
      const t = this.time;

      this.smoothMouseX = lerp(this.smoothMouseX, this.mouseX, clampedDt * 3.5);
      this.smoothMouseY = lerp(this.smoothMouseY, this.mouseY, clampedDt * 3.5);

      let baseEye, baseTarget;
      if (this.cameraMode === 'carriers') {
        const sway = Math.sin(t * 0.28) * 1.4;
        baseEye = [sway + this.smoothMouseX * 1.3, 2.55 - this.smoothMouseY * 0.4, 8.6];
        baseTarget = [sway * 0.35, 1.45, 1.6];
      } else if (this.cameraMode === 'overview') {
        const orbit = Math.sin(t * 0.18) * 2.8;
        baseEye = [orbit + this.smoothMouseX * 2.0, 7.4 - this.smoothMouseY * 0.8, 13.4];
        baseTarget = [0, 1.2, -1.2];
      } else {
        const orbit = Math.sin(t * 0.22) * 1.75;
        const breathe = Math.cos(t * 0.15) * 0.4;
        baseEye = [
          orbit + this.smoothMouseX * 1.6,
          4.25 - this.smoothMouseY * 0.5 + this.scrollOffset * 1.2,
          10.8 + breathe,
        ];
        baseTarget = [
          this.smoothMouseX * 0.5,
          1.50 - this.smoothMouseY * 0.25,
          0.2,
        ];
      }

      for (let i = 0; i < 3; i++) {
        this.cameraPos[i] = lerp(this.cameraPos[i], baseEye[i], clampedDt * 4.0);
        this.cameraTarget[i] = lerp(this.cameraTarget[i], baseTarget[i], clampedDt * 4.0);
      }

      let activeLightIdx = 0;
      this.pointLights.fill(0);

      for (let i = 0; i < this.workstations.length; i++) {
        const ws = this.workstations[i];
        ws.stateTimer -= clampedDt;
        if (ws.stateTimer <= 0) {
          if (this.moodOverride === 'focused') {
            ws.state = i === 1 ? 'celebrating' : 'focused';
            ws.stateTimer = 6.0 + Math.random() * 5.0;
          } else if (this.moodOverride === 'celebrating') {
            ws.state = i % 4 === 0 ? 'focused' : 'celebrating';
            ws.stateTimer = 6.0 + Math.random() * 5.0;
          } else {
            ws.state = ws.state === 'focused' ? 'celebrating' : 'focused';
            ws.stateTimer = ws.state === 'celebrating' ? (4.5 + Math.random() * 3.5) : (6.5 + Math.random() * 6.0);
          }
          if (ws.state === 'celebrating') {
            this._spawnConfettiBurst(ws.x, 1.75, ws.z, 24);
          }
        }

        const targetBlend = ws.state === 'celebrating' ? 1.0 : 0.0;
        ws.celebrationBlend = lerp(ws.celebrationBlend, targetBlend, clampedDt * 5.0);

        if (ws.celebrationBlend > 0.25 && activeLightIdx < 4) {
          this.pointLights[activeLightIdx * 4 + 0] = ws.x;
          this.pointLights[activeLightIdx * 4 + 1] = 1.65;
          this.pointLights[activeLightIdx * 4 + 2] = ws.z + 0.3;
          this.pointLights[activeLightIdx * 4 + 3] = ws.celebrationBlend * 1.65;
          this.pointColors[activeLightIdx * 3 + 0] = 0.08;
          this.pointColors[activeLightIdx * 3 + 1] = 0.95;
          this.pointColors[activeLightIdx * 3 + 2] = 0.50;
          activeLightIdx++;
        }
      }

      for (let i = 0; i < this.carriers.length; i++) {
        const c = this.carriers[i];
        c.stateTimer -= clampedDt;
        if (c.stateTimer <= 0) {
          if (this.moodOverride === 'focused') {
            c.state = i === 1 ? 'celebrating' : 'focused';
            c.stateTimer = 7.0 + Math.random() * 4.0;
          } else if (this.moodOverride === 'celebrating') {
            c.state = i % 5 === 0 ? 'focused' : 'celebrating';
            c.stateTimer = 7.0 + Math.random() * 4.0;
          } else {
            c.state = c.state === 'focused' ? 'celebrating' : 'focused';
            c.stateTimer = 5.5 + Math.random() * 5.0;
          }
          if (c.state === 'celebrating') {
            this._spawnConfettiBurst(c.x, 1.95, c.z, 22);
          }
        }

        const targetBlend = c.state === 'celebrating' ? 1.0 : 0.0;
        c.celebrationBlend = lerp(c.celebrationBlend, targetBlend, clampedDt * 5.0);

        if (c.state === 'celebrating' && Math.random() < clampedDt * 3.0) {
          this._spawnConfettiBurst(c.x, 2.05, c.z, 3);
        }

        const moveSpeed = c.speed * (c.state === 'celebrating' ? 1.12 : 0.86);
        if (c.lane === 'promenade') {
          c.x += c.dir * moveSpeed * clampedDt;
          if (c.x > 6.5) { c.x = 6.5; c.dir = -1; }
          if (c.x < -6.5) { c.x = -6.5; c.dir = 1; }
          c.targetYaw = c.dir > 0 ? Math.PI * 0.34 : -Math.PI * 0.34;
        } else if (c.lane === 'central' || c.lane === 'leftAisle' || c.lane === 'rightAisle') {
          c.z += c.dir * moveSpeed * clampedDt;
          if (c.z > 4.1) { c.z = 4.1; c.dir = -1; }
          if (c.z < -5.8) { c.z = -5.8; c.dir = 1; }
          c.targetYaw = c.dir > 0 ? 0.0 : Math.PI;
        } else if (c.lane === 'midCross') {
          c.x += c.dir * moveSpeed * clampedDt;
          if (c.x > 6.0) { c.x = 6.0; c.dir = -1; }
          if (c.x < -6.0) { c.x = -6.0; c.dir = 1; }
          c.targetYaw = c.dir > 0 ? Math.PI * 0.40 : -Math.PI * 0.40;
        }

        let diff = c.targetYaw - c.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        c.yaw += diff * Math.min(1.0, clampedDt * 6.0);

        for (let b = 0; b < c.balloonRefs.length; b++) {
          c.balloonRefs[b].excitation = c.celebrationBlend;
        }

        if (c.lane === 'promenade' && activeLightIdx < 6) {
          this.pointLights[activeLightIdx * 4 + 0] = c.x;
          this.pointLights[activeLightIdx * 4 + 1] = 1.85;
          this.pointLights[activeLightIdx * 4 + 2] = c.z + 0.35;
          this.pointLights[activeLightIdx * 4 + 3] = 1.35;
          if (c.celebrationBlend > 0.5) {
            this.pointColors[activeLightIdx * 3 + 0] = 1.0;
            this.pointColors[activeLightIdx * 3 + 1] = 0.75;
            this.pointColors[activeLightIdx * 3 + 2] = 0.20;
          } else {
            this.pointColors[activeLightIdx * 3 + 0] = 0.12;
            this.pointColors[activeLightIdx * 3 + 1] = 0.72;
            this.pointColors[activeLightIdx * 3 + 2] = 1.0;
          }
          activeLightIdx++;
        }
      }

      for (let i = 0; i < this.balloons.length; i++) {
        const b = this.balloons[i];
        const ax = b.anchor[0];
        const ay = b.anchor[1];
        const az = b.anchor[2];

        const dAx = ax - b.prevAx;
        const dAy = ay - b.prevAy;
        const dAz = az - b.prevAz;
        if (Math.hypot(dAx, dAy, dAz) < 1.5) {
          b.x += dAx * 0.88;
          b.y += dAy * 0.88;
          b.z += dAz * 0.88;
        }
        b.prevAx = ax;
        b.prevAy = ay;
        b.prevAz = az;

        const windX = Math.sin(t * 1.9 + b.phase) * 0.35 + Math.cos(t * 4.2 + b.phase) * 0.30 * b.excitation;
        const windZ = Math.cos(t * 1.6 + b.phase * 1.3) * 0.35 + Math.sin(t * 3.8 + b.phase) * 0.30 * b.excitation;
        const buoyancyY = 14.0 + Math.sin(t * 5.5 + b.phase) * 2.0 * b.excitation;

        const targetX = ax + b.offsetX;
        const targetZ = az + b.offsetZ;

        b.vx += ((targetX - b.x) * 10.5 + windX) * clampedDt;
        b.vy += (buoyancyY - 5.0 * (b.y - (ay + b.stringLength))) * clampedDt;
        b.vz += ((targetZ - b.z) * 10.5 + windZ) * clampedDt;

        const damp = Math.exp(-5.5 * clampedDt);
        b.vx *= damp;
        b.vy *= damp;
        b.vz *= damp;

        b.x += b.vx * clampedDt;
        b.y += b.vy * clampedDt;
        b.z += b.vz * clampedDt;

        if (b.y < ay + 0.82) {
          b.y = ay + 0.82;
          if (b.vy < 0) b.vy = 0;
        }

        const maxHoriz = 0.32;
        const hdx = b.x - ax;
        const hdz = b.z - az;
        const hDist = Math.hypot(hdx, hdz);
        if (hDist > maxHoriz) {
          const hScale = maxHoriz / hDist;
          b.x = ax + hdx * hScale;
          b.z = az + hdz * hScale;
        }

        const dx = b.x - ax;
        const dy = b.y - ay;
        const dz = b.z - az;
        const dist = Math.hypot(dx, dy, dz) || 1;
        if (dist > b.stringLength) {
          const scaleDist = b.stringLength / dist;
          b.x = ax + dx * scaleDist;
          b.y = ay + dy * scaleDist;
          b.z = az + dz * scaleDist;
        }
      }

      for (let i = 0; i < this.balloons.length; i++) {
        const b1 = this.balloons[i];
        for (let j = i + 1; j < this.balloons.length; j++) {
          const b2 = this.balloons[j];
          if (b1.groupId !== b2.groupId) continue;
          const dx = b2.x - b1.x;
          const dy = b2.y - b1.y;
          const dz = b2.z - b1.z;
          const minDist = (b1.radius + b2.radius) * 1.12;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < minDist * minDist && d2 > 1e-5) {
            const d = Math.sqrt(d2);
            const push = (minDist - d) * 0.5;
            const nx = dx / d;
            const ny = dy / d;
            const nz = dz / d;
            b1.x -= nx * push;
            b1.y -= ny * push * 0.25;
            b1.z -= nz * push;
            b2.x += nx * push;
            b2.y += ny * push * 0.25;
            b2.z += nz * push;
          }
        }
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.angle += p.spin * clampedDt;
        if (p.type < 0.5) {
          p.vy -= 2.4 * clampedDt;
          p.vx *= 1.0 - 1.5 * clampedDt;
          p.vz *= 1.0 - 1.5 * clampedDt;
          p.x += (p.vx + Math.sin(t * 6.0 + i) * 0.25) * clampedDt;
          p.y += p.vy * clampedDt;
          p.z += (p.vz + Math.cos(t * 5.2 + i) * 0.25) * clampedDt;
          p.life -= clampedDt;
          if (p.y < 0.04 || p.life <= 0) {
            this.particles.splice(i, 1);
          }
        } else {
          p.x += (p.vx + Math.sin(t * 0.7 + i) * 0.08) * clampedDt;
          p.y += p.vy * clampedDt;
          p.z += p.vz * clampedDt;
          if (p.y > 7.2) {
            p.y = 0.3;
            p.x = (Math.random() - 0.5) * 22;
            p.z = -7 + Math.random() * 14;
          }
        }
      }
    }

    _buildSceneGeometry() {
      const t = this.time;
      const s = this.stack;

      this.boxBatch.reset();
      this.sphereBatch.reset();
      this.cylBatch.reset();
      this.balloonBatch.reset();
      this.quadBatch.reset();
      this.coneBatch.reset();
      this.stringVertexCount = 0;

      s.reset();
      s.translate(0, -0.06, 0).scale(42.0, 0.12, 36.0);
      const fc = this.theme.floorColor;
      this.boxBatch.addInstance(s.current, fc[0], fc[1], fc[2], 3.0, 0, 0, 0, 0);

      this._buildStageAndScoreboard(t);

      for (let i = 0; i < this.workstations.length; i++) {
        this._buildWorkstation(this.workstations[i], t);
      }

      for (let i = 0; i < this.carriers.length; i++) {
        this._buildBalloonCarrier(this.carriers[i], t);
      }

      for (let i = 0; i < this.balloons.length; i++) {
        this._buildBalloonAndString(this.balloons[i], t);
      }

      this.boxBatch.upload();
      this.sphereBatch.upload();
      this.cylBatch.upload();
      this.balloonBatch.upload();
      this.quadBatch.upload();
      this.coneBatch.upload();

      if (this.stringVertexCount > 0) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.stringBuffer);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          this.stringData.subarray(0, this.stringVertexCount * 7)
        );
      }

      this.activeParticleCount = Math.min(this.particles.length, this.maxParticles);
      for (let i = 0; i < this.activeParticleCount; i++) {
        const p = this.particles[i];
        const off = i * 10;
        this.particleInstanceData[off + 0] = p.x;
        this.particleInstanceData[off + 1] = p.y;
        this.particleInstanceData[off + 2] = p.z;
        this.particleInstanceData[off + 3] = p.r;
        this.particleInstanceData[off + 4] = p.g;
        this.particleInstanceData[off + 5] = p.b;
        this.particleInstanceData[off + 6] = p.a * Math.min(1.0, p.life);
        this.particleInstanceData[off + 7] = p.size;
        this.particleInstanceData[off + 8] = p.angle;
        this.particleInstanceData[off + 9] = p.type;
      }
      if (this.activeParticleCount > 0) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInstBuf);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          this.particleInstanceData.subarray(0, this.activeParticleCount * 10)
        );
      }
    }

    _buildStageAndScoreboard(t) {
      const s = this.stack;
      const ac = this.theme.accentColor;

      s.reset();
      s.translate(0, 4.35, -9.8).rotateX(0.12);

      s.push();
      s.scale(13.6, 3.6, 0.35);
      this.boxBatch.addInstance(s.current, 0.08, 0.10, 0.16, 1.0, 0.02, 0.05, 0.12, 0);
      s.pop();

      s.push();
      s.translate(0, 1.82, 0.05).scale(13.7, 0.08, 0.38);
      this.boxBatch.addInstance(s.current, ac[0], ac[1], ac[2], 1.0, ac[0] * 0.7, ac[1] * 0.7, ac[2] * 0.7, 0);
      s.pop();

      s.push();
      s.translate(0, -1.82, 0.05).scale(13.7, 0.08, 0.38);
      this.boxBatch.addInstance(s.current, ac[0], ac[1], ac[2], 1.0, ac[0] * 0.7, ac[1] * 0.7, ac[2] * 0.7, 0);
      s.pop();

      s.push();
      s.translate(0, 0, 0.19).scale(13.1, 3.25, 1.0);
      this.quadBatch.addInstance(s.current, 1, 1, 1, 4.0, 0, 0, 0, 100.0);
      s.pop();

      for (const px of [-6.2, 6.2]) {
        s.reset();
        s.translate(px, 3.4, -9.9).scale(0.28, 6.8, 0.28);
        this.cylBatch.addInstance(s.current, 0.14, 0.17, 0.24, 1.0);
      }

      const spotPositions = [
        [-6.5, 6.8, 2.2],
        [0.0, 7.2, 3.5],
        [6.5, 6.8, 2.2],
        [-4.2, 7.0, -2.5],
        [4.2, 7.0, -2.5],
      ];
      for (let i = 0; i < spotPositions.length; i++) {
        const sp = spotPositions[i];
        const swayX = Math.sin(t * 0.45 + i * 1.4) * 0.08;
        const swayZ = Math.cos(t * 0.38 + i * 1.9) * 0.08;
        s.reset();
        s.translate(sp[0], sp[1] * 0.5, sp[2])
          .rotateX(swayZ)
          .rotateZ(swayX)
          .scale(2.2, sp[1], 2.2);
        this.coneBatch.addInstance(
          s.current,
          ac[0] * 0.55 + 0.25,
          ac[1] * 0.55 + 0.35,
          ac[2] * 0.55 + 0.45,
          0.028
        );
      }
    }

    _buildWorkstation(ws, t) {
      const s = this.stack;
      const { x, z, yaw } = ws;
      const cb = ws.celebrationBlend;

      s.reset();
      s.translate(x, 0, z).rotateY(yaw);

      s.push();
      s.translate(0, 0.74, 0).scale(2.12, 0.06, 0.92);
      this.boxBatch.addInstance(s.current, 0.15, 0.18, 0.26, 0.3);
      s.pop();

      const trimR = lerp(this.theme.accentColor[0] * 0.5, 0.08, cb);
      const trimG = lerp(this.theme.accentColor[1] * 0.5, 0.95, cb);
      const trimB = lerp(this.theme.accentColor[2] * 0.5, 0.52, cb);
      s.push();
      s.translate(0, 0.74, -0.46).scale(2.13, 0.035, 0.03);
      this.boxBatch.addInstance(s.current, trimR, trimG, trimB, 1.0, trimR * 0.7, trimG * 0.7, trimB * 0.7, 0);
      s.pop();

      for (const lx of [-0.96, 0.96]) {
        for (const lz of [-0.36, 0.36]) {
          s.push();
          s.translate(lx, 0.37, lz).scale(0.06, 0.74, 0.06);
          this.cylBatch.addInstance(s.current, 0.12, 0.14, 0.20, 1.0);
          s.pop();
        }
      }

      s.push();
      s.translate(-0.92, 1.24, -0.18).scale(0.035, 0.98, 0.035);
      this.cylBatch.addInstance(s.current, 0.55, 0.62, 0.75, 1.0);
      s.pop();

      s.push();
      s.translate(0, 0.88, -0.18).scale(0.08, 0.26, 0.08);
      this.cylBatch.addInstance(s.current, 0.12, 0.14, 0.18, 1.0);
      s.pop();

      s.push();
      s.translate(0, 1.08, -0.16).rotateX(-0.08);

      s.push();
      s.scale(0.92, 0.52, 0.045);
      this.boxBatch.addInstance(s.current, 0.08, 0.10, 0.15, 0.8);
      s.pop();

      s.push();
      s.translate(0, 0, 0.026).scale(0.86, 0.46, 1.0);
      this.quadBatch.addInstance(s.current, 1, 1, 1, 4.0, cb, 0, 0, ws.id + 1.0);
      s.pop();

      s.push();
      s.translate(0, 0.16, -0.026).scale(0.68, 0.05, 0.02);
      const backR = lerp(0.10, 0.05, cb);
      const backG = lerp(0.55, 0.95, cb);
      const backB = lerp(0.95, 0.50, cb);
      this.boxBatch.addInstance(s.current, backR, backG, backB, 1.0, backR * 0.7, backG * 0.7, backB * 0.7, 0);
      s.pop();
      s.pop();

      s.push();
      s.translate(0, 0.78, 0.12).scale(0.42, 0.022, 0.15);
      this.boxBatch.addInstance(s.current, 0.10, 0.12, 0.18, 0.6, 0.04, 0.12, 0.22, 0);
      s.pop();

      s.push();
      s.translate(-0.55, 0.775, 0.10).rotateY(0.22).scale(0.24, 0.01, 0.32);
      this.boxBatch.addInstance(s.current, 0.90, 0.93, 0.98, 0.2);
      s.pop();

      s.push();
      s.translate(0.52, 0.775, 0.08).rotateY(-0.18).scale(0.24, 0.01, 0.32);
      this.boxBatch.addInstance(s.current, 0.90, 0.93, 0.98, 0.2);
      s.pop();

      for (let m = 0; m < ws.members.length; m++) {
        const mem = ws.members[m];
        const mx = mem.seatOffset;
        const mz = 0.46;

        s.push();
        s.translate(mx, 0.44, mz + 0.06).scale(0.38, 0.05, 0.38);
        this.boxBatch.addInstance(s.current, 0.11, 0.13, 0.18, 0.5);
        s.pop();

        s.push();
        s.translate(mx, 0.22, mz + 0.06).scale(0.06, 0.44, 0.06);
        this.cylBatch.addInstance(s.current, 0.10, 0.12, 0.16, 1.0);
        s.pop();

        s.push();
        s.translate(mx, 0.66, mz + 0.23).rotateX(0.10 * cb).scale(0.32, 0.34, 0.045);
        this.boxBatch.addInstance(s.current, 0.12, 0.14, 0.20, 0.4);
        s.pop();

        const bounce = cb * Math.abs(Math.sin(t * 7.5 + mem.phase)) * 0.14;
        const focusLean = (1.0 - cb) * -0.28;
        const celebLean = cb * (0.14 + Math.sin(t * 6.0 + mem.phase) * 0.08);
        const torsoPitch = focusLean + celebLean;
        const inwardYaw = Math.PI + (m - 1) * 0.22 + cb * Math.sin(t * 4.5 + mem.phase) * 0.25;

        s.push();
        s.translate(mx, 0.50 + bounce, mz).rotateY(inwardYaw);

        for (const side of [-0.09, 0.09]) {
          s.push();
          s.translate(side, 0.0, 0.12).rotateX(Math.PI * 0.5).scale(0.11, 0.30, 0.11);
          this.boxBatch.addInstance(s.current, 0.14, 0.16, 0.24, 0.2);
          s.pop();
        }

        s.push();
        s.translate(0, 0.24, 0).rotateX(torsoPitch);

        s.push();
        s.scale(0.30, 0.42, 0.20);
        this.boxBatch.addInstance(
          s.current,
          mem.hoodie[0],
          mem.hoodie[1],
          mem.hoodie[2],
          0.2,
          cb * 0.03,
          cb * 0.09,
          cb * 0.04,
          0
        );
        s.pop();

        const headNod = (1.0 - cb) * Math.sin(t * 5.0 + mem.phase) * 0.06 + cb * (-0.22 + Math.sin(t * 8.0 + mem.phase) * 0.12);
        const headTurn = (1.0 - cb) * Math.sin(t * 1.8 + mem.phase) * 0.08 + cb * Math.cos(t * 5.0 + mem.phase) * 0.22;
        s.push();
        s.translate(0, 0.33, 0).rotateY(headTurn).rotateX(headNod);

        s.push();
        s.scale(0.22, 0.24, 0.22);
        this.sphereBatch.addInstance(s.current, mem.skin[0], mem.skin[1], mem.skin[2], 0.25);
        s.pop();

        s.push();
        s.translate(0, 0.05, -0.02).scale(0.235, 0.18, 0.235);
        this.sphereBatch.addInstance(s.current, mem.hair[0], mem.hair[1], mem.hair[2], 0.2);
        s.pop();

        if (mem.hasGlasses) {
          s.push();
          s.translate(0, 0.01, 0.105).scale(0.16, 0.045, 0.03);
          this.boxBatch.addInstance(s.current, 0.2, 0.85, 1.0, 0.9, 0.08, 0.38, 0.55, 0);
          s.pop();
        }

        if (mem.hasHeadphones) {
          for (const hSide of [-0.115, 0.115]) {
            s.push();
            s.translate(hSide, 0.0, 0.0).scale(0.045, 0.09, 0.08);
            this.boxBatch.addInstance(s.current, 0.12, 0.15, 0.22, 0.8, 0.02, 0.22, 0.40, 0);
            s.pop();
          }
        }
        s.pop();

        for (let aIdx = 0; aIdx < 2; aIdx++) {
          const isRight = aIdx === 1;
          const side = isRight ? 0.19 : -0.19;
          const typeWave = Math.sin(t * 14.0 + mem.phase + aIdx * 2.5) * 0.11;

          let focusShoulderX = -1.05 + typeWave;
          let focusForearmX = -0.55 - typeWave * 0.5;
          if (mem.holdsBalloon && isRight) {
            focusShoulderX = -1.45 + Math.sin(t * 2.5 + mem.phase) * 0.06;
            focusForearmX = -0.35;
          }

          const celebShoulderX = -2.65 + Math.sin(t * 9.0 + mem.phase + aIdx) * 0.28;
          const celebShoulderZ = (isRight ? -0.32 : 0.32) + Math.cos(t * 8.0 + mem.phase) * 0.15;

          const shoulderX = lerp(focusShoulderX, celebShoulderX, cb);
          const shoulderZ = lerp(isRight ? 0.08 : -0.08, celebShoulderZ, cb);
          const forearmX = lerp(focusForearmX, -0.20, cb);

          s.push();
          s.translate(side, 0.16, 0.0).rotateZ(shoulderZ).rotateX(shoulderX);

          s.push();
          s.translate(0, -0.11, 0).scale(0.085, 0.22, 0.085);
          this.boxBatch.addInstance(s.current, mem.hoodie[0], mem.hoodie[1], mem.hoodie[2], 0.2);
          s.pop();

          s.translate(0, -0.21, 0).rotateX(forearmX);
          s.push();
          s.translate(0, -0.10, 0).scale(0.072, 0.20, 0.072);
          this.boxBatch.addInstance(s.current, mem.skin[0], mem.skin[1], mem.skin[2], 0.25);
          s.pop();

          s.translate(0, -0.20, 0);
          if (mem.holdsBalloon && isRight) {
            mem.handAnchor[0] = s.current[12];
            mem.handAnchor[1] = s.current[13];
            mem.handAnchor[2] = s.current[14];
          }
          s.push();
          s.scale(0.075, 0.075, 0.075);
          this.sphereBatch.addInstance(s.current, mem.skin[0], mem.skin[1], mem.skin[2], 0.25);
          s.pop();

          s.pop();
        }

        s.pop();
        s.pop();
      }
    }

    _buildBalloonCarrier(c, t) {
      const s = this.stack;
      const cb = c.celebrationBlend;
      const walkCycle = t * (c.speed * 5.8) + c.phase;

      const walkBob = Math.abs(Math.sin(walkCycle)) * 0.055;
      const celebJump = Math.abs(Math.sin(t * 7.2 + c.phase)) * 0.19;
      const bodyY = lerp(walkBob, celebJump, cb);

      s.reset();
      s.translate(c.x, 0.015, c.z).scale(0.62, 0.01, 0.62);
      const auraR = lerp(0.06, 0.10, cb);
      const auraG = lerp(0.45, 0.85, cb);
      const auraB = lerp(0.85, 0.42, cb);
      this.cylBatch.addInstance(s.current, auraR, auraG, auraB, 1.0, auraR * 0.45, auraG * 0.45, auraB * 0.45, 0);

      s.reset();
      s.translate(c.x, bodyY, c.z).rotateY(c.yaw);

      for (let lIdx = 0; lIdx < 2; lIdx++) {
        const isRight = lIdx === 1;
        const side = isRight ? 0.10 : -0.10;
        const legPhase = walkCycle + (isRight ? 0 : Math.PI);
        const hipSwing = Math.sin(legPhase) * lerp(0.45, 0.65, cb);
        const kneeBend = Math.max(0, -Math.cos(legPhase)) * lerp(0.45, 0.75, cb);

        s.push();
        s.translate(side, 0.58, 0).rotateX(hipSwing);

        s.push();
        s.translate(0, -0.15, 0).scale(0.115, 0.30, 0.115);
        this.boxBatch.addInstance(s.current, 0.13, 0.15, 0.22, 0.2);
        s.pop();

        s.translate(0, -0.28, 0).rotateX(kneeBend);
        s.push();
        s.translate(0, -0.14, 0).scale(0.095, 0.28, 0.095);
        this.boxBatch.addInstance(s.current, 0.13, 0.15, 0.22, 0.2);
        s.pop();

        s.push();
        s.translate(0, -0.28, 0.04).scale(0.105, 0.065, 0.18);
        this.boxBatch.addInstance(s.current, 0.85, 0.88, 0.94, 0.4);
        s.pop();

        s.pop();
      }

      const torsoPitch = lerp(0.24, -0.14 + Math.sin(t * 6.5 + c.phase) * 0.08, cb);
      const torsoRoll = Math.cos(walkCycle) * lerp(0.04, 0.11, cb);
      const torsoTwist = Math.sin(walkCycle) * lerp(0.08, 0.20, cb);

      s.push();
      s.translate(0, 0.60, 0).rotateY(torsoTwist).rotateZ(torsoRoll).rotateX(torsoPitch);

      s.push();
      s.translate(0, 0.23, 0).scale(0.32, 0.45, 0.21);
      this.boxBatch.addInstance(
        s.current,
        c.hoodie[0],
        c.hoodie[1],
        c.hoodie[2],
        0.25,
        cb * 0.04,
        cb * 0.10,
        cb * 0.04,
        0
      );
      s.pop();

      s.push();
      s.translate(0, 0.25, 0.112).scale(0.11, 0.14, 0.015);
      const badgeR = lerp(0.15, 0.20, cb);
      const badgeG = lerp(0.78, 1.00, cb);
      const badgeB = lerp(1.00, 0.55, cb);
      this.boxBatch.addInstance(s.current, badgeR, badgeG, badgeB, 0.9, badgeR * 0.4, badgeG * 0.4, badgeB * 0.4, 0);
      s.pop();

      const headPitch = lerp(0.36 + Math.sin(t * 4.5 + c.phase) * 0.05, -0.24 + Math.sin(t * 8.0 + c.phase) * 0.12, cb);
      const headYaw = lerp(-0.14 + Math.sin(t * 2.0 + c.phase) * 0.08, Math.cos(t * 5.5 + c.phase) * 0.25, cb);

      s.push();
      s.translate(0, 0.54, 0).rotateY(headYaw).rotateX(headPitch);

      s.push();
      s.scale(0.23, 0.25, 0.23);
      this.sphereBatch.addInstance(s.current, c.skin[0], c.skin[1], c.skin[2], 0.25);
      s.pop();

      s.push();
      s.translate(0, 0.055, -0.02).scale(0.245, 0.19, 0.245);
      this.sphereBatch.addInstance(s.current, c.hair[0], c.hair[1], c.hair[2], 0.2);
      s.pop();

      if (c.hasGlasses) {
        s.push();
        s.translate(0, 0.01, 0.112).scale(0.17, 0.048, 0.03);
        this.boxBatch.addInstance(s.current, 0.25, 0.90, 1.0, 0.9, 0.12, 0.48, 0.70, 0);
        s.pop();
      }

      for (const hSide of [-0.12, 0.12]) {
        s.push();
        s.translate(hSide, 0.0, 0.0).scale(0.05, 0.095, 0.085);
        this.boxBatch.addInstance(s.current, 0.12, 0.15, 0.22, 0.9, auraR * 0.4, auraG * 0.4, auraB * 0.4, 0);
        s.pop();
      }
      s.pop();

      const rShoulderX = lerp(-0.98 + Math.sin(walkCycle) * 0.10, -2.52 + Math.sin(t * 8.5 + c.phase) * 0.24, cb);
      const rShoulderZ = lerp(-0.24, -0.35 + Math.cos(t * 7.0 + c.phase) * 0.16, cb);
      const rForearmX = lerp(-0.68, -0.22, cb);

      s.push();
      s.translate(-0.20, 0.40, 0).rotateZ(rShoulderZ).rotateX(rShoulderX);

      s.push();
      s.translate(0, -0.12, 0).scale(0.09, 0.24, 0.09);
      this.boxBatch.addInstance(s.current, c.hoodie[0], c.hoodie[1], c.hoodie[2], 0.25);
      s.pop();

      s.translate(0, -0.23, 0).rotateX(rForearmX);
      s.push();
      s.translate(0, -0.11, 0).scale(0.076, 0.22, 0.076);
      this.boxBatch.addInstance(s.current, c.skin[0], c.skin[1], c.skin[2], 0.25);
      s.pop();

      s.translate(0, -0.22, 0);
      c.rightHandAnchor[0] = s.current[12];
      c.rightHandAnchor[1] = s.current[13];
      c.rightHandAnchor[2] = s.current[14];

      s.push();
      s.scale(0.082, 0.082, 0.082);
      this.sphereBatch.addInstance(s.current, c.skin[0], c.skin[1], c.skin[2], 0.25);
      s.pop();
      s.pop();

      const lShoulderX = lerp(-0.82, -2.60 + Math.cos(t * 9.0 + c.phase) * 0.30, cb);
      const lShoulderZ = lerp(0.16, 0.38 + Math.sin(t * 8.0 + c.phase) * 0.18, cb);
      const lForearmX = lerp(-0.90, -0.20, cb);

      s.push();
      s.translate(0.20, 0.40, 0).rotateZ(lShoulderZ).rotateX(lShoulderX);

      s.push();
      s.translate(0, -0.12, 0).scale(0.09, 0.24, 0.09);
      this.boxBatch.addInstance(s.current, c.hoodie[0], c.hoodie[1], c.hoodie[2], 0.25);
      s.pop();

      s.translate(0, -0.23, 0).rotateX(lForearmX);
      s.push();
      s.translate(0, -0.11, 0).scale(0.076, 0.22, 0.076);
      this.boxBatch.addInstance(s.current, c.skin[0], c.skin[1], c.skin[2], 0.25);
      s.pop();

      s.translate(0, -0.22, 0);
      c.leftHandAnchor[0] = s.current[12];
      c.leftHandAnchor[1] = s.current[13];
      c.leftHandAnchor[2] = s.current[14];

      s.push();
      s.scale(0.082, 0.082, 0.082);
      this.sphereBatch.addInstance(s.current, c.skin[0], c.skin[1], c.skin[2], 0.25);
      s.pop();

      if (cb < 0.65) {
        const tabScale = 1.0 - cb * 1.2;
        if (tabScale > 0.05) {
          s.push();
          s.translate(-0.08, -0.02, 0.10).rotateX(1.18).rotateY(-0.22);

          s.push();
          s.scale(0.34 * tabScale, 0.42 * tabScale, 0.022);
          this.boxBatch.addInstance(s.current, 0.08, 0.12, 0.20, 0.9, 0.04, 0.22, 0.45, 0);
          s.pop();

          s.push();
          s.translate(0, 0, 0.015).scale(0.30 * tabScale, 0.38 * tabScale, 1.0);
          this.quadBatch.addInstance(s.current, 1, 1, 1, 4.0, 0, 0, 0, 20.0 + c.id);
          s.pop();

          s.pop();
        }
      }

      s.pop();
      s.pop();
    }

    _buildBalloonAndString(b, t) {
      const s = this.stack;
      const ax = b.anchor[0];
      const ay = b.anchor[1];
      const az = b.anchor[2];

      const dx = b.x - ax;
      const dz = b.z - az;

      const tiltZ = clamp(-dx * 0.28, -0.42, 0.42);
      const tiltX = clamp(dz * 0.28, -0.42, 0.42);
      const spinY = b.phase + Math.sin(t * 0.8 + b.phase) * 0.35;

      const scaleR = b.radius * 2.25;
      s.reset();
      s.translate(b.x, b.y, b.z)
        .rotateZ(tiltZ)
        .rotateX(tiltX)
        .rotateY(spinY)
        .scale(scaleR, scaleR, scaleR);

      const m = s.current;
      const knotX = m[4] * -0.58 + m[12];
      const knotY = m[5] * -0.58 + m[13];
      const knotZ = m[6] * -0.58 + m[14];

      const col = b.color;
      const glowBoost = 0.14 + b.excitation * 0.22;
      this.balloonBatch.addInstance(
        m,
        col[0],
        col[1],
        col[2],
        2.0,
        col[0] * glowBoost,
        col[1] * glowBoost,
        col[2] * glowBoost,
        0
      );

      const segments = 6;
      const sag = 0.08 + 0.05 * Math.sin(t * 3.0 + b.phase);
      const swayX = Math.cos(t * 2.4 + b.phase) * 0.04;
      const swayZ = Math.sin(t * 2.1 + b.phase) * 0.04;

      let prevX = ax;
      let prevY = ay;
      let prevZ = az;

      for (let seg = 1; seg <= segments; seg++) {
        if (this.stringVertexCount + 2 > this.maxStringVertices) break;
        const u = seg / segments;
        const bow = Math.sin(u * Math.PI);
        const curX = lerp(ax, knotX, u) + swayX * bow;
        const curY = lerp(ay, knotY, u) - sag * bow * (1.0 - u * 0.3);
        const curZ = lerp(az, knotZ, u) + swayZ * bow;

        const off = this.stringVertexCount * 7;
        this.stringData[off + 0] = prevX;
        this.stringData[off + 1] = prevY;
        this.stringData[off + 2] = prevZ;
        this.stringData[off + 3] = 0.80;
        this.stringData[off + 4] = 0.86;
        this.stringData[off + 5] = 0.96;
        this.stringData[off + 6] = 0.72;

        this.stringData[off + 7] = curX;
        this.stringData[off + 8] = curY;
        this.stringData[off + 9] = curZ;
        this.stringData[off + 10] = lerp(0.84, col[0], u * 0.55);
        this.stringData[off + 11] = lerp(0.88, col[1], u * 0.55);
        this.stringData[off + 12] = lerp(0.96, col[2], u * 0.55);
        this.stringData[off + 13] = 0.88;

        this.stringVertexCount += 2;
        prevX = curX;
        prevY = curY;
        prevZ = curZ;
      }
    }

    render(dt = 0.016) {
      if (!this.running) return;
      this.resize();
      this.update(dt);
      this._buildSceneGeometry();

      const gl = this.gl;
      const w = this.fboWidth;
      const h = this.fboHeight;

      const aspect = w / Math.max(1, h);
      perspective(this.projMat, (45 * Math.PI) / 180, aspect, 0.2, 75.0);
      lookAt(this.viewMat, this.cameraPos, this.cameraTarget, [0, 1, 0]);
      multiply(this.viewProjMat, this.projMat, this.viewMat);

      this.cameraRight[0] = this.viewMat[0];
      this.cameraRight[1] = this.viewMat[4];
      this.cameraRight[2] = this.viewMat[8];
      this.cameraUp[0] = this.viewMat[1];
      this.cameraUp[1] = this.viewMat[5];
      this.cameraUp[2] = this.viewMat[9];

      const ld = this.theme.lightDir;
      lookAt(this.lightViewMat, [ld[0] * 18, ld[1] * 18, ld[2] * 18], [0, 0, 0], [0, 1, 0]);
      ortho(this.lightProjMat, -13.5, 13.5, -12.0, 12.0, 1.0, 38.0);
      multiply(this.lightViewProjMat, this.lightProjMat, this.lightViewMat);

      // PASS 1: Directional Shadow Map
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      gl.useProgram(this.shadowProg);
      gl.uniformMatrix4fv(this.uniforms.shadow.lightViewProj, false, this.lightViewProjMat);

      this.boxBatch.draw();
      this.sphereBatch.draw();
      this.cylBatch.draw();
      this.balloonBatch.draw();

      // PASS 2: Main Offscreen Scene
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
      gl.viewport(0, 0, w, h);
      const fog = this.theme.fogColor;
      gl.clearColor(fog[0], fog[1], fog[2], 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(this.sceneProg);
      gl.uniformMatrix4fv(this.uniforms.scene.viewProj, false, this.viewProjMat);
      gl.uniformMatrix4fv(this.uniforms.scene.lightViewProj, false, this.lightViewProjMat);
      gl.uniform3fv(this.uniforms.scene.cameraPos, this.cameraPos);
      gl.uniform3fv(this.uniforms.scene.lightDir, this.theme.lightDir);
      gl.uniform1f(this.uniforms.scene.time, this.time);
      gl.uniform3fv(this.uniforms.scene.fogColor, fog);
      gl.uniform3fv(this.uniforms.scene.accentColor, this.theme.accentColor);
      gl.uniform4fv(this.uniforms.scene.pointLights, this.pointLights);
      gl.uniform3fv(this.uniforms.scene.pointColors, this.pointColors);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTex);
      gl.uniform1i(this.uniforms.scene.shadowMap, 0);

      this.boxBatch.draw();
      this.sphereBatch.draw();
      this.cylBatch.draw();
      this.balloonBatch.draw();

      gl.disable(gl.CULL_FACE);
      this.quadBatch.draw();

      if (this.stringVertexCount > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.stringProg);
        gl.uniformMatrix4fv(this.uniforms.string.viewProj, false, this.viewProjMat);
        gl.bindVertexArray(this.stringVao);
        gl.drawArrays(gl.LINES, 0, this.stringVertexCount);
        gl.bindVertexArray(null);
      }

      if (this.activeParticleCount > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.useProgram(this.particleProg);
        gl.uniformMatrix4fv(this.uniforms.particle.viewProj, false, this.viewProjMat);
        gl.uniform3fv(this.uniforms.particle.cameraRight, this.cameraRight);
        gl.uniform3fv(this.uniforms.particle.cameraUp, this.cameraUp);
        gl.bindVertexArray(this.particleVao);
        gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.activeParticleCount);
        gl.bindVertexArray(null);
      }

      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.volumetricProg);
      gl.uniformMatrix4fv(this.uniforms.volumetric.viewProj, false, this.viewProjMat);
      gl.uniform3fv(this.uniforms.volumetric.cameraPos, this.cameraPos);
      this.coneBatch.draw();

      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      // PASS 3: Half-Res Bloom Extraction & Gaussian Blur
      gl.bindVertexArray(this.postVao);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbos[0]);
      gl.viewport(0, 0, this.bloomWidth, this.bloomHeight);
      gl.useProgram(this.bloomExtractProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneColorTex);
      gl.uniform1i(this.uniforms.bloomExtract.sceneTex, 0);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      gl.useProgram(this.bloomBlurProg);
      gl.uniform1i(this.uniforms.bloomBlur.tex, 0);
      for (let pass = 0; pass < 2; pass++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbos[1]);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomTexs[0]);
        gl.uniform2f(this.uniforms.bloomBlur.direction, 1.0, 0.0);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbos[0]);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomTexs[1]);
        gl.uniform2f(this.uniforms.bloomBlur.direction, 0.0, 1.0);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      }

      // PASS 4: Composite Scene + Bloom + ACES Tone Mapping
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.compositeProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneColorTex);
      gl.uniform1i(this.uniforms.composite.sceneTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTexs[0]);
      gl.uniform1i(this.uniforms.composite.bloomTex, 1);

      gl.uniform1f(this.uniforms.composite.bloomStrength, this.theme.bloomStrength);
      gl.uniform1f(this.uniforms.composite.vignette, 0.52);

      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
    }

    start() {
      this.running = true;
      let lastTime = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        const dt = (now - lastTime) * 0.001;
        lastTime = now;
        if (!document.hidden) {
          this.render(dt);
        }
        this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
    }

    destroy() {
      this.running = false;
      if (this._rafId) cancelAnimationFrame(this._rafId);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('scroll', this._onScroll);
    }
  }

  Object.assign(SimuMaratona, {
    PROBLEM_BALLOON_COLORS,
    THEMES,
    ContestArenaBackground,
  });
})(window);
