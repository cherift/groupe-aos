/* =====================================================================
   Groupe AOS — moteur 3D · 1/4 · noyau
   Utilitaires, bruit, géométrie, textures procédurales, shaders
   (ciel physique, brume aérienne, terrain, eau, végétation) et
   post-traitement HDR (bloom, rayons, tone mapping, étalonnage).
   Aucune ressource externe : tout est généré au chargement.
   ===================================================================== */
(function (root) {
  'use strict';
  var T = root.THREE;
  if (!T) return;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;

  var A = root.AOSX = {};
  A.T = T;

  /* ------------------------------------------------------------------ */
  /* Maths                                                               */
  /* ------------------------------------------------------------------ */
  A.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  A.lerp = function (a, b, t) { return a + (b - a) * t; };
  A.smooth = function (e0, e1, x) {
    var t = (x - e0) / (e1 - e0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  };
  A.ease = function (t) { t = A.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  A.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  A.col = function (hex) { return new T.Color(hex); };

  /* ------------------------------------------------------------------ */
  /* Bruit de Perlin 2D (terrain) + version périodique (textures)        */
  /* ------------------------------------------------------------------ */
  var PERM = new Uint8Array(512);
  (function () {
    var r = A.rng(1337), p = [], i;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) PERM[i] = p[i & 255];
  })();
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function grad(h, x, y) {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  }
  A.noise = function (x, y) {
    var X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y; X &= 255; Y &= 255;
    var u = fade(x), v = fade(y);
    var aa = PERM[PERM[X] + Y], ab = PERM[PERM[X] + Y + 1], ba = PERM[PERM[X + 1] + Y], bb = PERM[PERM[X + 1] + Y + 1];
    var g1 = grad(aa, x, y), g2 = grad(ba, x - 1, y), g3 = grad(ab, x, y - 1), g4 = grad(bb, x - 1, y - 1);
    var l1 = g1 + u * (g2 - g1), l2 = g3 + u * (g4 - g3);
    return (l1 + v * (l2 - l1)) * 0.72;
  };
  A.fbm = function (x, y, o) {
    var s = 0, a = 1, n = 0;
    for (var i = 0; i < o; i++) { s += a * A.noise(x, y); n += a; a *= 0.5; x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; }
    return s / n;
  };
  function pnoise(x, y, per, off) {
    var X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y;
    var X0 = ((X % per) + per) % per, Y0 = ((Y % per) + per) % per;
    var X1 = (X0 + 1) % per, Y1 = (Y0 + 1) % per;
    X0 = (X0 + off) & 255; X1 = (X1 + off) & 255;
    var u = fade(x), v = fade(y);
    var aa = PERM[PERM[X0] + Y0], ab = PERM[PERM[X0] + Y1], ba = PERM[PERM[X1] + Y0], bb = PERM[PERM[X1] + Y1];
    var g1 = grad(aa, x, y), g2 = grad(ba, x - 1, y), g3 = grad(ab, x, y - 1), g4 = grad(bb, x - 1, y - 1);
    var l1 = g1 + u * (g2 - g1), l2 = g3 + u * (g4 - g3);
    return (l1 + v * (l2 - l1)) * 0.72;
  }

  /* Texture de bruit tuilable 256² : R = fbm large, G = fbm moyen,
     B = bruit « strié » (roche), A = grain fin. Mipmappée (anti-aliasing). */
  A.makeNoiseTexture = function (renderer) {
    var N = 256, data = new Uint8Array(N * N * 4), ch = [new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N)];
    var cfg = [[4, 6, 0, 0], [8, 5, 61, 0], [6, 5, 113, 1], [16, 4, 171, 0]];
    for (var c = 0; c < 4; c++) {
      var base = cfg[c][0], oct = cfg[c][1], off = cfg[c][2], ridged = cfg[c][3], arr = ch[c], mn = 1e9, mx = -1e9;
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
        var s = 0, a = 1, norm = 0;
        for (var o = 0; o < oct; o++) {
          var per = base << o, f = per / N;
          var n = pnoise(x * f, y * f, per, off + o * 29);
          if (ridged) n = 1 - Math.abs(n) * 1.6;
          s += n * a; norm += a; a *= 0.52;
        }
        s /= norm; arr[y * N + x] = s;
        if (s < mn) mn = s; if (s > mx) mx = s;
      }
      for (var k = 0; k < N * N; k++) data[k * 4 + c] = Math.round(255 * (arr[k] - mn) / (mx - mn));
    }
    var tex = new T.DataTexture(data, N, N, T.RGBAFormat, T.UnsignedByteType);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.magFilter = T.LinearFilter;
    tex.minFilter = T.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    tex.needsUpdate = true;
    return tex;
  };

  /* Carte de pentes de vagues (tuilable) : RG = gradient d'un champ fbm,
     BA = gradient d'un second champ plus fin. Les gradients sont calculés
     en flottant puis encodés (évite l'effet « escalier » du 8 bits). */
  A.makeWaterNormals = function (renderer) {
    var N = 256, fields = [new Float32Array(N * N), new Float32Array(N * N)];
    var cfg = [[3, 5, 211], [5, 4, 97]];
    for (var c = 0; c < 2; c++) {
      var f0 = cfg[c][0], oct = cfg[c][1], off = cfg[c][2], arr = fields[c];
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
        var s = 0, a = 1;
        for (var o = 0; o < oct; o++) { var per = f0 << o, f = per / N; s += pnoise(x * f, y * f, per, off + o * 13) * a; a *= 0.48; }
        arr[y * N + x] = s;
      }
    }
    var data = new Uint8Array(N * N * 4);
    for (c = 0; c < 2; c++) {
      var h = fields[c], gx = new Float32Array(N * N), gy = new Float32Array(N * N), mx = 0;
      for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
        var xp = (x + 1) % N, xm = (x + N - 1) % N, yp = (y + 1) % N, ym = (y + N - 1) % N;
        var dx = (h[y * N + xp] - h[y * N + xm]) * 0.5, dy = (h[yp * N + x] - h[ym * N + x]) * 0.5;
        gx[y * N + x] = dx; gy[y * N + x] = dy;
        mx = Math.max(mx, Math.abs(dx), Math.abs(dy));
      }
      for (var k = 0; k < N * N; k++) {
        data[k * 4 + c * 2] = Math.round(127.5 + 127 * gx[k] / mx);
        data[k * 4 + c * 2 + 1] = Math.round(127.5 + 127 * gy[k] / mx);
      }
    }
    var tex = new T.DataTexture(data, N, N, T.RGBAFormat, T.UnsignedByteType);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    tex.needsUpdate = true;
    return tex;
  };

  /* ------------------------------------------------------------------ */
  /* Géométrie                                                           */
  /* ------------------------------------------------------------------ */
  var _m4 = new T.Matrix4(), _q = new T.Quaternion(), _eu = new T.Euler(), _p = new T.Vector3(), _s = new T.Vector3();
  /* place une géométrie : position [x,y,z], rotation [rx,ry,rz] (ordre YXZ), échelle [sx,sy,sz] */
  A.xf = function (g, pos, rot, scl) {
    _eu.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ');
    _q.setFromEuler(_eu);
    _p.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    if (scl === undefined) _s.set(1, 1, 1); else if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
    _m4.compose(_p, _q, _s);
    g.applyMatrix4(_m4);
    return g;
  };
  A.box = function (w, h, d, pos, rot) { return A.xf(new T.BoxGeometry(w, h, d), pos, rot); };
  A.cyl = function (rt, rb, h, seg, pos, rot, open) { return A.xf(new T.CylinderGeometry(rt, rb, h, seg || 12, 1, !!open), pos, rot); };
  A.sph = function (r, ws, hs, pos, scl) { return A.xf(new T.SphereGeometry(r, ws || 12, hs || 8), pos, null, scl); };
  /* Boîte à arêtes arrondies (algorithme de RoundedBoxGeometry) */
  A.rbox = function (w, h, d, r, segs, pos, rot) {
    var seg = (segs || 1) * 2 + 1;
    r = Math.min(w / 2, h / 2, d / 2, r);
    var g = new T.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed();
    var p = g.attributes.position.array, nArr = g.attributes.normal.array;
    var bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r, hs = 0.5 / seg, v = new T.Vector3();
    for (var j = 0; j < p.length; j += 3) {
      var x = p[j], y = p[j + 1], z = p[j + 2];
      v.set(x - Math.sign(x) * hs, y - Math.sign(y) * hs, z - Math.sign(z) * hs).normalize();
      p[j] = bx * Math.sign(x) + v.x * r; p[j + 1] = by * Math.sign(y) + v.y * r; p[j + 2] = bz * Math.sign(z) + v.z * r;
      nArr[j] = v.x; nArr[j + 1] = v.y; nArr[j + 2] = v.z;
    }
    g.deleteAttribute('uv');
    return A.xf(g, pos, rot);
  };
  /* Extrusion d'un profil 2D (x,y) sur l'axe Z, centrée */
  A.extrude = function (pts, depth, bevel, pos, rot, curveSeg) {
    var sh = new T.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    var b = bevel || 0;
    var g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.001, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: curveSeg || 6 });
    g.translate(0, 0, -(depth - 2 * b) / 2);
    g.deleteAttribute('uv');
    return A.xf(g, pos, rot);
  };
  A.shapeExtrude = function (shape, depth, bevel, pos, rot, curveSeg) {
    var b = bevel || 0;
    var g = new T.ExtrudeGeometry(shape, { depth: Math.max(0.001, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: curveSeg || 8 });
    g.translate(0, 0, -(depth - 2 * b) / 2);
    g.deleteAttribute('uv');
    return A.xf(g, pos, rot);
  };
  A.lathe = function (pts, seg, pos, rot) {
    return A.xf(new T.LatheGeometry(pts.map(function (p) { return new T.Vector2(p[0], p[1]); }), seg || 24), pos, rot);
  };
  /* Barre (poutre / vérin / main courante) entre deux points */
  var _ya = new T.Vector3(0, 1, 0), _dv = new T.Vector3(), _mid = new T.Vector3();
  A.bar = function (a, b, r, seg, square) {
    _dv.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    var L = _dv.length();
    var g = square ? new T.BoxGeometry(r * 2, L, r * 2) : new T.CylinderGeometry(r, r, L, seg || 6, 1, true);
    _q.setFromUnitVectors(_ya, _dv.normalize());
    _mid.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    _m4.compose(_mid, _q, _s.set(1, 1, 1));
    g.applyMatrix4(_m4);
    return g;
  };
  /* Fusion de géométries (non indexées) : position, normale, uv?, couleur? */
  A.merge = function (list, keepUV) {
    var arrs = [], n = 0, i, g, hasCol = false;
    for (i = 0; i < list.length; i++) {
      g = list[i];
      if (g.index) g = g.toNonIndexed();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (g.attributes.color) hasCol = true;
      arrs.push(g); n += g.attributes.position.count;
    }
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    var uv = keepUV ? new Float32Array(n * 2) : null, col = hasCol ? new Float32Array(n * 3) : null, o = 0;
    for (i = 0; i < arrs.length; i++) {
      g = arrs[i];
      var c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (col) { if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + c) * 3); }
      o += c;
    }
    for (i = 0; i < nor.length; i += 3) {
      var nl = nor[i] * nor[i] + nor[i + 1] * nor[i + 1] + nor[i + 2] * nor[i + 2];
      if (!(nl > 1e-6)) { nor[i] = 0; nor[i + 1] = 1; nor[i + 2] = 0; }
    }
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    if (uv) out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  };
  /* Teinte de salissure (poussière de bauxite) : bas des engins plus rougeâtre */
  A.dirt = function (geo, y0, y1, strength, seed) {
    var p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3), r = A.rng(seed || 9);
    var dirtC = new T.Color('#9a6a52'), c = new T.Color();
    for (var i = 0; i < n; i++) {
      var y = p.getY(i), x = p.getX(i), z = p.getZ(i);
      var k = (1 - A.smooth(y0, y1, y)) * strength;
      k += (A.noise(x * 0.7 + 3.1, z * 0.7 + y * 0.9) * 0.5 + 0.5) * 0.25 * strength;
      k = A.clamp(k, 0, 1);
      c.setRGB(1, 1, 1).lerp(dirtC, k);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    return geo;
  };
  /* Constructeur : accumule des géométries par matériau puis fusionne */
  A.Builder = function () { this.p = {}; };
  A.Builder.prototype.add = function (k, g) { (this.p[k] || (this.p[k] = [])).push(g); return g; };
  A.Builder.prototype.build = function (opts) {
    opts = opts || {};
    var grp = new T.Group(), uberParts = [], k, i;
    for (k in this.p) {
      var mat = A.M[k];
      if (!mat) { console.warn('AOS: matériau inconnu', k); continue; }
      var geo = A.merge(this.p[k], !!mat.map);
      if (opts.dirt && A.DIRTY[k]) A.dirt(geo, opts.dirt[0], opts.dirt[1], opts.dirt[2] * A.DIRTY[k], opts.seed);
      if (A.M.uber && !mat.map && !mat.transparent && opts.uber !== false) {
        /* fusion en un seul maillage : couleur, rugosité, métal et émission par sommet */
        var n = geo.attributes.position.count, col = new Float32Array(n * 3), pbr = new Float32Array(n * 3);
        var ca = geo.attributes.color, mc = mat.color, em = /^lamp/.test(k) ? 1 : k === 'windowLit' ? 2 : 0;
        var ec = em === 1 ? mat.emissive : null;
        for (i = 0; i < n; i++) {
          var f = ca ? ca.getX(i) : 1, g2 = ca ? ca.getY(i) : 1, b = ca ? ca.getZ(i) : 1;
          if (ec) { col[i * 3] = ec.r; col[i * 3 + 1] = ec.g; col[i * 3 + 2] = ec.b; }
          else { col[i * 3] = mc.r * f; col[i * 3 + 1] = mc.g * g2; col[i * 3 + 2] = mc.b * b; }
          pbr[i * 3] = mat.roughness; pbr[i * 3 + 1] = mat.metalness; pbr[i * 3 + 2] = em;
        }
        geo.setAttribute('color', new T.BufferAttribute(col, 3));
        geo.setAttribute('aPBR', new T.BufferAttribute(pbr, 3));
        uberParts.push(geo);
        continue;
      }
      if (mat.vertexColors && !geo.attributes.color) { var cc = new Float32Array(geo.attributes.position.count * 3); cc.fill(1); geo.setAttribute('color', new T.BufferAttribute(cc, 3)); }
      var m = new T.Mesh(geo, mat);
      m.castShadow = opts.cast !== false && !mat.transparent && !A.NOSHADOW[k];
      m.receiveShadow = opts.receive !== false;
      m.name = k;
      grp.add(m);
    }
    if (uberParts.length) {
      var all = A.merge(uberParts);
      var cA = new Float32Array(all.attributes.position.count * 3), pA = new Float32Array(all.attributes.position.count * 3), o = 0;
      for (i = 0; i < uberParts.length; i++) { cA.set(uberParts[i].attributes.color.array, o); pA.set(uberParts[i].attributes.aPBR.array, o); o += uberParts[i].attributes.color.array.length; }
      all.setAttribute('color', new T.BufferAttribute(cA, 3));
      all.setAttribute('aPBR', new T.BufferAttribute(pA, 3));
      var um = new T.Mesh(all, A.M.uber);
      um.castShadow = opts.cast !== false; um.receiveShadow = opts.receive !== false; um.name = 'uber';
      grp.add(um);
    }
    return grp;
  };

  /* matériau unique : rugosité / métal / émission lus dans l'attribut aPBR */
  A.uberExtra = function (shader) {
    shader.uniforms.uLampK = U.uLampK; shader.uniforms.uNightK = U.uNightK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aPBR; varying vec3 vPBR;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPBR = aPBR;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPBR; uniform float uLampK; uniform float uNightK;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPBR.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPBR.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' +
        'if (vPBR.z > 1.5) { totalEmissiveRadiance += vec3(1.0, 0.74, 0.46) * uNightK * 2.8; diffuseColor.rgb *= 1.0 - uNightK * 0.6; }\n' +
        'else if (vPBR.z > 0.5) { totalEmissiveRadiance += diffuseColor.rgb * uLampK; }');
  };

  /* ------------------------------------------------------------------ */
  /* Uniformes partagés (mis à jour une fois par image)                   */
  /* ------------------------------------------------------------------ */
  A.U = {
    uTime: { value: 0 },
    uSunDir: { value: new T.Vector3(0.95, 0.18, 0.25).normalize() },
    uBetaR: { value: new T.Vector3(1e-5, 2e-5, 4e-5) },
    uBetaM: { value: new T.Vector3(1e-5, 1e-5, 1e-5) },
    uSunE: { value: 900 },
    uMieG: { value: 0.8 },
    uNight: { value: 0 },
    uFogD: { value: 0.00022 },
    uFogK: { value: 1 / 280 },
    uFogB: { value: 0 },
    uFogI: { value: 1 },
    uNoise: { value: null },
    uStage: { value: 0 },
    uNightK: { value: 0 },
    uSunCol: { value: new T.Color(1, 0.8, 0.6) },
    uAmb: { value: new T.Color(0.3, 0.35, 0.45) },
    uWind: { value: 1 },
    uCloudCov: { value: 0.56 },
    uCloudSun: { value: new T.Color(1, 0.7, 0.5) },
    uCloudAmb: { value: new T.Color(0.3, 0.35, 0.45) },
    uStars: { value: 0 },
    uSunDisk: { value: 1 },
    uSkyK: { value: 0.5 },
    uViewH: { value: 900 },
    uShore: { value: null },
    uWaveTex: { value: null },
    uShoreRect: { value: new T.Vector4(0, 0, 1, 1) },
    uLightPx: { value: 2.2 },
    uLampK: { value: 0.3 },
    uFogLUT: { value: null }
  };
  var U = A.U;

  /* ------------------------------------------------------------------ */
  /* GLSL : ciel physique (modèle de Preetham) + brume aérienne           */
  /* ------------------------------------------------------------------ */
  A.GLSL = {};
  A.GLSL.sky = [
    'uniform vec3 uSunDir; uniform vec3 uBetaR; uniform vec3 uBetaM; uniform float uSunE; uniform float uMieG; uniform float uNight; uniform float uSkyK;',
    'vec3 aosSky(vec3 dir, float disk) {',
    '  float cz = max(0.0, dir.y);',
    '  float zen = acos(cz);',
    '  float inv = 1.0 / (cz + 0.15 * pow(93.885 - zen * 57.2957795, -1.253));',
    '  vec3 Fex = exp(-(uBetaR * (8.4e3 * inv) + uBetaM * (1.25e3 * inv)));',
    '  float cosT = dot(dir, uSunDir);',
    '  float rq = max(cosT * 0.5 + 0.5, 0.0);',
    '  float rPh = 0.0596831 * (1.0 + rq * rq);',
    '  float g2 = uMieG * uMieG;',
    '  float mPh = 0.0795775 * ((1.0 - g2) / pow(1.0 - 2.0 * uMieG * cosT + g2, 1.5));',
    '  vec3 ratio = (uBetaR * rPh + uBetaM * mPh) / (uBetaR + uBetaM);',
    '  vec3 Lin = pow(max(uSunE * ratio * (1.0 - Fex), vec3(0.0)), vec3(1.5));',
    '  Lin *= mix(vec3(1.0), pow(max(uSunE * ratio * Fex, vec3(0.0)), vec3(0.5)), clamp(pow(max(1.0 - uSunDir.y, 0.0), 5.0), 0.0, 1.0));',
    '  vec3 L0 = vec3(0.1) * Fex;',
    '  if (disk > 0.0) { float sd = smoothstep(0.99994, 0.99997, cosT); L0 += uSunE * 19000.0 * Fex * sd * disk; }',
    '  vec3 c = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);',
    '  c = pow(max(c, vec3(0.0)), vec3(0.4166667));',
    '  float hz = 1.0 - cz;',
    '  c += uNight * vec3(0.0013, 0.0032, 0.0105) * (1.0 + 2.5 * hz * hz * hz);',
    '  return c * uSkyK;',
    '}'
  ].join('\n');

  A.GLSL.fogPars = [
    A.GLSL.sky,
    'uniform float uFogD; uniform float uFogK; uniform float uFogB; uniform float uFogI;',
    'varying vec3 vFogWorld;',
    'uniform sampler2D uFogLUT;',
    'vec3 aosFogCol(vec3 rd) {',
    '  vec2 h = normalize(rd.xz + vec2(1e-5)); vec2 sh = normalize(uSunDir.xz + vec2(1e-5));',
    '  float u = sqrt(clamp(0.5 - 0.5 * dot(h, sh), 0.0, 1.0));',
    '  float v = (clamp(rd.y, 0.03, 0.5) - 0.03) / 0.47;',
    '  return texture2D(uFogLUT, vec2(u, v)).rgb * uFogI;',
    '}',
    'float aosFogAmt(vec3 wp, out vec3 rd) {',
    '  rd = wp - cameraPosition; float dist = length(rd); rd /= max(dist, 1e-4);',
    '  float h0 = cameraPosition.y - uFogB;',
    '  float t = uFogK * rd.y * dist;',
    '  float fall = abs(t) > 1e-4 ? (1.0 - exp(-t)) / t : 1.0 - 0.5 * t;',
    '  float od = uFogD * exp(-uFogK * h0) * dist * fall;',
    '  return 1.0 - exp(-max(od, 0.0));',
    '}',
    'vec3 aosFog(vec3 col, vec3 wp) { vec3 rd; float f = aosFogAmt(wp, rd); return mix(col, aosFogCol(rd), f); }'
  ].join('\n');

  A.GLSL.fogVert = [
    '{ vec4 aosFw = vec4(transformed, 1.0);',
    '#ifdef USE_INSTANCING',
    '  aosFw = instanceMatrix * aosFw;',
    '#endif',
    '  vFogWorld = (modelMatrix * aosFw).xyz; }'
  ].join('\n');

  A.FOGU = ['uSunDir', 'uBetaR', 'uBetaM', 'uSunE', 'uMieG', 'uNight', 'uSkyK', 'uFogD', 'uFogK', 'uFogB', 'uFogI', 'uFogLUT'];
  /* uniformes de brume pour les ShaderMaterial */
  A.fogUniforms = function (extra) { var o = {}; A.FOGU.forEach(function (k) { o[k] = U[k]; }); if (extra) for (var k in extra) o[k] = extra[k]; return o; };
  A.fogShader = function (shader) {
    A.FOGU.forEach(function (k) { shader.uniforms[k] = U[k]; });
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', 'varying vec3 vFogWorld;')
      .replace('#include <fog_vertex>', A.GLSL.fogVert);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', A.GLSL.fogPars)
      .replace('#include <fog_fragment>', [
        '{ vec3 aosC = gl_FragColor.rgb;',
        '#if __VERSION__ >= 300',
        '  if (any(isnan(aosC))) aosC = vec3(0.0);',
        '#endif',
        '  gl_FragColor.rgb = aosFog(clamp(aosC, 0.0, 2500.0), vFogWorld); }'].join('\n'));
  };
  /* Ombres : remplace le PCF « soft » de r149 (16 lectures) par un PCF bilinéaire
     à 4 lectures sur une grille décalée — pénombre douce, coût ~4× moindre. */
  (function () {
    var c = T.ShaderChunk.shadowmap_pars_fragment;
    var i0 = c.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )'), i1 = c.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )', i0);
    if (i0 < 0 || i1 < 0) return;
    var fast = [
      '#elif defined( SHADOWMAP_TYPE_PCF_SOFT )',
      '\t\t\tvec2 texelSize = vec2( 1.0 ) / shadowMapSize;',
      '\t\t\tvec2 st = shadowCoord.xy * shadowMapSize - 0.5;',
      '\t\t\tvec2 f = fract( st );',
      '\t\t\tvec2 b = ( floor( st ) + 0.5 ) * texelSize;',
      '\t\t\tfloat s00 = texture2DCompare( shadowMap, b, shadowCoord.z );',
      '\t\t\tfloat s10 = texture2DCompare( shadowMap, b + vec2( texelSize.x, 0.0 ), shadowCoord.z );',
      '\t\t\tfloat s01 = texture2DCompare( shadowMap, b + vec2( 0.0, texelSize.y ), shadowCoord.z );',
      '\t\t\tfloat s11 = texture2DCompare( shadowMap, b + texelSize, shadowCoord.z );',
      '\t\t\tshadow = mix( mix( s00, s10, f.x ), mix( s01, s11, f.x ), f.y );',
      '\t\t'
    ].join('\n');
    T.ShaderChunk.shadowmap_pars_fragment = c.slice(0, i0) + fast + c.slice(i1);
  })();

  /* Applique la brume (et un éventuel patch supplémentaire) à un matériau standard */
  A.patch = function (mat, key, extra) {
    mat.onBeforeCompile = function (shader) { A.fogShader(shader); if (extra) extra(shader, mat); };
    mat.customProgramCacheKey = function () { return 'aos-' + (key || 'fog'); };
    return mat;
  };

  /* ---------- terrain : variation de couleur, strates, herbe, ornières, relief fin ---------- */
  var TERRAIN_COLOR = [
    'vec3 wpos = vFogWorld;',
    'vec3 an = abs(vWN); vec3 tw = an * an * an * an; tw /= (tw.x + tw.y + tw.z + 1e-5);',
    'float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);',
    'vec4 nM = texture2D(uNoise, wpos.xz * 0.0029);',
    'vec4 nS = texture2D(uNoise, wpos.xz * 0.017 + 0.31);',
    'vec4 dA, dB;',
    /* triplanaire seulement sur les pentes (fronts de taille, talus) : 2 lectures au lieu de 6 ailleurs */
    'if (tw.y > 0.985) { dA = texture2D(uNoise, wpos.xz * 0.11); dB = texture2D(uNoise, wpos.xz * 0.53); }',
    'else {',
    '  dA = texture2D(uNoise, wpos.zy * 0.11) * tw.x + texture2D(uNoise, wpos.xz * 0.11) * tw.y + texture2D(uNoise, wpos.xy * 0.11) * tw.z;',
    '  dB = texture2D(uNoise, wpos.zy * 0.53) * tw.x + texture2D(uNoise, wpos.xz * 0.53) * tw.y + texture2D(uNoise, wpos.xy * 0.53) * tw.z;',
    '}',
    'float macro = (nM.r - 0.5) * 0.30 + (nS.g - 0.5) * 0.20;',
    'float micro = (dA.a - 0.5) * 0.16 + (dB.a - 0.5) * 0.09;',
    'vec3 tcol = diffuseColor.rgb;',
    /* strates sur les fronts de taille (vAux.y) */
    'float strata = vAux.y * smoothstep(0.22, 0.6, slope);',
    'float band = sin(wpos.y * 1.7 + dA.r * 5.0 + nS.r * 3.0) * 0.5 + 0.5;',
    'float band2 = sin(wpos.y * 6.1 + dB.g * 4.0) * 0.5 + 0.5;',
    'vec3 sA = vec3(0.36, 0.095, 0.036); vec3 sB = vec3(0.50, 0.20, 0.085); vec3 sC = vec3(0.26, 0.068, 0.03);',
    'vec3 strataCol = mix(mix(sA, sB, band), sC, smoothstep(0.62, 0.9, dA.b)) * mix(0.86, 1.1, band2);',
    'tcol = mix(tcol, strataCol, strata);',
    /* couvert herbacé de savane (vAux.w) */
    'float gN = nS.b * 0.55 + dA.g * 0.3 + nM.g * 0.35;',
    'float gmask = vAux.w * smoothstep(0.3, 0.56, gN) * (1.0 - smoothstep(0.35, 0.7, slope));',
    'vec3 grassA = vec3(0.085, 0.13, 0.034); vec3 grassB = vec3(0.22, 0.19, 0.06); vec3 grassC = vec3(0.045, 0.085, 0.024);',
    'vec3 grassCol = mix(mix(grassA, grassB, smoothstep(0.5, 0.85, nM.b)), grassC, smoothstep(0.5, 0.82, dB.r));',
    'tcol = mix(tcol, grassCol * (0.85 + 0.3 * dB.a), gmask);',
    /* ornières sur les pistes (vAux.z = décalage latéral, 999 hors piste) */
    'float lat = abs(vAux.z);',
    'float tq1 = (lat - 2.1) / 0.5, tq2 = (lat - 4.5) / 0.55;',
    'float tr = exp(-tq1 * tq1) + exp(-tq2 * tq2);',
    'tr *= (1.0 - step(9.0, lat)) * (0.55 + 0.45 * dB.b);',
    'tcol *= 1.0 - tr * 0.2;',
    'tcol *= 1.0 + macro + micro;',
    /* humidité (vAux.x) : sol plus sombre et plus brillant */
    'float wet = clamp(vAux.x, 0.0, 1.0);',
    'tcol *= 1.0 - wet * 0.42;',
    'diffuseColor.rgb = max(tcol, vec3(0.0));',
    'float tRough = 1.0 - wet * 0.6;',
    'float onRoad = 1.0 - step(900.0, lat);',
    'float tBump = (dA.a * 0.6 + dB.a * 0.4 + dA.b * 0.5 * strata) * (0.6 + slope * 1.8) * (1.0 - wet * 0.6) * mix(1.0, 0.35, onRoad);'
  ].join('\n');
  var TERRAIN_BUMP = [
    '{',
    '  vec3 vSx = dFdx(-vViewPosition); vec3 vSy = dFdy(-vViewPosition);',
    '  float bh = tBump * 0.11;',
    '  float dBs = dFdx(bh); float dBt = dFdy(bh);',
    '  vec3 R1 = cross(vSy, normal); vec3 R2 = cross(normal, vSx);',
    '  float fDet = dot(vSx, R1) * faceDirection;',
    '  vec3 vGrad = sign(fDet) * (dBs * R1 + dBt * R2);',
    '  vec3 nn = abs(fDet) * normal - vGrad;',
    '  if (dot(nn, nn) > 1e-14) normal = normalize(nn);',
    '}'
  ].join('\n');
  A.terrainExtra = function (shader) {
    shader.uniforms.uNoise = U.uNoise;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aAux; varying vec4 vAux; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux = aAux; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; varying vec4 vAux; varying vec3 vWN;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + TERRAIN_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * tRough, 0.08, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + TERRAIN_BUMP);
  };

  /* ---------- eau : houle procédurale, couleur selon la profondeur, écume ---------- */
  var WATER_FRAG_PARS = [
    'uniform float uTime; uniform sampler2D uNoise; uniform sampler2D uShore; uniform vec4 uShoreRect; uniform vec3 uSunCol; uniform sampler2D uWaveTex;'
  ].join('\n');
  var WATER_NORMAL = [
    'vec2 wq = vFogWorld.xz;',
    'float wDist = length(vFogWorld - cameraPosition);',
    'float fw = max(length(fwidth(wq)), 1e-3);',
    'vec2 g = vec2(0.0);',
    /* houle longue : vagues directionnelles atténuées quand elles deviennent plus fines que le pixel */
    'vec2 d1 = vec2(0.94, 0.34); vec2 d2 = vec2(0.70, -0.71); vec2 d3 = vec2(0.99, 0.12); vec2 d4 = vec2(0.30, 0.95);',
    'g += d1 * 0.045 * cos(dot(d1, wq) * 0.055 - uTime * 0.74) * smoothstep(1.2, 0.35, 0.055 * fw);',
    'g += d2 * 0.035 * cos(dot(d2, wq) * 0.083 - uTime * 0.91 + 1.3) * smoothstep(1.2, 0.35, 0.083 * fw);',
    'g += d3 * 0.028 * cos(dot(d3, wq) * 0.14 - uTime * 1.17 + 2.1) * smoothstep(1.2, 0.35, 0.14 * fw);',
    'g += d4 * 0.022 * cos(dot(d4, wq) * 0.21 - uTime * 1.43 + 0.7) * smoothstep(1.2, 0.35, 0.21 * fw);',
    /* clapot : carte de pentes défilante à deux échelles (mipmappée = filtrée au loin) */
    'vec4 n1 = texture2D(uWaveTex, wq * 0.0105 + vec2(uTime * 0.0042, uTime * 0.0021));',
    'vec4 n2 = texture2D(uWaveTex, wq * 0.031 - vec2(uTime * 0.0036, -uTime * 0.0057));',
    'vec4 n3 = texture2D(uWaveTex, wq * 0.083 + vec2(-uTime * 0.0081, uTime * 0.0049));',
    'g += (n1.rg - 0.5) * 0.24 + (n2.ba - 0.5) * 0.17 + (n3.rg - 0.5) * 0.11 * (1.0 - smoothstep(80.0, 700.0, wDist));',
    'vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));',
    'normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);'
  ].join('\n');
  var WATER_COLOR = [
    'vec2 suv = (vFogWorld.xz - uShoreRect.xy) * uShoreRect.zw;',
    'vec4 sh = texture2D(uShore, clamp(suv, 0.0, 1.0));',
    'float inR = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);',
    'float depth = mix(30.0, sh.r * 30.0, inR);',
    'float river = sh.g * inR;',
    'vec3 deep = vec3(0.0045, 0.020, 0.024);',
    'vec3 mid = vec3(0.012, 0.038, 0.034);',
    'vec3 shallow = vec3(0.045, 0.055, 0.035);',
    'vec3 muddy = vec3(0.055, 0.040, 0.018);',
    'vec3 wc = mix(shallow, mid, smoothstep(0.0, 3.5, depth));',
    'wc = mix(wc, deep, smoothstep(4.0, 16.0, depth));',
    'wc = mix(wc, muddy, river * 0.85);',
    'float fn = texture2D(uNoise, vFogWorld.xz * 0.045 + vec2(uTime * 0.012, 0.0)).b;',
    'float fn2 = texture2D(uNoise, vFogWorld.xz * 0.16 - vec2(0.0, uTime * 0.02)).a;',
    'float foam = (1.0 - smoothstep(0.0, 0.9, depth + (fn - 0.5) * 0.9)) * smoothstep(0.45, 0.75, fn2 + 0.25 * sin(depth * 7.0 - uTime * 1.6));',
    'foam *= inR;',
    'diffuseColor.rgb = mix(wc, vec3(0.62, 0.62, 0.58), foam);',
    'float wFoam = foam;'
  ].join('\n');
  A.waterExtra = function (shader) {
    shader.uniforms.uTime = U.uTime; shader.uniforms.uNoise = U.uNoise; shader.uniforms.uShore = U.uShore;
    shader.uniforms.uShoreRect = U.uShoreRect; shader.uniforms.uSunCol = U.uSunCol; shader.uniforms.uWaveTex = U.uWaveTex;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WATER_FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + WATER_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, wFoam);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WATER_NORMAL)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' +
        /* diffusion sous la surface : vagues translucides éclairées par le soleil */
        '{ vec3 vd = normalize(vFogWorld - cameraPosition); float sss = pow(max(dot(vd, uSunDir), 0.0), 4.0) * (1.0 - wFoam);' +
        ' totalEmissiveRadiance += vec3(0.02, 0.07, 0.055) * uSunCol * sss * 0.6; }');
  };

  /* ---------- végétation : balancement au vent + translucidité en contre-jour ---------- */
  A.foliageExtra = function (shader) {
    shader.uniforms.uTime = U.uTime; shader.uniforms.uWind = U.uWind; shader.uniforms.uSunCol = U.uSunCol;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '{',
        '#ifdef USE_INSTANCING',
        '  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
        '#else',
        '  vec3 ip = vec3(0.0);',
        '#endif',
        '  float k = max(position.y - 1.5, 0.0);',
        '  float sw = sin(uTime * 1.1 + ip.x * 0.043 + ip.z * 0.061) * 0.6 + sin(uTime * 2.3 + ip.x * 0.12 + position.y) * 0.25;',
        '  transformed.x += sw * uWind * k * 0.012;',
        '  transformed.z += sw * uWind * k * 0.008;',
        '}'
      ].join('\n'));
    shader.uniforms.uNoise = U.uNoise;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunCol; uniform sampler2D uNoise;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FOLIAGE_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FOLIAGE_BUMP)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' +
        '{ vec3 vd = normalize(vFogWorld - cameraPosition); float bl = pow(max(dot(vd, uSunDir), 0.0), 3.0);' +
        ' totalEmissiveRadiance += diffuseColor.rgb * uSunCol * bl * 0.32; }');
  };
  /* grappes de feuilles : bruit triplanaire en espace monde (trous plus sombres + relief) */
  var FOLIAGE_COLOR = [
    'vec3 fwp = vFogWorld * 0.24;',
    'vec3 fgc = cross(dFdx(vFogWorld), dFdy(vFogWorld));',
    'vec3 fgn = dot(fgc, fgc) > 1e-12 ? normalize(fgc) : vec3(0.0, 1.0, 0.0);',
    'vec3 ftw = abs(fgn); ftw = ftw * ftw * ftw * ftw; ftw /= (ftw.x + ftw.y + ftw.z + 1e-5);',
    'vec4 fl = texture2D(uNoise, fwp.zy) * ftw.x + texture2D(uNoise, fwp.xz) * ftw.y + texture2D(uNoise, fwp.xy) * ftw.z;',
    'float leaf = fl.g * 0.55 + fl.a * 0.45;',
    'float fK = 1.0 - smoothstep(140.0, 650.0, length(vFogWorld - cameraPosition));',
    'diffuseColor.rgb *= mix(1.0, 0.56 + 0.8 * smoothstep(0.22, 0.8, leaf), fK);',
    'float fBump = leaf * fK;'
  ].join('\n');
  var FOLIAGE_BUMP = [
    '{',
    '  vec3 vSx = dFdx(-vViewPosition); vec3 vSy = dFdy(-vViewPosition);',
    '  float bh = fBump * 0.5;',
    '  float dBs = dFdx(bh); float dBt = dFdy(bh);',
    '  vec3 R1 = cross(vSy, normal); vec3 R2 = cross(normal, vSx);',
    '  float fDet = dot(vSx, R1) * faceDirection;',
    '  vec3 vGrad = sign(fDet) * (dBs * R1 + dBt * R2);',
    '  vec3 nn = abs(fDet) * normal - vGrad;',
    '  if (dot(nn, nn) > 1e-14) normal = normalize(nn);',
    '}'
  ].join('\n');

  /* ---------- maisons : fenêtres qui s'allument par étapes (uStage) ---------- */
  A.housesExtra = function (shader) {
    shader.uniforms.uStage = U.uStage; shader.uniforms.uNightK = U.uNightK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWin; attribute float aIStage; uniform float uStage; uniform float uNightK; varying float vLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aWin * smoothstep(aIStage, aIStage + 0.35, uStage) * uNightK;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.6, 0.28) * vLit * 2.4; diffuseColor.rgb *= 1.0 - min(vLit, 1.0) * 0.7;');
  };

  /* ------------------------------------------------------------------ */
  /* Ciel (dôme) : Preetham + nuages + étoiles                            */
  /* ------------------------------------------------------------------ */
  A.makeSkyMaterial = function (forEnv) {
    return new T.ShaderMaterial({
      uniforms: {
        uSunDir: U.uSunDir, uBetaR: U.uBetaR, uBetaM: U.uBetaM, uSunE: U.uSunE, uMieG: U.uMieG, uNight: U.uNight, uSkyK: U.uSkyK,
        uTime: U.uTime, uNoise: U.uNoise, uCloudCov: U.uCloudCov, uCloudSun: U.uCloudSun, uCloudAmb: U.uCloudAmb,
        uStars: U.uStars, uSunDisk: U.uSunDisk
      },
      defines: forEnv ? { AOS_ENV: 1 } : {},
      vertexShader: [
        'varying vec3 vWP;',
        'void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99999; }'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vWP;',
        'uniform float uTime; uniform sampler2D uNoise; uniform float uCloudCov; uniform vec3 uCloudSun; uniform vec3 uCloudAmb; uniform float uStars; uniform float uSunDisk;',
        A.GLSL.sky,
        'float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }',
        'float cloudN(vec2 p) { return texture2D(uNoise, p).r * 0.58 + texture2D(uNoise, p * 2.71 + 0.37).g * 0.29 + texture2D(uNoise, p * 6.33 + 0.71).a * 0.13; }',
        'void main() {',
        '  vec3 dir = normalize(vWP - cameraPosition);',
        '#ifdef AOS_ENV',
        '  vec3 c = aosSky(dir, 0.0);',
        '#else',
        '  vec3 c = aosSky(dir, uSunDisk);',
        '#endif',
        '  if (dir.y > 0.0) {',
        '    float t = 1.0 / (dir.y + 0.035);',
        '    vec2 p = dir.xz * t * 0.075 + vec2(uTime * 0.0006, uTime * 0.00025);',
        '    float n = cloudN(p);',
        '    float cov = smoothstep(uCloudCov, uCloudCov + 0.2, n);',
        '    vec2 sp = p + normalize(uSunDir.xz + vec2(1e-4)) * 0.01;',
        '    float shade = clamp(1.0 - (cloudN(sp) - n) * 4.5, 0.18, 1.2);',
        '    float cosT = dot(dir, uSunDir);',
        '    float ph = 0.5 + 1.6 * pow(max(cosT, 0.0), 5.0) + 2.5 * pow(max(cosT, 0.0), 32.0);',
        '    vec3 cc = uCloudAmb * (0.75 + 0.25 * (1.0 - cov)) + uCloudSun * shade * ph;',
        '    float fade = smoothstep(0.012, 0.2, dir.y);',
        '    c = mix(c, mix(c, cc, 0.55 + 0.45 * fade), cov * fade * 0.96);',
        '  }',
        '#ifndef AOS_ENV',
        '  if (uStars > 0.001 && dir.y > 0.0) {',
        '    vec3 sp3 = dir * 290.0; vec3 ip = floor(sp3); vec3 fp = fract(sp3);',
        '    float h = h13(ip);',
        '    if (h > 0.9955) {',
        '      vec3 o = vec3(h13(ip + 1.7), h13(ip + 3.1), h13(ip + 5.3)) * 0.6 + 0.2;',
        '      float d = length(fp - o);',
        '      float b = smoothstep(0.32, 0.0, d) * (0.25 + 0.75 * (h - 0.9955) / 0.0045);',
        '      float tw = 0.7 + 0.3 * sin(uTime * (1.5 + h * 7.0) + h * 91.0);',
        '      c += vec3(b * tw) * mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.7), o.x) * 0.22 * uStars * smoothstep(0.0, 0.2, dir.y);',
        '    }',
        '  }',
        '#endif',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n'),
      side: T.BackSide,
      depthWrite: false,
      fog: false
    });
  };

  /* Modèle de ciel côté JS (mêmes formules) : couleur du soleil, intensités */
  var TOTAL_RAYLEIGH = [5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5];
  var MIE_CONST = [1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14];
  A.SkyModel = function () {
    this.turbidity = 4.0; this.rayleigh = 1.6; this.mieCoef = 0.0042; this.mieG = 0.79; this.skyK = 0.5;
    this.cutoff = 1.71; this.steep = 2.4;
    this.betaR = [0, 0, 0]; this.betaM = [0, 0, 0]; this.sunE = 0;
  };
  A.SkyModel.prototype.update = function (sunDir) {
    var zc = A.clamp(sunDir.y, -1, 1);
    this.sunE = 1000 * Math.max(0, 1 - Math.exp(-((this.cutoff - Math.acos(zc)) / this.steep)));
    var c = 0.2 * this.turbidity * 10E-18;
    for (var i = 0; i < 3; i++) {
      this.betaR[i] = TOTAL_RAYLEIGH[i] * this.rayleigh;
      this.betaM[i] = 0.434 * c * MIE_CONST[i] * this.mieCoef;
    }
    this.sunDir = sunDir;
  };
  /* transmittance atmosphérique dans une direction (couleur de la lumière solaire) */
  A.SkyModel.prototype.fex = function (dirY, out) {
    var cz = Math.max(0, dirY), zen = Math.acos(cz);
    var inv = 1 / (cz + 0.15 * Math.pow(Math.max(93.885 - zen * 57.2957795, 0.5), -1.253));
    for (var i = 0; i < 3; i++) out[i] = Math.exp(-(this.betaR[i] * 8.4e3 * inv + this.betaM[i] * 1.25e3 * inv));
    return out;
  };
  /* radiance du ciel (sans disque solaire) — sert aux nuages et au réglage */
  A.SkyModel.prototype.radiance = function (dir, out) {
    var cz = Math.max(0, dir.y), zen = Math.acos(cz);
    var inv = 1 / (cz + 0.15 * Math.pow(Math.max(93.885 - zen * 57.2957795, 0.5), -1.253));
    var sd = this.sunDir, cosT = dir.x * sd.x + dir.y * sd.y + dir.z * sd.z;
    var rPh = 0.0596831 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
    var g = this.mieG, g2 = g * g;
    var mPh = 0.0795775 * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
    var mixK = A.clamp(Math.pow(1 - sd.y, 5), 0, 1);
    for (var i = 0; i < 3; i++) {
      var bR = this.betaR[i], bM = this.betaM[i];
      var fex = Math.exp(-(bR * 8.4e3 * inv + bM * 1.25e3 * inv));
      var ratio = (bR * rPh + bM * mPh) / (bR + bM);
      var lin = Math.pow(Math.max(this.sunE * ratio * (1 - fex), 0), 1.5);
      lin *= A.lerp(1, Math.pow(Math.max(this.sunE * ratio * fex, 0), 0.5), mixK);
      var c = (lin + 0.1 * fex) * 0.04 + [0, 0.0003, 0.00075][i];
      var hz = 1 - cz;
      out[i] = (Math.pow(Math.max(c, 0), 0.4166667) + (this.night || 0) * [0.0013, 0.0032, 0.0105][i] * (1 + 2.5 * hz * hz * hz)) * this.skyK;
    }
    return out;
  };
  /* table de correspondance de la couleur de brume (direction relative au soleil × hauteur) */
  A.SkyModel.prototype.fogLUT = function (tex) {
    var W2 = 64, H2 = 16, data = tex ? tex.image.data : new Uint16Array(W2 * H2 * 4), d = new T.Vector3(), o = [0, 0, 0];
    var sd = this.sunDir, az = Math.atan2(sd.z, sd.x), toH = T.DataUtils.toHalfFloat;
    for (var j = 0; j < H2; j++) for (var i = 0; i < W2; i++) {
      var u = (i + 0.5) / W2, v = (j + 0.5) / H2, phi = 2 * Math.asin(u), y = 0.03 + v * 0.47, r = Math.sqrt(1 - y * y);
      d.set(Math.cos(az + phi) * r, y, Math.sin(az + phi) * r);
      this.radiance(d, o);
      var k = (j * W2 + i) * 4;
      data[k] = toH(o[0]); data[k + 1] = toH(o[1]); data[k + 2] = toH(o[2]); data[k + 3] = toH(1);
    }
    if (!tex) {
      tex = new T.DataTexture(data, W2, H2, T.RGBAFormat, T.HalfFloatType);
      tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearFilter; tex.wrapS = T.ClampToEdgeWrapping; tex.wrapT = T.ClampToEdgeWrapping;
    }
    tex.needsUpdate = true;
    return tex;
  };

  /* ------------------------------------------------------------------ */
  /* Textures procédurales (canvas)                                       */
  /* ------------------------------------------------------------------ */
  A.tex = {};
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  A.tex.canvas = canvas;
  /* « bouffée » de poussière */
  A.tex.puff = function () {
    var N = 128, c = canvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N);
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var u = (i + 0.5) / N - 0.5, v = (j + 0.5) / N - 0.5, d = Math.sqrt(u * u + v * v) * 2;
      var n = A.fbm(i * 0.07, j * 0.07, 4) * 0.5 + 0.5;
      var a = Math.max(0, 1 - d) ; a = a * a * (3 - 2 * a);
      a *= A.clamp(0.35 + n * 1.0, 0, 1);
      var k = (j * N + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * a);
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c); return t;
  };
  /* palme (feuille pennée) avec alpha */
  A.tex.frond = function () {
    var c = canvas(64, 256), x = c.getContext('2d');
    x.clearRect(0, 0, 64, 256);
    x.strokeStyle = '#6b6a2c'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(32, 256); x.lineTo(32, 0); x.stroke();
    for (var i = 0; i < 46; i++) {
      var y = 250 - i * 5.4, len = 30 * Math.sin(Math.PI * (i + 3) / 52);
      var g = 90 + ((i * 37) % 40);
      x.strokeStyle = 'rgb(' + (40 + (i % 3) * 6) + ',' + g + ',' + 34 + ')'; x.lineWidth = 3.2;
      x.beginPath(); x.moveTo(32, y); x.quadraticCurveTo(32 - len * 0.5, y - 6, 32 - len, y - 2); x.stroke();
      x.beginPath(); x.moveTo(32, y); x.quadraticCurveTo(32 + len * 0.5, y - 6, 32 + len, y - 2); x.stroke();
    }
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  };
  /* touffes d'herbe */
  A.tex.grass = function () {
    var c = canvas(128, 128), x = c.getContext('2d'), r = A.rng(77);
    x.clearRect(0, 0, 128, 128);
    for (var i = 0; i < 70; i++) {
      var bx = 10 + r() * 108, h = 50 + r() * 75, lean = (r() - 0.5) * 30;
      var gcol = r() < 0.5 ? [120 + r() * 50, 115 + r() * 40, 50] : [70 + r() * 30, 95 + r() * 30, 35];
      x.strokeStyle = 'rgb(' + (gcol[0] | 0) + ',' + (gcol[1] | 0) + ',' + gcol[2] + ')';
      x.lineWidth = 1.6 + r() * 1.6;
      x.beginPath(); x.moveTo(bx, 128); x.quadraticCurveTo(bx + lean * 0.3, 128 - h * 0.6, bx + lean, 128 - h); x.stroke();
    }
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  };
  /* goutte AOS (dessin vectoriel) */
  function drawDrop(x, cx, cy, s) {
    var g = x.createRadialGradient(cx - s * 0.15, cy + s * 0.15, s * 0.05, cx, cy + s * 0.2, s * 0.75);
    g.addColorStop(0, '#FFE6A3'); g.addColorStop(0.35, '#F2A33A'); g.addColorStop(0.8, '#B4521A'); g.addColorStop(1, '#6E2A0C');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx, cy - s * 0.62);
    x.bezierCurveTo(cx + s * 0.12, cy - s * 0.3, cx + s * 0.46, cy - s * 0.02, cx + s * 0.46, cy + s * 0.26);
    x.arc(cx, cy + s * 0.26, s * 0.46, 0, Math.PI, false);
    x.bezierCurveTo(cx - s * 0.46, cy - s * 0.02, cx - s * 0.12, cy - s * 0.3, cx, cy - s * 0.62);
    x.fill();
  }
  A.tex.drawDrop = drawDrop;
  /* décor « GROUPE AOS » (portes de camions, cuves, coques) */
  A.tex.brand = function (opts) {
    opts = opts || {};
    var w = opts.w || 512, h = opts.h || 256, c = canvas(w, h), x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    if (opts.bg) { x.fillStyle = opts.bg; x.fillRect(0, 0, w, h); }
    var font = A.fontFamily || 'Arial Black, Arial, sans-serif';
    var col = opts.color || '#1E6B33';
    if (opts.stripe) {
      x.fillStyle = opts.stripe; x.fillRect(0, h * 0.72, w, h * 0.1);
      x.fillStyle = '#C9A961'; x.fillRect(0, h * 0.84, w, h * 0.04);
    }
    var size = opts.size || h * 0.42;
    x.font = '800 ' + size + 'px ' + font;
    x.textBaseline = 'middle';
    var label = opts.text || 'AOS';
    var tw = x.measureText(label).width;
    var dropS = size * 0.9;
    var total = tw + dropS * 0.75;
    var x0 = (opts.align === 'left' ? h * 0.15 : (w - total) / 2);
    drawDrop(x, x0 + dropS * 0.3, h * (opts.cy || 0.4), dropS * 0.62);
    x.fillStyle = col;
    x.fillText(label, x0 + dropS * 0.72, h * (opts.cy || 0.4) + size * 0.04);
    if (opts.sub) {
      x.font = '600 ' + Math.round(size * 0.3) + 'px ' + font;
      x.fillText(opts.sub, x0 + dropS * 0.74, h * (opts.cy || 0.4) + size * 0.62);
    }
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  };
  /* hélipont */
  A.tex.helipad = function () {
    var c = canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#3c4a3f'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#d8c23a'; x.lineWidth = 10; x.beginPath(); x.arc(128, 128, 84, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#e8e8e8'; x.lineWidth = 8; x.strokeRect(10, 10, 236, 236);
    x.fillStyle = '#f2f2f2'; x.font = '900 120px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', 128, 134);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  };
  /* drapeau de la Guinée (rouge, jaune, vert) */
  A.tex.flagGN = function () {
    var c = canvas(96, 64), x = c.getContext('2d');
    x.fillStyle = '#CE1126'; x.fillRect(0, 0, 32, 64);
    x.fillStyle = '#FCD116'; x.fillRect(32, 0, 32, 64);
    x.fillStyle = '#009460'; x.fillRect(64, 0, 32, 64);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  };
  /* lueur radiale */
  A.tex.glow = function () {
    var c = canvas(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  };

  /* ------------------------------------------------------------------ */
  /* Post-traitement HDR                                                  */
  /* ------------------------------------------------------------------ */
  var POST_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  var DOWN_FS = [
    'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uPre; uniform float uThr; uniform float uKnee; uniform float uMax;',
    'varying vec2 vUv;',
    'vec3 S(vec2 o) { vec3 c = min(texture2D(tSrc, vUv + uTexel * o).rgb, vec3(uMax));',
    '#if __VERSION__ >= 300',
    '  if (any(isnan(c))) c = vec3(0.0);',
    '#endif',
    '  return max(c, vec3(0.0)); }',
    'void main() {',
    '  vec3 a = S(vec2(-2.0, 2.0)), b = S(vec2(0.0, 2.0)), c = S(vec2(2.0, 2.0));',
    '  vec3 d = S(vec2(-2.0, 0.0)), e = S(vec2(0.0)), f = S(vec2(2.0, 0.0));',
    '  vec3 g = S(vec2(-2.0, -2.0)), h = S(vec2(0.0, -2.0)), i = S(vec2(2.0, -2.0));',
    '  vec3 j = S(vec2(-1.0, 1.0)), k = S(vec2(1.0, 1.0)), l = S(vec2(-1.0, -1.0)), m = S(vec2(1.0, -1.0));',
    '  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;',
    '  if (uPre > 0.5) {',
    '    float br = max(col.r, max(col.g, col.b));',
    '    float rq = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee); rq = rq * rq / (4.0 * uKnee + 1e-4);',
    '    col *= max(rq, br - uThr) / max(br, 1e-4);',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');
  var UP_FS = [
    'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius; uniform float uWeight;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 d = uTexel.xyxy * vec4(1.0, 1.0, -1.0, 0.0) * uRadius;',
    '  vec3 s = texture2D(tSrc, vUv - d.xy).rgb;',
    '  s += texture2D(tSrc, vUv - d.wy).rgb * 2.0;',
    '  s += texture2D(tSrc, vUv - d.zy).rgb;',
    '  s += texture2D(tSrc, vUv + d.zw).rgb * 2.0;',
    '  s += texture2D(tSrc, vUv).rgb * 4.0;',
    '  s += texture2D(tSrc, vUv + d.xw).rgb * 2.0;',
    '  s += texture2D(tSrc, vUv + d.zy).rgb;',
    '  s += texture2D(tSrc, vUv + d.wy).rgb * 2.0;',
    '  s += texture2D(tSrc, vUv + d.xy).rgb;',
    '  gl_FragColor = vec4(s * (1.0 / 16.0) * uWeight, 1.0);',
    '}'
  ].join('\n');
  var RAYS_FS = [
    'uniform sampler2D tSrc; uniform vec2 uSun; uniform float uAspect;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 uv = vUv; vec2 dl = (uv - uSun) * (0.96 / 44.0);',
    '  float illum = 1.0; vec3 acc = vec3(0.0);',
    '  for (int i = 0; i < 44; i++) {',
    '    uv -= dl;',
    '    vec2 dd = (uv - uSun) * vec2(uAspect, 1.0);',
    '    acc += texture2D(tSrc, uv).rgb * exp(-dot(dd, dd) * 5.0) * illum;',
    '    illum *= 0.962;',
    '  }',
    '  gl_FragColor = vec4(acc / 44.0, 1.0);',
    '}'
  ].join('\n');
  var COMP_FS = [
    'uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tRays;',
    'uniform float uBloom; uniform float uExposure; uniform float uRays; uniform vec3 uRaysCol;',
    'uniform vec2 uRes; uniform float uTime; uniform float uVig; uniform float uGrain; uniform float uCA;',
    'uniform float uSat; uniform float uContrast; uniform vec3 uTint; uniform vec3 uShadowTint; uniform float uFade;',
    'varying vec2 vUv;',
    'vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }',
    'vec3 aces(vec3 c) {',
    '  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));',
    '  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));',
    '  c = I * (c / 0.6); c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0);',
    '}',
    'vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
    'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'void main() {',
    '  vec2 d = vUv - 0.5;',
    '  vec2 off = d * dot(d, d) * uCA;',
    '  vec3 c;',
    '  c.r = texture2D(tScene, vUv - off).r;',
    '  c.g = texture2D(tScene, vUv).g;',
    '  c.b = texture2D(tScene, vUv + off).b;',
    '  c = min(c, vec3(4000.0));',
    '#if __VERSION__ >= 300',
    '  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);',
    '#endif',
    '  c += texture2D(tBloom, vUv).rgb * uBloom;',
    '  c += texture2D(tRays, vUv).rgb * uRaysCol * uRays;',
    '  c *= uExposure;',
    '  c = aces(c);',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  c = mix(vec3(l), c, uSat);',
    '  c *= mix(uShadowTint, uTint, smoothstep(0.0, 0.55, l));',
    '  c = toSRGB(c);',
    '  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);',
    '  float v = smoothstep(1.05, 0.25, length(d * vec2(uRes.x / uRes.y, 1.0) * 0.85));',
    '  c *= mix(1.0, v, uVig);',
    '  c += (hash(vUv * uRes + fract(uTime * 7.31) * 100.0) - 0.5) * uGrain;',
    '  c *= uFade;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  A.Post = function (renderer, opts) {
    this.r = renderer;
    this.msaa = !!opts.msaa;
    this.useRays = !!opts.rays;
    var hf = T.HalfFloatType;
    /* profondeur 24 bits (r149 utilise 16 bits par défaut sur les render targets : insuffisant à grande distance) */
    var dt = new T.DepthTexture(4, 4); dt.type = T.UnsignedIntType;
    this.rt = new T.WebGLRenderTarget(4, 4, { type: hf, samples: this.msaa ? (opts.samples || 4) : 0, depthBuffer: true, stencilBuffer: false, depthTexture: dt });
    this.rt.texture.generateMipmaps = false;
    this.mips = [];
    for (var i = 0; i < (opts.levels || 6); i++) {
      var m = new T.WebGLRenderTarget(4, 4, { type: hf, depthBuffer: false, stencilBuffer: false });
      m.texture.generateMipmaps = false;
      this.mips.push(m);
    }
    this.rtRays = new T.WebGLRenderTarget(4, 4, { type: hf, depthBuffer: false, stencilBuffer: false });
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new T.Mesh(geo);
    this.quad.frustumCulled = false;
    this.qs = new T.Scene(); this.qs.add(this.quad);
    this.qc = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    function sm(u, fs, extra) {
      var o = { uniforms: u, vertexShader: POST_VS, fragmentShader: fs, depthTest: false, depthWrite: false };
      if (extra) for (var k in extra) o[k] = extra[k];
      return new T.ShaderMaterial(o);
    }
    this.mDown = sm({ tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uPre: { value: 0 }, uThr: { value: 2.2 }, uKnee: { value: 1.0 }, uMax: { value: 80 } }, DOWN_FS);
    this.mUp = sm({ tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } }, UP_FS, { blending: T.AdditiveBlending });
    this.mRays = sm({ tSrc: { value: null }, uSun: { value: new T.Vector2(0.5, 0.5) }, uAspect: { value: 1 } }, RAYS_FS);
    this.mComp = sm({
      tScene: { value: null }, tBloom: { value: null }, tRays: { value: null },
      uBloom: { value: 0.05 }, uExposure: { value: 1 }, uRays: { value: 0 }, uRaysCol: { value: new T.Color(1, 0.7, 0.4) },
      uRes: { value: new T.Vector2(1, 1) }, uTime: { value: 0 }, uVig: { value: 0.35 }, uGrain: { value: 0.014 }, uCA: { value: 0.0035 },
      uSat: { value: 1.02 }, uContrast: { value: 1.04 }, uTint: { value: new T.Color(1.02, 1.0, 0.97) }, uShadowTint: { value: new T.Color(0.96, 1.0, 1.04) },
      uFade: { value: 1 }
    }, COMP_FS);
    this.w = 4; this.h = 4;
  };
  A.Post.prototype.setSize = function (w, h) {
    w = Math.max(4, w | 0); h = Math.max(4, h | 0);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.rt.setSize(w, h);
    var mw = w, mh = h;
    for (var i = 0; i < this.mips.length; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); this.mips[i].setSize(mw, mh); }
    this.rtRays.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.mComp.uniforms.uRes.value.set(w, h);
  };
  A.Post.prototype.pass = function (mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.qs, this.qc);
  };
  /* P = { bloom, exposure, rays, raysCol, sunUV, time, vig, grain, sat, contrast, fade } */
  A.Post.prototype.render = function (scene, camera, P) {
    var r = this.r, i;
    r.setRenderTarget(this.rt);
    r.clear(true, true, false);
    r.render(scene, camera);
    var src = this.rt;
    for (i = 0; i < this.mips.length; i++) {
      var dst = this.mips[i];
      this.mDown.uniforms.tSrc.value = src.texture;
      this.mDown.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.mDown.uniforms.uPre.value = i === 0 ? 1 : 0;
      this.pass(this.mDown, dst);
      if (i === 0 && this.useRays && P.rays > 0.002) {
        this.mRays.uniforms.tSrc.value = this.mips[0].texture;
        this.mRays.uniforms.uSun.value.copy(P.sunUV);
        this.mRays.uniforms.uAspect.value = this.w / this.h;
        this.pass(this.mRays, this.rtRays);
      }
      src = dst;
    }
    for (i = this.mips.length - 2; i >= 0; i--) {
      var lo = this.mips[i + 1];
      this.mUp.uniforms.tSrc.value = lo.texture;
      this.mUp.uniforms.uTexel.value.set(1 / lo.width, 1 / lo.height);
      this.pass(this.mUp, this.mips[i]);
    }
    var u = this.mComp.uniforms;
    u.tScene.value = this.rt.texture; u.tBloom.value = this.mips[0].texture; u.tRays.value = this.rtRays.texture;
    u.uBloom.value = P.bloom; u.uExposure.value = P.exposure;
    u.uRays.value = this.useRays ? P.rays : 0; if (P.raysCol) u.uRaysCol.value.copy(P.raysCol);
    u.uTime.value = P.time; u.uVig.value = P.vig; u.uGrain.value = P.grain;
    u.uSat.value = P.sat; u.uContrast.value = P.contrast; u.uFade.value = P.fade === undefined ? 1 : P.fade;
    if (P.tint) u.uTint.value.setRGB(P.tint[0], P.tint[1], P.tint[2]);
    if (P.shadowTint) u.uShadowTint.value.setRGB(P.shadowTint[0], P.shadowTint[1], P.shadowTint[2]);
    this.pass(this.mComp, null);
  };
})(window);
