/* =====================================================================
   Groupe AOS — moteur 3D · 4/4 · mise en scène
   Particules, éclairages de nuit par étapes, circulation des engins,
   caméra (vues d'accueil + voyage des activités), cycle jour/nuit,
   boucle de rendu et API publique (window.AOS3D).
   ===================================================================== */
(function (root) {
  'use strict';
  var API = root.AOS3D = root.AOS3D || {};
  API.ready = false;
  API.info = {};
  var A = root.AOSX;
  if (!A) { API.unsupported = true; return; }
  var T = A.T, W = A.W, V = A.V, U = A.U, clamp = A.clamp, lerp = A.lerp, sm = A.smooth;
  var DEG = Math.PI / 180, SUN_AZ = 0.3;

  /* ------------------------------------------------------------------ */
  /* Qualité                                                              */
  /* ------------------------------------------------------------------ */
  var PRESETS = {
    high: { name: 'high', lite: false, terrainFine: 5, veg: 1.0, shadow: 4096, post: true, msaa: true, samples: 4, rays: true, particles: 3400, dprMax: 1.6, dprMin: 0.75, haul: 7, road: 10 },
    medium: { name: 'medium', lite: false, terrainFine: 6, veg: 0.6, shadow: 2048, post: true, msaa: true, samples: 2, rays: false, particles: 1800, dprMax: 1.25, dprMin: 0.7, haul: 6, road: 8 },
    lite: { name: 'lite', lite: true, terrainFine: 8, veg: 0.3, shadow: 1024, post: false, msaa: false, rays: false, particles: 700, dprMax: 1.25, dprMin: 0.75, haul: 5, road: 6 }
  };
  function detectQuality() {
    var q = 'high', s = location.search;
    var coarse = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;
    var small = Math.min(screen.width, screen.height) < 820 || root.innerWidth < 760;
    var cores = navigator.hardwareConcurrency || 8, mem = navigator.deviceMemory || 8;
    if (coarse && small) q = 'lite';
    else if (cores <= 4 || mem <= 4) q = 'medium';
    try {
      var c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
      var ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      var r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      API.info.gpu = r; API.info.webgl2 = !!(gl && gl.texStorage2D);
      if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(r)) q = 'lite';
      else if (/Intel/i.test(r) && q === 'high') q = 'medium';
      if (!API.info.webgl2 && q !== 'lite') q = 'lite';
    } catch (e) { /* ignore */ }
    if (/[?&]lite/.test(s)) q = 'lite';
    if (/[?&]medium/.test(s)) q = 'medium';
    if (/[?&]full/.test(s)) q = 'high';
    return PRESETS[q];
  }

  /* ------------------------------------------------------------------ */
  /* Particules (billboards instanciés, éclairés par le soleil)           */
  /* ------------------------------------------------------------------ */
  function Particles(max) {
    var quad = new T.PlaneGeometry(1, 1), g = new T.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.max = max;
    this.P = new Float32Array(max * 3); this.D = new Float32Array(max * 4); this.C = new Float32Array(max * 3);
    this.aP = new T.InstancedBufferAttribute(this.P, 3); this.aP.setUsage(T.DynamicDrawUsage);
    this.aD = new T.InstancedBufferAttribute(this.D, 4); this.aD.setUsage(T.DynamicDrawUsage);
    this.aC = new T.InstancedBufferAttribute(this.C, 3); this.aC.setUsage(T.DynamicDrawUsage);
    g.setAttribute('aP', this.aP); g.setAttribute('aD', this.aD); g.setAttribute('aC', this.aC);
    g.instanceCount = 0;
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max); this.spin = new Float32Array(max); this.drag = new Float32Array(max); this.buoy = new Float32Array(max);
    this.n = 0;
    this.mat = new T.ShaderMaterial({
      uniforms: A.fogUniforms({ uTex: { value: A.tex.puff() }, uSunCol: U.uSunCol, uAmb: U.uAmb }),
      vertexShader: [
        'attribute vec3 aP; attribute vec4 aD; attribute vec3 aC;',
        'uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb;',
        'varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec3 vW; varying vec3 vFogWorld;',
        'void main() {',
        '  vec4 mv = viewMatrix * vec4(aP, 1.0);',
        '  float c = cos(aD.z), s = sin(aD.z);',
        '  mv.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * aD.x;',
        '  gl_Position = projectionMatrix * mv;',
        '  vUv = uv; vA = aD.y; vW = aP; vFogWorld = aP;',
        '  vec3 vd = normalize(aP - cameraPosition);',
        '  float ct = dot(vd, uSunDir), g = 0.62;',
        '  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * ct, 1.5) * 0.0796;',
        '  vCol = aC * (uAmb * 1.15 + uSunCol * (0.2 + hg * 2.6 * aD.w));',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D uTex;',
        A.GLSL.fogPars,
        'varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec3 vW;',
        'void main() {',
        '  float a = texture2D(uTex, vUv).a * vA;',
        '  if (a < 0.004) discard;',
        '  gl_FragColor = vec4(aosFog(vCol, vW), a);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false
    });
    this.mesh = new T.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.geo = g;
  }
  /* emit(x,y,z, vx,vy,vz, taille, croissance, vie, alpha, couleur[], éclairage) */
  Particles.prototype.emit = function (x, y, z, vx, vy, vz, size, grow, life, alpha, col, lk, drag, buoy) {
    if (this.n >= this.max) return;
    var i = this.n++;
    this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = size; this.grow[i] = grow; this.a0[i] = alpha;
    this.spin[i] = (Math.random() - 0.5) * 0.6; this.drag[i] = drag === undefined ? 1.2 : drag; this.buoy[i] = buoy === undefined ? 0.35 : buoy;
    this.D[i * 4] = size; this.D[i * 4 + 1] = 0; this.D[i * 4 + 2] = Math.random() * 6.28; this.D[i * 4 + 3] = lk === undefined ? 1 : lk;
    this.C[i * 3] = col[0]; this.C[i * 3 + 1] = col[1]; this.C[i * 3 + 2] = col[2];
  };
  Particles.prototype.update = function (dt, wind) {
    var n = this.n, i = 0;
    while (i < n) {
      this.life[i] += dt;
      var L = this.maxLife[i];
      if (this.life[i] >= L) {
        n--;
        if (i !== n) this.copy(n, i);
        continue;
      }
      var k = Math.exp(-this.drag[i] * dt), b = i * 3;
      this.vel[b] = this.vel[b] * k + wind[0] * (1 - k);
      this.vel[b + 1] = this.vel[b + 1] * k + this.buoy[i] * dt;
      this.vel[b + 2] = this.vel[b + 2] * k + wind[2] * (1 - k);
      this.P[b] += this.vel[b] * dt; this.P[b + 1] += this.vel[b + 1] * dt; this.P[b + 2] += this.vel[b + 2] * dt;
      var f = this.life[i] / L;
      this.D[i * 4] = this.s0[i] * (1 + this.grow[i] * Math.sqrt(f));
      this.D[i * 4 + 1] = this.a0[i] * Math.min(1, this.life[i] * 3) * (1 - f) * (1 - f);
      this.D[i * 4 + 2] += this.spin[i] * dt;
      i++;
    }
    this.n = n;
    this.geo.instanceCount = n;
    this.aP.needsUpdate = this.aD.needsUpdate = this.aC.needsUpdate = true;
  };
  Particles.prototype.copy = function (from, to) {
    var a, b;
    for (a = 0; a < 3; a++) { this.P[to * 3 + a] = this.P[from * 3 + a]; this.vel[to * 3 + a] = this.vel[from * 3 + a]; this.C[to * 3 + a] = this.C[from * 3 + a]; }
    for (b = 0; b < 4; b++) this.D[to * 4 + b] = this.D[from * 4 + b];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.s0[to] = this.s0[from]; this.grow[to] = this.grow[from];
    this.a0[to] = this.a0[from]; this.spin[to] = this.spin[from]; this.drag[to] = this.drag[from]; this.buoy[to] = this.buoy[from];
  };

  /* ------------------------------------------------------------------ */
  /* Lumières de nuit : halos (billboards), flaques au sol, faisceaux       */
  /* ------------------------------------------------------------------ */
  function glowMaterial() {
    return new T.ShaderMaterial({
      uniforms: A.fogUniforms({ uStage: U.uStage, uNightK: U.uNightK, uTime: U.uTime, uViewH: U.uViewH, uPx: U.uLightPx }),
      vertexShader: [
        'uniform float uStage; uniform float uNightK; uniform float uTime; uniform float uViewH; uniform float uPx;',
        'attribute vec3 aP; attribute vec3 aC; attribute vec4 aS;',
        'varying vec2 vUv; varying vec3 vCol; varying float vI; varying vec3 vFogWorld;',
        'void main() {',
        '  vec4 mv = viewMatrix * vec4(aP, 1.0);',
        '  float dist = max(-mv.z, 1.0);',
        '  float pxm = projectionMatrix[1][1] * uViewH * 0.5 / dist;',
        '  float px = aS.x * pxm;',
        '  float pxc = max(px, uPx);',
        '  float size = pxc / pxm;',
        '  float ds = (uStage - aS.y - 0.25) / 0.28;',
        '  float lvl = (smoothstep(aS.y, aS.y + 0.45, uStage) + 1.6 * exp(-ds * ds)) * uNightK;',
        '  float bl = aS.z > 0.0 ? step(0.5, fract(uTime * aS.z + aS.w)) : 1.0;',
        '  vI = lvl * bl * mix(1.0, clamp(px / pxc, 0.0, 1.0), 0.6);',
        '  mv.xy += position.xy * size * 2.0;',
        '  mv.z += min(size * 0.8, dist * 0.5);',
        '  gl_Position = projectionMatrix * mv;',
        '  if (vI < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
        '  vUv = position.xy * 2.0; vCol = aC; vFogWorld = aP;',
        '}'
      ].join('\n'),
      fragmentShader: [
        A.GLSL.fogPars,
        'varying vec2 vUv; varying vec3 vCol; varying float vI;',
        'void main() {',
        '  float d = length(vUv);',
        '  float a = (exp(-d * d * 16.0) * 1.7 + exp(-d * 3.4) * 0.22) * vI;',
        '  vec3 rd; float f = aosFogAmt(vFogWorld, rd);',
        '  gl_FragColor = vec4(vCol * a * 16.0 * (1.0 - f * 0.8), 1.0);',
        '}'
      ].join('\n'),
      blending: T.AdditiveBlending, transparent: true, depthWrite: false
    });
  }
  function GlowSet(list, dynamic) {
    var n = Math.max(1, list.length), quad = new T.PlaneGeometry(1, 1), g = new T.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    this.P = new Float32Array(n * 3); this.C = new Float32Array(n * 3); this.S = new Float32Array(n * 4);
    for (var i = 0; i < list.length; i++) {
      var L = list[i];
      this.P.set(L.p, i * 3); this.C.set(L.c, i * 3);
      this.S[i * 4] = L.s || 1; this.S[i * 4 + 1] = L.st || 0; this.S[i * 4 + 2] = L.blink || 0; this.S[i * 4 + 3] = L.ph || Math.random();
    }
    this.aP = new T.InstancedBufferAttribute(this.P, 3); if (dynamic) this.aP.setUsage(T.DynamicDrawUsage);
    g.setAttribute('aP', this.aP); g.setAttribute('aC', new T.InstancedBufferAttribute(this.C, 3)); g.setAttribute('aS', new T.InstancedBufferAttribute(this.S, 4));
    g.instanceCount = list.length;
    this.mesh = new T.Mesh(g, glowMaterial());
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 30;
  }
  function PoolSet(list) {
    var items = list.filter(function (l) { return l.pool > 0; }), n = Math.max(1, items.length);
    var quad = new T.PlaneGeometry(1, 1); quad.rotateX(-Math.PI / 2);
    var g = new T.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    var P = new Float32Array(n * 3), C = new Float32Array(n * 3), S = new Float32Array(n * 2);
    items.forEach(function (L, i) { P[i * 3] = L.p[0]; P[i * 3 + 1] = W.H(L.p[0], L.p[2]) + 0.35; P[i * 3 + 2] = L.p[2]; C.set(L.c, i * 3); S[i * 2] = L.pool; S[i * 2 + 1] = L.st || 0; });
    g.setAttribute('aP', new T.InstancedBufferAttribute(P, 3)); g.setAttribute('aC', new T.InstancedBufferAttribute(C, 3)); g.setAttribute('aS', new T.InstancedBufferAttribute(S, 2));
    g.instanceCount = items.length;
    var mat = new T.ShaderMaterial({
      uniforms: { uStage: U.uStage, uNightK: U.uNightK },
      vertexShader: 'uniform float uStage; uniform float uNightK; attribute vec3 aP; attribute vec3 aC; attribute vec2 aS; varying vec2 vUv; varying vec3 vC; varying float vI;' +
        'void main() { vec3 wp = aP + vec3(position.x, 0.0, position.z) * aS.x * 2.0; vUv = position.xz * 2.0; vC = aC; vI = smoothstep(aS.y, aS.y + 0.45, uStage) * uNightK;' +
        ' gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); if (vI < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }',
      fragmentShader: 'varying vec2 vUv; varying vec3 vC; varying float vI; void main() { float d = length(vUv); float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2); gl_FragColor = vec4(vC * vec3(1.0, 0.78, 0.5) * a * vI * 0.32, 1.0); }',
      blending: T.AdditiveBlending, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6
    });
    this.mesh = new T.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 25;
  }
  /* faisceaux de phares (cônes additifs) */
  function beamMaterial(stage) {
    return new T.ShaderMaterial({
      uniforms: { uStage: U.uStage, uNightK: U.uNightK, uSt: { value: stage } },
      vertexShader: 'varying float vL; varying vec3 vN; varying vec3 vV; void main() { vL = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform float uStage; uniform float uNightK; uniform float uSt; varying float vL; varying vec3 vN; varying vec3 vV;' +
        'void main() { float lvl = smoothstep(uSt, uSt + 0.45, uStage) * uNightK; float e = pow(abs(dot(vN, vV)), 1.5); float a = pow(clamp(vL, 0.0, 1.0), 1.6) * e * lvl * 0.42; gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a, 1.0); }',
      blending: T.AdditiveBlending, transparent: true, depthWrite: false, side: T.DoubleSide
    });
  }
  function beams(heads, mat) {
    var list = heads.map(function (h) {
      var c = new T.CylinderGeometry(0.2, 4.2, 24, 14, 1, true);
      c.translate(0, -12, 0); c.rotateX(-Math.PI / 2 + 0.06); c.translate(h[0], h[1], h[2]);
      return c;
    });
    var g = A.merge(list, true);
    var m = new T.Mesh(g, mat); m.renderOrder = 28; m.frustumCulled = false;
    return m;
  }

  /* flamme de torchère (billboard cylindrique) */
  function flareMesh(pos) {
    var g = new T.PlaneGeometry(1, 1, 1, 1); g.translate(0, 0.5, 0);
    var mat = new T.ShaderMaterial({
      uniforms: { uTime: U.uTime, uNoise: U.uNoise, uPos: { value: new T.Vector3().fromArray(pos) } },
      vertexShader: 'uniform vec3 uPos; varying vec2 vUv; void main() { vec3 tc = cameraPosition - uPos; tc.y = 0.0; vec3 fw = normalize(tc); vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));' +
        ' vec3 wp = uPos + rt * position.x * 10.0 + vec3(0.0, 1.0, 0.0) * position.y * 26.0 + fw * 2.0; wp.z += position.y * position.y * 4.0; vUv = position.xy; gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }',
      fragmentShader: [
        'uniform float uTime; uniform sampler2D uNoise; varying vec2 vUv;',
        'void main() {',
        '  vec2 uv = vUv;',
        '  float n = texture2D(uNoise, vec2(uv.x * 0.5 + 0.3, uv.y * 0.55 - uTime * 0.9)).r;',
        '  float n2 = texture2D(uNoise, vec2(uv.x * 1.1 + 0.7, uv.y * 1.2 - uTime * 1.7)).g;',
        '  float w = (1.0 - uv.y) * 0.42 + 0.05;',
        '  float x = abs(uv.x + (n - 0.5) * 0.35 * uv.y);',
        '  float shape = smoothstep(w, w * 0.15, x) * smoothstep(0.95, 0.2, uv.y + (n2 - 0.5) * 0.45) * smoothstep(0.0, 0.07, uv.y);',
        '  vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.68, 0.28), shape);',
        '  col = mix(col, vec3(1.0, 0.94, 0.78), smoothstep(0.55, 1.0, shape) * (1.0 - uv.y));',
        '  gl_FragColor = vec4(col * shape * 22.0, 1.0);',
        '}'
      ].join('\n'),
      blending: T.AdditiveBlending, transparent: true, depthWrite: false, side: T.DoubleSide
    });
    var m = new T.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 31;
    return m;
  }

  /* routes maritimes lumineuses « vers le monde » */
  function seaRoutes(origin) {
    var grp = new T.Group(), dirs = [-0.62, -0.34, -0.08, 0.16, 0.42, 0.7];
    var mat = new T.ShaderMaterial({
      uniforms: { uTime: U.uTime, uLvl: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying float vD; void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vD = length(wp.xyz - cameraPosition); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform float uTime; uniform float uLvl; varying vec2 vUv; varying float vD;' +
        'void main() { float across = clamp(1.0 - abs(vUv.y - 0.5) * 2.0, 0.0, 1.0); across = across * across * across; float reach = smoothstep(uLvl * 1.15, uLvl * 1.15 - 0.12, vUv.x);' +
        ' float pulse = pow(fract(vUv.x * 14.0 - uTime * 0.45), 8.0) * 2.5 + 0.35; float fade = smoothstep(0.0, 0.03, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x));' +
        ' float a = across * reach * fade * pulse * uLvl; gl_FragColor = vec4(vec3(1.0, 0.72, 0.32) * a * 3.2, 1.0); }',
      blending: T.AdditiveBlending, transparent: true, depthWrite: false, side: T.DoubleSide
    });
    dirs.forEach(function (a, k) {
      var pts = [], L = 26000, n = 60;
      for (var i = 0; i <= n; i++) {
        var t = i / n, ang = a * (0.35 + 0.65 * t);
        var d = t * L;
        pts.push(new T.Vector3(origin[0] + Math.cos(ang) * d, 0.6 + t * 4, origin[1] + Math.sin(ang) * d));
      }
      var curve = new T.CatmullRomCurve3(pts);
      var w0 = 14, geo = new T.BufferGeometry(), pos = [], uv = [], idx = [];
      for (i = 0; i <= 160; i++) {
        var u = i / 160, p = curve.getPointAt(u), tg = curve.getTangentAt(u), wv = w0 + u * 220;
        var nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        pos.push(p.x + nx * wv, p.y, p.z + nz * wv, p.x - nx * wv, p.y, p.z - nz * wv);
        uv.push(u, 0, u, 1);
        if (i < 160) { var b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      var m = new T.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 26;
      grp.add(m);
    });
    grp.userData.mat = mat;
    return grp;
  }

  /* ------------------------------------------------------------------ */
  /* Trajets et conducteurs                                              */
  /* ------------------------------------------------------------------ */
  function Track(pts) {
    var vs = pts.map(function (p) { return new T.Vector3(p[0], 0, p[1]); });
    var c = new T.CatmullRomCurve3(vs, true, 'centripetal');
    var L = c.getLength(), n = Math.max(16, Math.ceil(L / 1.2));
    this.L = L; this.n = n; this.x = new Float32Array(n + 1); this.z = new Float32Array(n + 1);
    var v = new T.Vector3();
    for (var i = 0; i <= n; i++) { c.getPointAt(i / n, v); this.x[i] = v.x; this.z[i] = v.z; }
    this.stops = [];
  }
  Track.prototype.pos = function (s, out) {
    s = ((s % this.L) + this.L) % this.L;
    var f = s / this.L * this.n, i = Math.floor(f), t = f - i, j = Math.min(i + 1, this.n);
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t; out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
    return out;
  };
  Track.prototype.nearest = function (x, z) {
    var best = 1e18, bi = 0;
    for (var i = 0; i < this.n; i++) { var dx = this.x[i] - x, dz = this.z[i] - z, d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
    return bi / this.n * this.L;
  };
  Track.prototype.addStop = function (x, z, dur, type) { this.stops.push({ s: this.nearest(x, z), dur: dur, type: type }); };

  var _p1 = {}, _p2 = {}, _p3 = {};
  function Driver(track, model, s0, o) {
    this.tr = track; this.m = model; this.s = s0; this.v = 0; this.vmax = o.vmax; this.acc = o.acc || 1.4; this.dec = o.dec || 2.0;
    this.gap = o.gap || 20; this.stopT = 0; this.stopI = -1; this.loaded = o.loaded ? 1 : 0; this.tilt = 0; this.leader = null;
    this.dust = o.dust || 1; this.kind = o.kind; this.dir = { x: 0, z: 1 }; this.wpos = new T.Vector3(); this.emitAcc = 0; this.yOff = o.yOff || 0;
  }
  Driver.prototype.update = function (dt) {
    var tr = this.tr, L = tr.L, st;
    if (this.stopT > 0) {
      this.stopT -= dt; this.v = 0;
      st = tr.stops[this.stopI];
      var prog = 1 - Math.max(0, this.stopT) / st.dur;
      if (st.type === 'dump') {
        this.tilt = prog < 0.38 ? sm(0, 0.38, prog) : prog < 0.7 ? 1 : 1 - sm(0.7, 1, prog);
        if (prog > 0.45) this.loaded = Math.max(0, 1 - (prog - 0.45) / 0.2);
      } else if (st.type === 'load') {
        this.loaded = Math.max(this.loaded, sm(0.08, 0.92, prog));
      }
      if (this.stopT <= 0) { this.stopT = 0; this.tilt = 0; this.s = (this.s + 0.8) % L; if (st.type === 'dump') this.loaded = 0; }
    } else {
      var dStop = 1e9, ns = -1;
      for (var k = 0; k < tr.stops.length; k++) {
        var d = ((tr.stops[k].s - this.s) % L + L) % L;
        if (d < dStop) { dStop = d; ns = k; }
      }
      var vt = this.vmax;
      vt = Math.min(vt, Math.sqrt(2 * this.dec * Math.max(0, dStop - 0.2)) + 0.3);
      if (this.leader && this.leader !== this) {
        var gap = ((this.leader.s - this.s) % L + L) % L - this.gap;
        vt = Math.min(vt, gap <= 0 ? 0 : Math.sqrt(2 * this.dec * gap));
      }
      if (this.v < vt) this.v = Math.min(vt, this.v + this.acc * dt); else this.v = Math.max(vt, this.v - this.dec * 2.5 * dt);
      var ds = this.v * dt;
      if (ns >= 0 && dStop <= Math.max(ds, 0.25)) { this.s = tr.stops[ns].s; this.stopT = tr.stops[ns].dur; this.stopI = ns; this.v = 0; }
      else this.s = (this.s + ds) % L;
    }
  };
  Driver.prototype.place = function () {
    var tr = this.tr, m = this.m, p = tr.pos(this.s, _p1), f = tr.pos(this.s + 3, _p2), b = tr.pos(this.s - 3, _p3);
    var dx = f.x - b.x, dz = f.z - b.z, l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    this.dir.x = dx; this.dir.z = dz;
    var hl = m.len * 0.36, hw = m.wid * 0.38;
    var hF = W.H(p.x + dx * hl, p.z + dz * hl), hB = W.H(p.x - dx * hl, p.z - dz * hl);
    var hL = W.H(p.x + dz * hw, p.z - dx * hw), hR = W.H(p.x - dz * hw, p.z + dx * hw);
    var y = Math.max((hF + hB + hL + hR) / 4, Math.min(hF, hB) + 0.05) + this.yOff;
    m.g.position.set(p.x, y, p.z);
    m.g.rotation.set(-Math.atan2(hF - hB, 2 * hl), Math.atan2(dx, dz), Math.atan2(hL - hR, 2 * hw), 'YXZ');
    this.wpos.copy(m.g.position);
    for (var i = 0; i < m.wheels.length; i++) m.wheels[i].rotation.x += this.v * this.dtLast / m.wheelR;
    m.bed.rotation.x = -this.tilt * (this.kind === 'haul' ? 0.88 : 0.82);
    var lv = this.loaded;
    m.load.visible = lv > 0.02;
    m.load.scale.set(1, Math.max(0.05, lv), 1);
    if (m.hyd.length) { m.g.updateMatrixWorld(true); for (i = 0; i < m.hyd.length; i++) m.hyd[i].update(); }
  };

  /* ------------------------------------------------------------------ */
  /* État global                                                          */
  /* ------------------------------------------------------------------ */
  var Q, R, post, scene, camera, sun, hemi, skyMat, skyMesh, envScene, envGround, pmrem, envRT, skyModel, particles, glows, dynGlows, pools, flare, flareLight, routes;
  var drivers = { haul: [], road: [] }, exc, loader, dozer, crane, ship, tanker, barges = [], pirogues = [], allBeams = [], dyn = [], lights = [];
  var canvas, running = false, active = true, time = 0, lastNow = 0, frameN = 0;
  var story = 0, storyTarget = 0, heroMode = 'orbit', dragYaw = 0, dragPitch = 0, dragYawV = 0, introT = 0, debugFreeze = false;
  var camPos = new T.Vector3(), camLook = new T.Vector3(), camFov = 40, camFirst = true;
  var curElev = 99, lastEnvElev = 999, lastEnvTime = 0, dprCur = 1, ftAvg = 16, lastResizeT = 0, lw = 0, lh = 0;
  var wind = [1.2, 0, 0.7];
  var DUST = [0.36, 0.17, 0.085], DUST2 = [0.42, 0.24, 0.13], SMOKE = [0.05, 0.05, 0.052], STEAM = [0.5, 0.5, 0.5];
  var rnd = Math.random;

  /* ------------------------------------------------------------------ */
  /* Cycle jour / nuit                                                    */
  /* ------------------------------------------------------------------ */
  var _fex = [0, 0, 0], _rad = [0, 0, 0], _dirTmp = new T.Vector3(), lightDir = new T.Vector3(0.9, 0.3, 0.3).normalize();
  function setSun(elevDeg, force) {
    var e = elevDeg * DEG, sd = U.uSunDir.value;
    sd.set(Math.cos(e) * Math.cos(SUN_AZ), Math.sin(e), Math.cos(e) * Math.sin(SUN_AZ));
    skyModel.update(sd);
    U.uBetaR.value.fromArray(skyModel.betaR); U.uBetaM.value.fromArray(skyModel.betaM); U.uMieG.value = skyModel.mieG;
    U.uSunE.value = skyModel.sunE;
    var night = sm(2, -8, elevDeg), nightK = sm(1.5, -5.5, elevDeg);
    skyModel.night = night;
    U.uFogLUT.value = skyModel.fogLUT(U.uFogLUT.value);
    U.uNight.value = night; U.uNightK.value = nightK; U.uStars.value = sm(-3, -10, elevDeg);
    /* lumière solaire : transmittance atmosphérique, adoucie */
    skyModel.fex(Math.max(sd.y, 0.012), _fex);
    var mx = Math.max(_fex[0], _fex[1], _fex[2], 1e-4);
    var cr = Math.pow(_fex[0] / mx, 0.55), cg = Math.pow(_fex[1] / mx, 0.62), cb = Math.pow(_fex[2] / mx, 0.75);
    var day = sm(-1.2, 5, elevDeg);
    var sunI = 4.3 * day * (0.6 + 0.4 * sm(4, 20, elevDeg));
    if (elevDeg > -1.5) {
      lightDir.copy(sd);
      sun.color.setRGB(cr, cg, cb);
      sun.intensity = sunI;
    } else {
      /* lune : lumière froide et faible, plus haute dans le ciel */
      var me = 38 * DEG, ma = SUN_AZ + 2.3;
      lightDir.set(Math.cos(me) * Math.cos(ma), Math.sin(me), Math.cos(me) * Math.sin(ma));
      sun.color.setRGB(0.55, 0.66, 0.95);
      sun.intensity = 0.15 * sm(-1.5, -6, elevDeg);
    }
    U.uSunCol.value.setRGB(cr * sunI * 0.55, cg * sunI * 0.55, cb * sunI * 0.55);
    /* ambiance (ciel au zénith) */
    _dirTmp.set(0, 1, 0); skyModel.radiance(_dirTmp, _rad);
    var amb = U.uAmb.value; amb.setRGB(_rad[0] + 0.004 * night, _rad[1] + 0.007 * night, _rad[2] + 0.016 * night).multiplyScalar(0.9);
    hemi.color.setRGB(_rad[0] * 0.9 + 0.01 * night, _rad[1] * 0.9 + 0.016 * night, _rad[2] * 0.9 + 0.03 * night);
    hemi.groundColor.setRGB(0.26, 0.12, 0.06).multiplyScalar(0.15 + 0.5 * day);
    hemi.intensity = 0.12 + 0.3 * night;
    /* nuages : éclairés par le soleil un peu plus haut (ils restent dorés au crépuscule) */
    skyModel.fex(Math.max(sd.y + 0.05, 0.02), _fex);
    var cm = Math.max(_fex[0], _fex[1], _fex[2], 1e-4), ck = sm(-8, 3, elevDeg);
    U.uCloudSun.value.setRGB(Math.pow(_fex[0] / cm, 0.7) * 0.55 * ck, Math.pow(_fex[1] / cm, 0.75) * 0.45 * ck, Math.pow(_fex[2] / cm, 0.8) * 0.4 * ck);
    U.uCloudAmb.value.setRGB(_rad[0] * 0.85 + 0.002, _rad[1] * 0.85 + 0.003, _rad[2] * 0.85 + 0.006);
    /* brume plus dense et plus basse au crépuscule */
    U.uFogD.value = lerp(0.00021, 0.00034, sm(12, 0, elevDeg));
    U.uFogI.value = lerp(1.0, 0.85, night);
    /* émissifs (phares, fenêtres) selon la nuit */
    var em = A.M;
    em.lampW.emissiveIntensity = 0.25 + 9 * nightK; em.lampR.emissiveIntensity = 0.4 + 6 * nightK;
    em.lampA.emissiveIntensity = 1.2 + 6 * nightK; em.lampG.emissiveIntensity = 0.4 + 6 * nightK;
    em.windowLit.emissiveIntensity = 3.2 * nightK;
    U.uLampK.value = 0.3 + 9 * nightK;
    if (flareLight) flareLight.intensity = 0.6 + 5 * nightK;
    curElev = elevDeg;
    /* environnement (réflexions + lumière ambiante) : régénéré si le soleil a bougé */
    var now = performance.now();
    if (force || (Math.abs(elevDeg - lastEnvElev) > 0.5 && now - lastEnvTime > 140)) updateEnv(elevDeg, day, night);
  }
  function updateEnv(elevDeg, day, night) {
    /* sol de l'environnement : terre rouge éclairée */
    var sd = U.uSunDir.value, k = Math.max(sd.y, 0) * sun.intensity * 0.33 + 0.05 + 0.02 * night;
    envGround.material.color.setRGB(0.3 * k + 0.002, 0.15 * k + 0.003, 0.08 * k + 0.006);
    var rt = pmrem.fromScene(envScene, 0, 0.1, 1000);
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
    lastEnvElev = elevDeg; lastEnvTime = performance.now();
  }

  /* ------------------------------------------------------------------ */
  /* Construction de la scène                                             */
  /* ------------------------------------------------------------------ */
  function wait() { return new Promise(function (r) { setTimeout(r, 0); }); }
  API.init = function (cv, opts) {
    opts = opts || {};
    canvas = cv;
    Q = detectQuality();
    API.info.quality = Q.name;
    var prog = opts.onProgress || function () {};
    return Promise.resolve().then(function () {
      R = new T.WebGLRenderer({ canvas: canvas, antialias: !Q.post, powerPreference: 'high-performance', alpha: false, stencil: false });
      R.outputEncoding = T.sRGBEncoding;
      R.toneMapping = Q.post ? T.NoToneMapping : T.ACESFilmicToneMapping;
      R.toneMappingExposure = 1.0;
      R.shadowMap.enabled = true;
      R.shadowMap.type = T.PCFSoftShadowMap;
      R.autoClear = !Q.post;
      if (Q.post && !R.capabilities.isWebGL2) { Q = PRESETS.lite; API.info.quality = 'lite'; R.toneMapping = T.ACESFilmicToneMapping; R.autoClear = true; }
      dprCur = Math.min(root.devicePixelRatio || 1, Q.dprMax);
      R.setPixelRatio(dprCur);
      U.uNoise.value = A.makeNoiseTexture(R);
      U.uWaveTex.value = A.makeWaterNormals(R);
      A.initMaterials();
      return loadFonts();
    }).then(function () {
      A.initBrandMaterials();
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(40, 1, 1.5, 52000);
      skyModel = new A.SkyModel();
      /* lumières */
      sun = new T.DirectionalLight(0xffffff, 3);
      sun.castShadow = true;
      sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.9;
      var sc = sun.shadow.camera; sc.near = 10; sc.far = 4200;
      scene.add(sun); scene.add(sun.target);
      hemi = new T.HemisphereLight(0x8899aa, 0x442211, 0.3);
      scene.add(hemi);
      /* ciel */
      skyMat = A.makeSkyMaterial(false);
      skyMesh = new T.Mesh(new T.SphereGeometry(40000, 48, 24), skyMat);
      skyMesh.renderOrder = -100; skyMesh.frustumCulled = false;
      scene.add(skyMesh);
      envScene = new T.Scene();
      envScene.add(new T.Mesh(new T.SphereGeometry(500, 48, 24), A.makeSkyMaterial(true)));
      envGround = new T.Mesh(new T.CircleGeometry(480, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x331a10 }));
      envGround.position.y = -8; envScene.add(envGround);
      pmrem = new T.PMREMGenerator(R);
      prog(0.12);
      return wait();
    }).then(function () {
      scene.add(W.buildTerrain(Q));
      prog(0.38);
      return wait();
    }).then(function () {
      scene.add(W.buildWater(Q));
      prog(0.48);
      return wait();
    }).then(function () {
      scene.add(W.buildVegetation(Q));
      prog(0.64);
      return wait();
    }).then(function () {
      scene.add(W.buildPort(Q, lights));
      scene.add(W.buildMineSite(Q, lights));
      scene.add(W.buildVillages(Q, lights));
      scene.add(W.buildStreetLights(Q, lights));
      prog(0.74);
      return wait();
    }).then(function () {
      buildFleet();
      buildMarine();
      prog(0.86);
      return wait();
    }).then(function () {
      particles = new Particles(Q.particles);
      scene.add(particles.mesh);
      glows = new GlowSet(lights, false); scene.add(glows.mesh);
      pools = new PoolSet(lights); scene.add(pools.mesh);
      dynGlows = new GlowSet(dyn.map(function (d) { return { p: [0, -100, 0], c: d.c, s: d.s, st: d.st }; }), true); scene.add(dynGlows.mesh);
      routes = seaRoutes([W.JETTY.x1 + 10, W.JETTY.z]); scene.add(routes);
      if (Q.post) post = new A.Post(R, { msaa: Q.msaa, rays: Q.rays, samples: Q.samples || 4 });
      resize(true);
      setSun(14, true);
      computeCamera(0, true);
      applyCamera();
      W.updateVegLOD(camPos, Q.lite ? 260 : 520, Q.lite ? 0 : 650);
      if (R.compile) R.compile(scene, camera);
      prog(0.96);
      return wait();
    }).then(function () {
      API.ready = true;
      API.info.trees = W.vegCount; API.info.houses = W.houseCount; API.info.lights = lights.length;
      running = true;
      lastNow = performance.now();
      requestAnimationFrame(frame);
      prog(1);
    });
  };
  function loadFonts() {
    A.fontFamily = 'Outfit, "Arial Black", Arial, sans-serif';
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var t = new Promise(function (r) { setTimeout(r, 1500); });
    return Promise.race([document.fonts.load('800 100px Outfit'), t]).catch(function () {});
  }

  function buildFleet() {
    /* tombereaux : ROM -> piste minière -> rampe -> fosse (boucle de chargement) -> retour */
    var L2W = W.pitL2W, P = W.PIT, RP = W.RAMP, mr = W.MINEROAD, i, k;
    var center = [];
    for (i = mr.n - 1; i >= 0; i -= 5) center.push([mr.x[i], mr.z[i]]);
    for (k = 1; k <= 14; k++) { var t = k / 14; center.push(L2W(lerp(RP.x0, RP.x1, t), P.hz - lerp(RP.d0, RP.d1, t))); }
    var down = W.offsetPts(center, 4.5);
    var upAll = W.offsetPts(center, -4.5).reverse(), up = [];
    upAll.forEach(function (p) { var l = W.pitW2L(p[0], p[1]); if (!(l[1] < 110 && l[0] < -45)) up.push(p); });
    var floorLoop = [[-110, 73], [-142, 60], [-160, 28], [-156, -10], [-143, -33], [W.LOAD.lx, W.LOAD.lz], [-100, -36], [-72, -14], [-60, 24], [-56, 62], [-50, 83]].map(function (p) { return L2W(p[0], p[1]); });
    var rom = [[-1080, 80], [-1058, 86], [-1046, 76], [-1052, 64], [-1076, 64]];
    var haul = new Track(down.concat(floorLoop, up, rom));
    var LW = L2W(W.LOAD.lx, W.LOAD.lz);
    haul.addStop(LW[0], LW[1], 21, 'load');
    haul.addStop(-1047, 74, 11, 'dump');
    W.haulTrack = haul;
    for (i = 0; i < Q.haul; i++) {
      var m = V.haulTruck(10 + i);
      scene.add(m.g);
      var d = new Driver(haul, m, (i / Q.haul) * haul.L + 30, { vmax: 8.5, gap: 24, kind: 'haul', loaded: i % 2 === 0 });
      drivers.haul.push(d);
      addVehicleLights(m, 6.2);
    }
    /* camions routiers : ROM -> escarpement -> plaine -> port -> retour */
    var rd = W.MAINROAD, cl = [];
    for (i = 0; i < rd.n; i += 5) cl.push([rd.x[i], rd.z[i]]);
    cl.push([rd.x[rd.n - 1], rd.z[rd.n - 1]]);
    var outL = W.offsetPts(cl, 3.6), backL = W.offsetPts(cl, -3.6).reverse();
    var portLoop = [[-192, -124], [-158, -160], [-162, -192], [-200, -198], [-232, -168], [-236, -132], [-224, -108]];
    var romLoop = [[-1030, 8], [-1054, 14], [-1056, 28], [-1036, 32], [-1018, 22]];
    var road = new Track(outL.concat(portLoop, backL, romLoop));
    road.addStop(-1050, 27, 15, 'load');
    road.addStop(-158, -162, 10, 'dump');
    W.roadTrack = road;
    for (i = 0; i < Q.road; i++) {
      var rm = V.roadTruck(40 + i);
      scene.add(rm.g);
      var dd = new Driver(road, rm, (i / Q.road) * road.L + 15, { vmax: 11.5, gap: 18, kind: 'road', loaded: i % 2 === 0, acc: 1.8 });
      drivers.road.push(dd);
      addVehicleLights(rm, 2.4);
    }
    [drivers.haul, drivers.road].forEach(function (list) {
      for (var j = 0; j < list.length; j++) list[j].leader = list[(j + 1) % list.length];
    });
    /* pelle */
    exc = V.excavator();
    var EW = L2W(W.EXC.lx, W.EXC.lz), MW = L2W(W.MUCK.lx, W.MUCK.lz);
    exc.g.position.set(EW[0], W.H(EW[0], EW[1]), EW[1]);
    exc.digYaw = Math.atan2(MW[0] - EW[0], MW[1] - EW[1]);
    exc.g.rotation.y = exc.digYaw;
    var bedP = [LW[0], LW[1]];
    exc.dumpRel = norm(Math.atan2(bedP[0] - EW[0], bedP[1] - EW[1]) - exc.digYaw);
    scene.add(exc.g);
    exc.world = new T.Vector3(EW[0], W.H(EW[0], EW[1]), EW[1]);
    /* chargeuse (ROM) */
    loader = V.loader();
    loader.a = new T.Vector3(-1040, W.ROM.h, 37); loader.b = new T.Vector3(-1046, W.ROM.h, 34.5);
    loader.g.position.copy(loader.a); scene.add(loader.g);
    /* bouteur sur la verse */
    dozer = V.dozer();
    var dc = L2W(W.DUMP.lx, W.DUMP.lz);
    dozer.c = [dc[0], dc[1]]; scene.add(dozer.g);
    /* petits tas de déversement */
    var h1 = W.stockpile(10, 9, 3.2, 1.3); h1.position.set(-1046, W.ROM.h, 95); scene.add(h1);
    var h2 = W.stockpile(8, 8, 2.6, 2.6); h2.position.set(-150, W.PORT.h, -175); scene.add(h2);
  }
  function norm(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function addVehicleLights(m, st) {
    m.heads.forEach(function (h) { dyn.push({ m: m, p: new T.Vector3().fromArray(h), c: [1, 0.88, 0.7], s: 0.9, st: st }); });
    m.tails.forEach(function (h) { dyn.push({ m: m, p: new T.Vector3().fromArray(h), c: [1, 0.12, 0.06], s: 0.45, st: st }); });
    var mat = st > 4 ? (A._beamMine || (A._beamMine = beamMaterial(st))) : (A._beamRoad || (A._beamRoad = beamMaterial(st)));
    var b = beams(m.heads, mat); m.g.add(b); allBeams.push(b);
  }

  function buildMarine() {
    var S = W.SHIP;
    ship = V.bulkCarrier();
    ship.g.position.set(S.x, 0, S.z);
    scene.add(ship.g);
    pushLights(ship.lights, ship.g);
    crane = V.floatingCrane();
    crane.g.position.set(S.x + ship.halfB + 17, 0, S.z + W.SHIPHATCH[2] - 2);
    scene.add(crane.g);
    pushLights(crane.lights, crane.g);
    var bm = V.barge(true, 3); bm.g.position.set(crane.g.position.x + 15 + 12.5, 0, crane.g.position.z + 6); scene.add(bm.g);
    barges.push({ b: bm, moored: true, base: bm.g.position.clone() });
    crane.bargePos = new T.Vector3(bm.g.position.x, 4.5, bm.g.position.z);
    crane.hatchPos = new T.Vector3(S.x, ship.deck + 1.5, S.z + W.SHIPHATCH[2]);
    tanker = V.bunkerTanker();
    tanker.g.position.set(S.x - ship.halfB - tanker.halfB - 3.4, 0, S.z - 52);
    tanker.g.rotation.y = Math.PI;
    scene.add(tanker.g);
    pushLights(tanker.lights, tanker.g);
    /* défenses Yokohama entre les navires */
    for (var i = 0; i < 2; i++) {
      var f = new T.Mesh(A.paint(new T.CylinderGeometry(1.7, 1.7, 6, 14).rotateX(Math.PI / 2), '#ffffff'), A.M.black);
      f.position.set(S.x - ship.halfB - 1.7, 0.8, S.z - 70 + i * 34); f.castShadow = true; scene.add(f);
    }
    /* flexible de soutage (caténaire) */
    tanker.g.updateMatrixWorld(true);
    var tip = new T.Vector3().fromArray(tanker.hoseTip); tanker.g.localToWorld(tip);
    var dst = new T.Vector3(S.x - ship.halfB + 2.5, ship.deck + 1.4, tip.z);
    var mid1 = new T.Vector3(lerp(tip.x, dst.x, 0.35), Math.min(tip.y, dst.y) - 4.5, tip.z);
    var mid2 = new T.Vector3(lerp(tip.x, dst.x, 0.7), Math.min(tip.y, dst.y) - 2.5, tip.z);
    var hoseC = new T.CatmullRomCurve3([new T.Vector3(tip.x, tip.y - 0.5, tip.z), mid1, mid2, dst, new T.Vector3(dst.x + 3, ship.deck + 0.6, dst.z)]);
    var hose = new T.Mesh(A.paint(new T.TubeGeometry(hoseC, 40, 0.28, 8, false), '#ffffff'), A.M.black);
    hose.castShadow = true; scene.add(hose);
    var tankerTop = new T.Vector3(); tanker.g.localToWorld(tankerTop.set(-1, tanker.deck + 1.2, 0));
    var hose2 = new T.Mesh(A.paint(new T.TubeGeometry(new T.CatmullRomCurve3([tankerTop, new T.Vector3(tankerTop.x + 1, tankerTop.y + 1.5, tankerTop.z), new T.Vector3(tip.x, tip.y + 0.2, tip.z)]), 20, 0.22, 6, false), '#ffffff'), A.M.black);
    scene.add(hose2);
    /* barge en chargement à l'appontement + convoi barge/pousseur en transit */
    var bj = V.barge(true, 7); bj.g.position.set(W.JETTY.x1 - 30, 0, W.JETTY.z - W.JETTY.w / 2 - 12.5); bj.g.rotation.y = Math.PI / 2; scene.add(bj.g);
    barges.push({ b: bj, moored: true, base: bj.g.position.clone() });
    var route = [[260, -110], [600, -150], [1000, -110], [1380, -10], [1560, 70], [1640, 30], [1560, -20], [1200, -60], [800, -60], [420, -90]];
    var tr = new Track(route);
    for (i = 0; i < 2; i++) {
      var bg = V.barge(i === 0, 11 + i), tg = V.tug();
      scene.add(bg.g); scene.add(tg.g);
      pushLights(tg.lights, tg.g);
      barges.push({ b: bg, tug: tg, tr: tr, s: i * tr.L * 0.5, v: 3.4 });
    }
    /* pirogues */
    for (i = 0; i < 14; i++) {
      var pr = V.pirogue(100 + i), ang = rnd() * Math.PI * 2;
      var cx = i < 8 ? 300 + rnd() * 700 : 180 + rnd() * 260, cz = i < 8 ? 300 + rnd() * 900 : 520 + rnd() * 260;
      pr.g.position.set(cx, 0, cz); pr.g.rotation.y = ang; scene.add(pr.g);
      pirogues.push({ p: pr, cx: cx, cz: cz, r: 30 + rnd() * 120, w: (rnd() < 0.5 ? -1 : 1) * (0.008 + rnd() * 0.01), a: ang, ph: rnd() * 6 });
    }
    /* plateforme */
    var plat = V.platform();
    plat.g.position.set(W.RIG.x, 0, W.RIG.z); plat.g.rotation.y = Math.PI / 2 - 0.35;
    scene.add(plat.g);
    plat.g.updateMatrixWorld(true);
    pushLights(plat.lights, plat.g);
    var ft = new T.Vector3().fromArray(plat.flareTip); plat.g.localToWorld(ft);
    flare = flareMesh([ft.x, ft.y, ft.z]); scene.add(flare);
    flareLight = new T.PointLight(0xff7a2a, 1, 320, 1.6); flareLight.position.copy(ft); scene.add(flareLight);
    W.flarePos = ft;
    W.platform = plat;
  }
  function pushLights(list, obj) {
    obj.updateMatrixWorld(true);
    var v = new T.Vector3();
    list.forEach(function (L) {
      v.fromArray(L.p); obj.localToWorld(v);
      lights.push({ p: [v.x, v.y, v.z], c: L.c, s: L.s, st: L.st, blink: L.blink, ph: L.ph, pool: L.pool });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Animation des engins                                                 */
  /* ------------------------------------------------------------------ */
  /* cycle de la pelle (12 s) : [temps, rotation, flèche, balancier, godet] */
  var EXC_KF = [[0, 0, 0.02, 0.95, -0.55], [2.6, 0, -0.08, 0.2, 1.25], [4.2, 0.15, 0.42, 0.42, 1.2], [6.6, 1, 0.5, 0.52, 1.15], [7.5, 1, 0.48, 0.74, -0.62], [8.6, 1, 0.42, 0.7, -0.4], [11.2, 0.05, 0.08, 0.92, -0.5], [12, 0, 0.02, 0.95, -0.55]];
  function kf(tab, t, period) {
    t = ((t % period) + period) % period;
    for (var i = 0; i < tab.length - 1; i++) {
      var a = tab[i], b = tab[i + 1];
      if (t >= a[0] && t <= b[0]) {
        var f = (t - a[0]) / (b[0] - a[0]); f = f * f * (3 - 2 * f);
        var out = [];
        for (var k = 1; k < a.length; k++) out.push(a[k] + (b[k] - a[k]) * f);
        return out;
      }
    }
    return tab[0].slice(1);
  }
  var excPrev = 0, ldPrev = 0, crPrev = 0, _v1 = new T.Vector3(), _v2 = new T.Vector3();
  function animMachines(dt) {
    var i, d;
    /* circulation */
    ['haul', 'road'].forEach(function (k) {
      var list = drivers[k];
      for (var j = 0; j < list.length; j++) {
        d = list[j];
        d.update(dt); d.dtLast = dt; d.place();
        if (dt > 0 && d.v > 1.2) {
          d.emitAcc += dt * d.v * (k === 'haul' ? 0.75 : 0.55);
          while (d.emitAcc > 1) {
            d.emitAcc -= 1;
            var side = rnd() < 0.5 ? -1 : 1, mm = d.m, back = -mm.len * 0.38, sx = mm.wid * 0.38 * side;
            mm.g.localToWorld(_v1.set(sx, 0.5, back));
            var sp = d.v * 0.25;
            particles.emit(_v1.x, _v1.y, _v1.z, -d.dir.x * sp + (rnd() - 0.5) * 1.5, 0.6 + rnd() * 0.8, -d.dir.z * sp + (rnd() - 0.5) * 1.5,
              k === 'haul' ? 3.2 : 2.4, 3.2, 4.5 + rnd() * 3, 0.24, rnd() < 0.5 ? DUST : DUST2, 1, 0.9, 0.25);
          }
        }
        if (d.tilt > 0.5 && dt > 0 && rnd() < 0.7) {
          d.m.g.localToWorld(_v1.set((rnd() - 0.5) * d.m.wid * 0.6, 1.5, -d.m.len * 0.55));
          particles.emit(_v1.x, _v1.y, _v1.z, (rnd() - 0.5) * 2, 0.8 + rnd() * 1.5, (rnd() - 0.5) * 2, 3.5, 3.4, 4 + rnd() * 2, 0.34, DUST2, 1, 1.0, 0.3);
        }
      }
    });
    /* pelle */
    var et = time % 12, kv = kf(EXC_KF, et, 12);
    exc.up.rotation.y = kv[0] * exc.dumpRel;
    exc.boom.rotation.x = -kv[1];
    exc.stick.rotation.x = kv[2];
    exc.bucket.rotation.x = kv[3];
    exc.load.visible = et > 2.4 && et < 7.6;
    if (dt > 0 && ((excPrev < 2.0 && et >= 2.0) || (excPrev < 7.45 && et >= 7.45))) {
      exc.bucket.getWorldPosition(_v1);
      for (i = 0; i < 26; i++) particles.emit(_v1.x + (rnd() - 0.5) * 3, _v1.y - 1, _v1.z + (rnd() - 0.5) * 3, (rnd() - 0.5) * 2.5, rnd() * 1.6, (rnd() - 0.5) * 2.5, 3.6 + rnd() * 2, 2.6, 3.5 + rnd() * 2.5, 0.36, DUST2, 1, 1.1, 0.3);
    }
    excPrev = et;
    exc.g.updateMatrixWorld(true);
    for (i = 0; i < exc.hyd.length; i++) exc.hyd[i].update();
    /* chargeuse : va-et-vient tas -> camion */
    var lt = time % 14, lp = lt < 5 ? 0 : lt < 7 ? sm(5, 7, lt) : lt < 10 ? 1 : 1 - sm(10, 13.5, lt);
    loader.g.position.lerpVectors(loader.a, loader.b, lp);
    loader.g.rotation.y = Math.PI + 0.35 + lp * 0.9;
    loader.arm.rotation.x = -lerp(0.15, 0.95, sm(5.5, 8, lt) * (1 - sm(10.5, 12.5, lt)));
    loader.bucket.rotation.x = lt > 8.2 && lt < 10 ? -0.9 : 0.15;
    loader.load.visible = lt > 1 && lt < 8.4;
    if (dt > 0 && ldPrev < 8.3 && lt >= 8.3) { loader.bucket.getWorldPosition(_v1); for (i = 0; i < 16; i++) particles.emit(_v1.x, _v1.y - 0.5, _v1.z, (rnd() - 0.5) * 2, rnd(), (rnd() - 0.5) * 2, 2.6, 2.6, 3 + rnd() * 2, 0.3, DUST2, 1, 1.0, 0.3); }
    ldPrev = lt;
    for (i = 0; i < loader.wheels.length; i++) loader.wheels[i].rotation.x += (lt > 5 && lt < 7 ? 1 : lt > 10 && lt < 13.5 ? -1 : 0) * dt * 1.6;
    /* bouteur : poussée aller-retour au sommet de la verse */
    var dz = Math.sin(time * 0.16), dx = W.pitL2W(W.DUMP.lx + dz * 55, W.DUMP.lz + 8);
    var dy = W.H(dx[0], dx[1]);
    dozer.g.position.set(dx[0], dy, dx[1]);
    dozer.g.rotation.y = W.PIT.rot + Math.PI / 2 + (Math.cos(time * 0.16) > 0 ? 0 : Math.PI);
    if (dt > 0 && Math.abs(Math.cos(time * 0.16)) > 0.3 && rnd() < 0.5) { dozer.g.localToWorld(_v1.set(0, 0.8, 3.4)); particles.emit(_v1.x, _v1.y, _v1.z, (rnd() - 0.5), 0.6, (rnd() - 0.5), 2.4, 2.8, 3.5, 0.22, DUST, 1, 1.0, 0.25); }
    /* grue flottante : benne preneuse barge -> cale */
    var ct = time % 20, slew, gy, open;
    var phase = ct < 3 ? 0 : ct < 4.5 ? 1 : ct < 9 ? 2 : ct < 11 ? 3 : ct < 16 ? 4 : 5;
    var aB = 0, aH = Math.PI * 0.96;
    if (phase === 0) { slew = aB; gy = lerp(-14, -26, sm(0, 3, ct)); open = 1 - sm(2.2, 3, ct); }
    else if (phase === 1) { slew = aB; gy = -26 + sm(3, 4.5, ct) * 4; open = 0; }
    else if (phase === 2) { slew = lerp(aB, aH, sm(4.5, 9, ct)); gy = lerp(-22, -12, sm(4.5, 7, ct)); open = 0; }
    else if (phase === 3) { slew = aH; gy = lerp(-12, -16, sm(9, 10, ct)); open = sm(9.6, 10.4, ct); }
    else if (phase === 4) { slew = lerp(aH, aB, sm(11, 16, ct)); gy = lerp(-16, -14, sm(11, 16, ct)); open = 1; }
    else { slew = aB; gy = -14; open = 1; }
    crane.slew.rotation.y = -Math.PI / 2 + slew;
    var tip = crane.tip;
    crane.grab.position.set(0, tip[1] + 2.3 + gy, tip[2]);
    var cl = Math.max(0.5, -gy - 1.6);
    crane.cable.scale.set(1, cl, 1);
    crane.halves[0].rotation.x = -open * 0.9; crane.halves[1].rotation.x = open * 0.9;
    crane.load.visible = phase >= 1 && phase <= 3 && open < 0.5;
    if (dt > 0 && crPrev < 10.0 && ct >= 10.0) { crane.grab.getWorldPosition(_v1); for (i = 0; i < 30; i++) particles.emit(_v1.x + (rnd() - 0.5) * 3, _v1.y - 1, _v1.z + (rnd() - 0.5) * 3, (rnd() - 0.5) * 3, rnd() * 1.4, (rnd() - 0.5) * 3, 4 + rnd() * 3, 3, 4 + rnd() * 3, 0.34, DUST2, 1, 1.0, 0.25); }
    crPrev = ct;
    /* houle sur les navires */
    ship.g.rotation.z = Math.sin(time * 0.31) * 0.004; ship.g.rotation.x = Math.sin(time * 0.23 + 1) * 0.002; ship.g.position.y = Math.sin(time * 0.4) * 0.12;
    tanker.g.rotation.z = Math.sin(time * 0.5 + 2) * 0.009; tanker.g.position.y = Math.sin(time * 0.55) * 0.18;
    crane.g.rotation.z = Math.sin(time * 0.45 + 1.4) * 0.006; crane.g.position.y = Math.sin(time * 0.5 + 0.4) * 0.2;
    for (i = 0; i < barges.length; i++) {
      var B = barges[i];
      if (B.moored) { B.b.g.position.y = B.base.y + Math.sin(time * 0.6 + i) * 0.16; continue; }
      B.s = (B.s + B.v * dt) % B.tr.L;
      var p = B.tr.pos(B.s, _p1), f = B.tr.pos(B.s + 6, _p2), ddx = f.x - p.x, ddz = f.z - p.z, ll = Math.hypot(ddx, ddz) || 1; ddx /= ll; ddz /= ll;
      var yaw = Math.atan2(ddx, ddz);
      B.b.g.position.set(p.x, Math.sin(time * 0.7 + i) * 0.15, p.z); B.b.g.rotation.y = yaw;
      B.tug.g.position.set(p.x - ddx * 57, Math.sin(time * 0.9 + i) * 0.2, p.z - ddz * 57); B.tug.g.rotation.y = yaw;
      if (dt > 0 && rnd() < 0.5) { B.tug.g.localToWorld(_v1.set((rnd() - 0.5) * 6, 0.2, -13)); particles.emit(_v1.x, 0.3, _v1.z, 0, 0.1, 0, 2.5, 4, 5, 0.18, [0.55, 0.58, 0.58], 0.6, 1.5, 0.02); }
    }
    for (i = 0; i < pirogues.length; i++) {
      var pg = pirogues[i]; pg.a += pg.w * dt;
      pg.p.g.position.set(pg.cx + Math.cos(pg.a) * pg.r, Math.sin(time * 1.3 + pg.ph) * 0.12, pg.cz + Math.sin(pg.a) * pg.r);
      pg.p.g.rotation.y = -pg.a + (pg.w > 0 ? 0 : Math.PI);
      pg.p.g.rotation.z = Math.sin(time * 1.1 + pg.ph) * 0.05;
    }
    /* poussière d'ambiance (vent sur la fosse et la verse) + fumées */
    if (dt > 0) {
      if (rnd() < 0.18) { var q = W.pitL2W((rnd() - 0.5) * 520, (rnd() - 0.5) * 240); particles.emit(q[0], W.H(q[0], q[1]) + 2, q[1], wind[0], 0.3, wind[2], 12 + rnd() * 10, 1.6, 12 + rnd() * 6, 0.07, DUST, 1, 0.3, 0.15); }
      if (rnd() < 0.12) { particles.emit(W.flarePos.x + (rnd() - 0.5) * 3, W.flarePos.y + 25, W.flarePos.z, 4, 2.4, 2.4, 4, 7, 9, 0.035, [0.16, 0.15, 0.14], 0.5, 0.35, 0.45); }
      if (rnd() < 0.3) { var lw2 = W.LOADER; particles.emit(lw2[0], lw2[1] - 4, lw2[2], (rnd() - 0.5), 0.4, (rnd() - 0.5), 2.5, 3, 4, 0.22, DUST2, 1, 1.0, 0.2); }
    }
    /* feux des véhicules */
    var P = dynGlows.P;
    for (i = 0; i < dyn.length; i++) { var dl = dyn[i]; dl.m.g.localToWorld(_v2.copy(dl.p)); P[i * 3] = _v2.x; P[i * 3 + 1] = _v2.y; P[i * 3 + 2] = _v2.z; }
    dynGlows.aP.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Caméra : vues d'accueil + stations du voyage                          */
  /* ------------------------------------------------------------------ */
  var ST = { pos: new T.Vector3(), look: new T.Vector3(), fov: 40, focus: new T.Vector3(), ext: 200 };
  var STB = { pos: new T.Vector3(), look: new T.Vector3(), fov: 40, focus: new T.Vector3(), ext: 200 };
  var trackPick = null;
  function setv(o, px, py, pz, lx, ly, lz, fov, ext) { o.pos.set(px, py, pz); o.look.set(lx, ly, lz); o.fov = fov; o.focus.set(lx, ly, lz); o.ext = ext; return o; }
  function station(i, t, o) {
    var E = exc.world, a, d, f, r, p;
    switch (i) {
      case 0:
        if (heroMode === 'excavator') { a = -1.0 + Math.sin(t * 0.05) * 0.2; return setv(o, E.x + Math.cos(a) * 48, E.y + 13, E.z + Math.sin(a) * 48, E.x - 5, E.y + 4, E.z + 5, 38, 90); }
        if (heroMode === 'follow') {
          d = drivers.haul[0]; p = d.wpos; f = d.dir;
          return setv(o, p.x - f.x * 26 - f.z * 9, p.y + 11, p.z - f.z * 26 + f.x * 9, p.x + f.x * 12, p.y + 3, p.z + f.z * 12, 42, 110);
        }
        a = 2.35 + t * 0.011 + dragYaw;
        r = 440; var hh = clamp(150 + dragPitch * 160, 70, 480);
        setv(o, W.PIT.cx + Math.cos(a) * r, 30 + hh, W.PIT.cz + 20 + Math.sin(a) * r, W.PIT.cx + 40, 16, W.PIT.cz - 10, 40, 420);
        o.focus.set(W.PIT.cx + 80, 20, W.PIT.cz); o.ext = 470;
        if (introT < 1) { var e = A.ease(introT); o.pos.lerpVectors(_introFrom, o.pos, e); o.look.lerpVectors(_introLook, o.look, e); }
        return o;
      case 1:
        a = -1.2 + Math.sin(t * 0.045) * 0.12;
        return setv(o, E.x + Math.cos(a) * 55, E.y + 15, E.z + Math.sin(a) * 55, E.x - 6, E.y + 4, E.z + 6, 38, 100);
      case 2:
        d = pickRoadTruck();
        p = d.wpos; f = d.dir; r = [-f.z, f.x];
        return setv(o, p.x + r[0] * 11 + f.x * 21, p.y + 3.4, p.z + r[1] * 11 + f.z * 21, p.x + f.x * 2, p.y + 2.3, p.z + f.z * 2, 40, 140);
      case 3:
        a = Math.sin(t * 0.04) * 0.06;
        var cx = crane.g.position.x, cz = crane.g.position.z;
        return setv(o, cx + 190 + a * 120, 54, cz + 122 + a * 60, cx - 30, 9, cz - 12, 40, 230);
      case 4:
        var tx = tanker.g.position.x, tz = tanker.g.position.z;
        a = Math.sin(t * 0.05) * 0.08;
        return setv(o, tx - 125 + a * 40, 19, tz - 70 + a * 60, tx + 12, 9, tz + 6, 40, 230);
      case 5:
        var rx = W.RIG.x, rz = W.RIG.z;
        a = Math.sin(t * 0.04) * 0.05;
        setv(o, rx - 255 + a * 60, 21, rz - 95 + a * 40, rx + 4, 38, rz + 2, 40, 180);
        o.focus.set(rx, 20, rz);
        return o;
      case 6:
        a = t * 0.006;
        setv(o, 1180 + Math.sin(a) * 60, 360, -760 + Math.cos(a) * 40, -470, 10, 90, 42, 1500);
        o.focus.set(-200, 0, 0);
        return o;
      default:
        a = t * 0.005;
        setv(o, -240 + Math.sin(a) * 40, 230, -330, 2600, 40, 250, 44, 1500);
        o.focus.set(800, 0, 0);
        return o;
    }
  }
  var _introFrom = new T.Vector3(-300, 1500, 1400), _introLook = new T.Vector3(-1000, 0, -100);
  function pickRoadTruck() {
    var list = drivers.road, rd = W.MAINROAD;
    if (trackPick && trackPick.v > 0.5) {
      var w = trackPick.wpos;
      if (w.x > -980 && w.x < -320) return trackPick;
    }
    var best = null, bs = -1e9;
    for (var i = 0; i < list.length; i++) {
      var d = list[i], x = d.wpos.x;
      if (x < -950 || x > -500 || d.stopT > 0) continue;
      var heading = d.dir.x;
      var score = (heading > 0 ? 100 : 0) - Math.abs(x + 840) * 0.1 + (d.loaded > 0.5 ? 40 : 0);
      if (score > bs) { bs = score; best = d; }
    }
    trackPick = best || trackPick || list[0];
    return trackPick;
  }
  var _ta = new T.Vector3(), _tb = new T.Vector3(), _up = new T.Vector3(0, 1, 0);
  var CAM = { pos: new T.Vector3(), look: new T.Vector3(), fov: 40, focus: new T.Vector3(), ext: 300 };
  function computeCamera(dtr, snap) {
    var s = story;
    if (s < 0.001) { station(0, time, CAM); }
    else {
      var i = Math.floor(s), fr = s - i;
      if (i >= 7) { station(7, time, CAM); }
      else {
        station(i, time, ST);
        var e = i === 6 ? A.ease(sm(0.45, 0.88, fr)) : A.ease(sm(0.16, 0.84, fr));
        if (e <= 0) { copyCam(CAM, ST); }
        else {
          station(i + 1, time, STB);
          if (e >= 1) copyCam(CAM, STB);
          else {
            var dist = ST.pos.distanceTo(STB.pos), arc = clamp(dist * 0.2, 0, 380) * Math.sin(Math.PI * e);
            CAM.pos.lerpVectors(ST.pos, STB.pos, e); CAM.pos.y += arc;
            /* regard anticipé vers la destination, relevé pendant le vol (plan de drone) */
            var e2 = A.ease(Math.min(1, e * 1.35));
            CAM.look.lerpVectors(ST.look, STB.look, e2);
            CAM.look.y += arc * 0.55;
            CAM.fov = lerp(ST.fov, STB.fov, e);
            CAM.focus.lerpVectors(ST.focus, STB.focus, e);
            CAM.ext = lerp(ST.ext, STB.ext, e) + arc * 0.8;
          }
        }
      }
    }
    if (snap || camFirst) { camPos.copy(CAM.pos); camLook.copy(CAM.look); camFov = CAM.fov; camFirst = false; }
    else {
      var k = 1 - Math.exp(-dtr * (story > 0.001 ? 5.5 : heroMode === 'follow' ? 3.2 : 2.4));
      camPos.lerp(CAM.pos, k); camLook.lerp(CAM.look, k); camFov = lerp(camFov, CAM.fov, k);
    }
    /* ne jamais passer sous le terrain */
    var gh = W.H(camPos.x, camPos.z);
    if (camPos.y < gh + 3) camPos.y = gh + 3;
    if (camPos.y < 2.5) camPos.y = 2.5;
  }
  function copyCam(a, b) { a.pos.copy(b.pos); a.look.copy(b.look); a.fov = b.fov; a.focus.copy(b.focus); a.ext = b.ext; }
  function applyCamera() {
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    /* plan proche dynamique : précision de profondeur maximale en vue aérienne */
    var agl = camPos.y - Math.max(0, W.H(camPos.x, camPos.z));
    var nearP = clamp(agl * 0.035, 0.8, 7);
    if (Math.abs(camera.near - nearP) > 0.05) { camera.near = nearP; camera.updateProjectionMatrix(); }
    var portrait = lw < lh;
    var fov = camFov * (portrait ? 1.32 : lw < 900 ? 1.12 : 1);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    /* décalage optique : le sujet se place à côté des cartes d'activités */
    var inCards = story > 0.7 && story < 5.45 ? 1 : 0, wide = lw > 860;
    var inHero = story < 0.3 ? 1 : 0;
    var tx = (inCards || (inHero && heroMode !== 'orbit')) && wide ? 0.13 : (inHero && wide ? 0.07 : 0), ty = inCards && !wide ? 0.16 : 0;
    lensX += (tx - lensX) * 0.08; lensY += (ty - lensY) * 0.08;
    if (Math.abs(lensX) > 0.002 || Math.abs(lensY) > 0.002) camera.setViewOffset(lw, lh, -lensX * lw, lensY * lh, lw, lh);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    skyMesh.position.copy(camPos);
    /* ombres : cadrage serré autour du point d'intérêt, aligné sur les texels */
    var ext = clamp(CAM.ext, 60, 1900), sc = sun.shadow.camera;
    if (Math.abs(sc.right - ext) > 1) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    var texel = 2 * ext / Q.shadow, f = CAM.focus;
    var ldir = _ta.copy(lightDir);
    var m = _lm.lookAt(ldir, _zero, _up), mi = _lmi.copy(m).invert();
    var lp = _tb.copy(f).applyMatrix4(mi);
    lp.x = Math.round(lp.x / texel) * texel; lp.y = Math.round(lp.y / texel) * texel;
    lp.applyMatrix4(m);
    sun.target.position.copy(lp);
    sun.position.copy(lp).addScaledVector(ldir, 2000);
    sun.target.updateMatrixWorld();
    var nb = U.uNightK.value;
    sun.shadow.normalBias = 0.3 + texel * (2.6 + nb * 6);
    sun.shadow.bias = -0.0003 - nb * 0.0015;
  }
  var _lm = new T.Matrix4(), _lmi = new T.Matrix4(), _zero = new T.Vector3(), lensX = 0, lensY = 0;

  /* hauteur du soleil selon l'avancée du récit */
  var ELEV = [[0, 13], [1, 11.5], [2, 10], [3, 7.5], [4, 5.2], [5, 2.4], [6, -1.4], [6.5, -5.2], [7, -7.8]];
  function elevFor(s) {
    for (var i = 0; i < ELEV.length - 1; i++) if (s <= ELEV[i + 1][0]) { var a = ELEV[i], b = ELEV[i + 1]; return lerp(a[1], b[1], (s - a[0]) / (b[0] - a[0])); }
    return ELEV[ELEV.length - 1][1];
  }

  /* ------------------------------------------------------------------ */
  /* Boucle                                                               */
  /* ------------------------------------------------------------------ */
  function resize(force) {
    var w = canvas.clientWidth | 0, h = canvas.clientHeight | 0;
    if (!w || !h) return;
    if (!force && w === lw && h === lh) return;
    lw = w; lh = h;
    R.setPixelRatio(dprCur);
    R.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (post) post.setSize(Math.round(w * dprCur), Math.round(h * dprCur));
    U.uViewH.value = h * dprCur;
    U.uLightPx.value = 2.6 * dprCur;
  }
  function adaptResolution(ft) {
    ftAvg = ftAvg * 0.94 + ft * 0.06;
    var now = performance.now();
    if (now - lastResizeT < 2500 || frameN < 90) return;
    var target = dprCur;
    if (ftAvg > 24 && dprCur > Q.dprMin) target = Math.max(Q.dprMin, dprCur * 0.85);
    else if (ftAvg < 13 && dprCur < Math.min(root.devicePixelRatio || 1, Q.dprMax)) target = Math.min(Math.min(root.devicePixelRatio || 1, Q.dprMax), dprCur * 1.12);
    if (Math.abs(target - dprCur) > 0.02) { dprCur = target; lastResizeT = now; resize(true); }
  }
  var _sunNDC = new T.Vector3(), _sunUV = new T.Vector2(), _rc = new T.Color();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    var dtr = Math.min((now - lastNow) / 1000, 0.06);
    lastNow = now;
    if (!active) return;
    frameN++;
    adaptResolution(dtr * 1000);
    var reduce = API.reducedMotion;
    var dt = debugFreeze ? 0 : (reduce ? dtr * 0.35 : dtr);
    time += dt;
    U.uTime.value = time;
    if (introT < 1) introT = Math.min(1, introT + dtr / 5.5);
    resize(false);
    /* récit : lissage du défilement */
    var ks = 1 - Math.exp(-dtr * (reduce ? 20 : 3.2));
    story += (storyTarget - story) * ks;
    if (Math.abs(storyTarget - story) < 0.0005) story = storyTarget;
    dragYaw += dragYawV * dtr; dragYawV *= Math.exp(-dtr * 2.5);
    /* soleil */
    var el = elevFor(story);
    if (Math.abs(el - curElev) > 0.02) setSun(el, false);
    U.uStage.value = clamp((story - 6.02) / 0.46, 0, 1) * 10;
    if (routes) routes.userData.mat.uniforms.uLvl.value = clamp((story - 6.62) / 0.34, 0, 1);
    /* engins + particules */
    animMachines(dt);
    particles.update(dt, wind);
    if (flareLight) flareLight.intensity *= 0.92 + 0.16 * Math.random();
    /* caméra */
    computeCamera(dtr, false);
    applyCamera();
    if (frameN % 6 === 0) W.updateVegLOD(camPos, Q.lite ? 260 : 520, Q.lite ? 0 : 650);
    /* rendu */
    if (post) {
      var night = U.uNight.value;
      _sunNDC.copy(U.uSunDir.value).multiplyScalar(30000).add(camPos).project(camera);
      var inView = _sunNDC.z < 1 && Math.abs(_sunNDC.x) < 1.3 && Math.abs(_sunNDC.y) < 1.3 ? 1 : 0;
      _sunUV.set(_sunNDC.x * 0.5 + 0.5, _sunNDC.y * 0.5 + 0.5);
      var vis = inView * sm(-1, 3, curElev) * (1 - sm(0.9, 1.3, Math.max(Math.abs(_sunNDC.x), Math.abs(_sunNDC.y))));
      _rc.copy(sun.color);
      post.render(scene, camera, {
        bloom: lerp(0.05, 0.16, night) + vis * 0.03,
        exposure: lerp(1.0, 2.3, sm(0, -8, curElev)) * lerp(1, 1.08, sm(6, 1, curElev)),
        rays: vis * 0.7, raysCol: _rc, sunUV: _sunUV, time: time,
        vig: 0.32, grain: 0.012, sat: lerp(1.04, 0.95, night), contrast: lerp(1.05, 1.03, night),
        tint: [lerp(1.035, 0.95, night), lerp(1.0, 0.97, night), lerp(0.95, 1.06, night)],
        shadowTint: [lerp(0.95, 0.72, night), lerp(0.99, 0.86, night), lerp(1.05, 1.28, night)]
      });
    } else {
      R.toneMappingExposure = lerp(1.0, 2.4, sm(0, -9, curElev));
      R.render(scene, camera);
    }
  }

  /* ------------------------------------------------------------------ */
  /* API publique                                                         */
  /* ------------------------------------------------------------------ */
  API.setStory = function (s) { storyTarget = clamp(s, 0, 7); };
  API.setHeroMode = function (m) { heroMode = m; if (m !== 'orbit') introT = 1; };
  API.setActive = function (a) { active = !!a; if (active) lastNow = performance.now(); };
  API.drag = function (dx, dy) { dragYawV += dx * 0.0022; dragPitch = clamp(dragPitch - dy * 0.0016, -0.6, 1.2); introT = 1; };
  API.reducedMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  API.debug = {
    scene: function () { return scene; },
    particles: function () { return particles; },
    goto: function (s, t) { storyTarget = story = s; if (t !== undefined) time = t; introT = 1; setSun(elevFor(s), true); computeCamera(0, true); applyCamera(); W.updateVegLOD(camPos, Q.lite ? 260 : 520, Q.lite ? 0 : 650); },
    freeze: function (b) { debugFreeze = !!b; },
    hero: function (m) { heroMode = m; introT = 1; computeCamera(0, true); },
    advance: function (sec) { var n = Math.round(sec * 30); for (var i = 0; i < n; i++) { time += 1 / 30; U.uTime.value = time; animMachines(1 / 30); particles.update(1 / 30, wind); } computeCamera(0, true); applyCamera(); },
    state: function () { return { story: story, elev: curElev, dpr: dprCur, ft: ftAvg, q: Q.name, cam: camPos.toArray().map(Math.round), calls: R.info.render.calls, tris: R.info.render.triangles }; },
    sunAt: function (e) { setSun(e, true); },
    /* mesure synchrone du coût de rendu (ms/image) */
    bench: function (n) {
      n = n || 20;
      var gl = R.getContext(), px = new Uint8Array(4);
      function run() { var t = performance.now(); for (var i = 0; i < n; i++) { if (post) post.render(scene, camera, { bloom: 0.05, exposure: 1, rays: 0, sunUV: _sunUV, time: 0, vig: 0.3, grain: 0.01, sat: 1, contrast: 1 }); else R.render(scene, camera); } gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return (performance.now() - t) / n; }
      run();
      var out = { full: run() };
      var sm0 = R.shadowMap.autoUpdate; R.shadowMap.autoUpdate = false; out.noShadowUpdate = run(); R.shadowMap.autoUpdate = sm0;
      var veg = []; scene.traverse(function (o) { if (o.isInstancedMesh) { veg.push(o); } });
      veg.forEach(function (o) { o.visible = false; }); out.noInstanced = run(); veg.forEach(function (o) { o.visible = true; });
      var pp = post; post = null; out.noPost = run(); post = pp;
      var terr = [], water = []; scene.traverse(function (o) { if (o.isMesh && o.material && o.material.customProgramCacheKey) { var key = o.material.customProgramCacheKey(); if (key === 'aos-terrain') terr.push(o); if (key === 'aos-water') water.push(o); } });
      terr.forEach(function (o) { o.visible = false; }); out.noTerrain = run(); terr.forEach(function (o) { o.visible = true; });
      water.forEach(function (o) { o.visible = false; }); out.noWater = run(); water.forEach(function (o) { o.visible = true; });
      if (post) { var s0 = post.rt.samples; post.rt.samples = 0; post.rt.dispose(); out.noMSAA = run(); post.rt.samples = 2; post.rt.dispose(); out.msaa2 = run(); post.rt.samples = s0; post.rt.dispose(); }
      R.info.autoReset = false; R.info.reset(); R.render(scene, camera); out.calls = R.info.render.calls; out.tris = R.info.render.triangles; R.info.autoReset = true;
      out.w = lw; out.h = lh; out.dpr = dprCur;
      return out;
    },
    cam: function (p, l, fov) { camPos.fromArray(p); camLook.fromArray(l); if (fov) camFov = fov; CAM.focus.fromArray(l); CAM.ext = 400; debugFreeze = true; applyCamera(); _camLock = true; }
  };
  var _camLock = false;
  var _computeCamera = computeCamera;
  computeCamera = function (dtr, snap) { if (_camLock) return; _computeCamera(dtr, snap); };
})(window);
