/* =====================================================================
   Groupe AOS — moteur 3D · 2/4 · monde
   Relief (plateau bauxitique, fosse en gradins, escarpement, plaine
   côtière, rivière, littoral), pistes, eau, ciel, végétation,
   installations portuaires et villages.
   Unités : mètres. +X = vers l'océan (ouest), le soleil s'y couche.
   ===================================================================== */
(function (root) {
  'use strict';
  var A = root.AOSX;
  if (!A) return;
  var T = A.T, clamp = A.clamp, lerp = A.lerp, sm = A.smooth, noise = A.noise, fbm = A.fbm;
  var W = A.W = {};

  /* ------------------------------------------------------------------ */
  /* Matériaux                                                            */
  /* ------------------------------------------------------------------ */
  A.initMaterials = function () {
    function std(o, key, extra) { return A.patch(new T.MeshStandardMaterial(o), key, extra); }
    var M = A.M = {};
    M.terrain = std({ vertexColors: true, roughness: 1, metalness: 0 }, 'terrain', A.terrainExtra);
    M.uber = std({ vertexColors: true, roughness: 1, metalness: 0 }, 'uber', A.uberExtra);
    M.road = std({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }, 'terrain', A.terrainExtra);
    M.heap = M.terrain;
    M.water = std({ color: 0x0d2a2c, roughness: 0.09, metalness: 0, envMapIntensity: 1.0 }, 'water', A.waterExtra);
    /* engins */
    M.yellow = std({ color: '#D49A17', roughness: 0.46, metalness: 0.05, vertexColors: true });
    M.white = std({ color: '#E7E4DC', roughness: 0.42, metalness: 0.02, vertexColors: true });
    M.green = std({ color: '#1B6634', roughness: 0.4, metalness: 0.05, vertexColors: true });
    M.gold = std({ color: '#C9A24E', roughness: 0.35, metalness: 0.6, vertexColors: true });
    M.dark = std({ color: '#2a2b2d', roughness: 0.7, metalness: 0.3, vertexColors: true });
    M.black = std({ color: '#151617', roughness: 0.6, metalness: 0.2, vertexColors: true });
    M.rubber = std({ color: '#121212', roughness: 0.93, metalness: 0, vertexColors: true });
    M.tire = std({ color: '#ffffff', roughness: 0.8, metalness: 0.08, vertexColors: true });
    M.rim = std({ color: '#B9B2A1', roughness: 0.42, metalness: 0.45, vertexColors: true });
    M.glass = std({ color: '#0a1317', roughness: 0.1, metalness: 0.15, envMapIntensity: 1.7 });
    M.steel = std({ color: '#8c9399', roughness: 0.36, metalness: 0.85, vertexColors: true });
    M.grey = std({ color: '#7b7f84', roughness: 0.6, metalness: 0.25, vertexColors: true });
    M.lightgrey = std({ color: '#b9bcbd', roughness: 0.55, metalness: 0.2, vertexColors: true });
    M.concrete = std({ color: '#a39f97', roughness: 0.92, metalness: 0, vertexColors: true });
    M.roofMetal = std({ color: '#9aa1a5', roughness: 0.55, metalness: 0.5, vertexColors: true });
    M.roofBlue = std({ color: '#2f5f86', roughness: 0.45, metalness: 0.45, vertexColors: true });
    M.rust = std({ color: '#6a3524', roughness: 0.8, metalness: 0.2, vertexColors: true });
    M.hull = std({ color: '#1b1e21', roughness: 0.55, metalness: 0.25, vertexColors: true });
    M.hullRed = std({ color: '#7a2620', roughness: 0.6, metalness: 0.15, vertexColors: true });
    M.deck = std({ color: '#5b6b55', roughness: 0.8, metalness: 0.1, vertexColors: true });
    M.hatch = std({ color: '#7a3b27', roughness: 0.7, metalness: 0.2, vertexColors: true });
    M.orange = std({ color: '#E2621B', roughness: 0.5, vertexColors: true });
    M.red = std({ color: '#B3261E', roughness: 0.5, vertexColors: true });
    M.wood = std({ color: '#6b4a2e', roughness: 0.9, vertexColors: true });
    M.paintBlue = std({ color: '#2a5d9c', roughness: 0.5, vertexColors: true });
    M.paintTeal = std({ color: '#1f8a83', roughness: 0.5, vertexColors: true });
    M.paintYellow2 = std({ color: '#E8C02A', roughness: 0.5, vertexColors: true });
    M.thatch = std({ color: '#8e7646', roughness: 1, vertexColors: true });
    M.wall = std({ color: '#c9b79b', roughness: 0.95, vertexColors: true });
    /* lumières (émissives, pilotées jour/nuit) */
    M.lampW = std({ color: '#fff3dc', emissive: '#ffe3b0', emissiveIntensity: 0.2, roughness: 0.3 });
    M.lampR = std({ color: '#5a0d0d', emissive: '#ff2a1a', emissiveIntensity: 0.3, roughness: 0.3 });
    M.lampA = std({ color: '#6a3a00', emissive: '#ff8a10', emissiveIntensity: 0.3, roughness: 0.3 });
    M.lampG = std({ color: '#0a3a12', emissive: '#30ff5a', emissiveIntensity: 0.3, roughness: 0.3 });
    M.windowLit = std({ color: '#1a2226', emissive: '#ffc27a', emissiveIntensity: 0.0, roughness: 0.2, metalness: 0.2 });
    /* décors texturés */
    M.flag = std({ map: A.tex.flagGN(), side: T.DoubleSide, roughness: 0.8 }, 'flag', function (shader) {
      shader.uniforms.uTime = A.U.uTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat fk = uv.x; transformed.z += sin(uv.x * 6.0 - uTime * 6.0) * 0.35 * fk; transformed.y -= fk * fk * 0.25;');
    });
    M.helipad = std({ map: A.tex.helipad(), roughness: 0.8 });
    var frondTex = A.tex.frond(), grassTex = A.tex.grass();
    M.leaves = std({ vertexColors: true, roughness: 0.85, metalness: 0 }, 'foliage', A.foliageExtra);
    M.trunk = std({ vertexColors: true, roughness: 0.95, metalness: 0 }, 'foliage', A.foliageExtra);
    M.frond = std({ map: frondTex, alphaTest: 0.45, side: T.DoubleSide, roughness: 0.8, vertexColors: true }, 'foliageA', A.foliageExtra);
    M.grass = std({ map: grassTex, alphaTest: 0.4, side: T.DoubleSide, roughness: 0.95, vertexColors: true }, 'foliageA', A.foliageExtra);
    M.houseWall = std({ vertexColors: true, roughness: 0.95 }, 'houses', A.housesExtra);
    M.houseRoof = std({ vertexColors: true, roughness: 0.72, metalness: 0.25 }, 'fog');
    M.hutRoof = std({ vertexColors: true, roughness: 1 }, 'fog');
    /* clés « salissables » (teinte de poussière de bauxite) et sans ombre */
    A.DIRTY = { yellow: 1, white: 1, green: 0.8, dark: 0.6, rim: 1, rubber: 0.5, grey: 0.7, hull: 0.3, hullRed: 0.2, steel: 0.5, lightgrey: 0.6, concrete: 0.4, gold: 0.5, black: 0.4 };
    A.NOSHADOW = { glass: 1, lampW: 1, lampR: 1, lampA: 1, lampG: 1, windowLit: 1 };
    return M;
  };
  /* matériaux de marque (textures « GROUPE AOS » dessinées après chargement des polices) */
  A.initBrandMaterials = function () {
    var M = A.M;
    function dec(tex) { return A.patch(new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.45, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4, depthWrite: false }), 'fog'); }
    M.brandDoor = dec(A.tex.brand({ w: 512, h: 256, text: 'AOS', sub: 'GROUPE AOS', color: '#16592C', cy: 0.42 }));
    M.brandTank = dec(A.tex.brand({ w: 1024, h: 256, text: 'GROUPE AOS', color: '#16592C', size: 110, cy: 0.42 }));
    M.brandHull = dec(A.tex.brand({ w: 1024, h: 256, text: 'GROUPE AOS', color: '#F3F0E8', size: 120, cy: 0.5 }));
    M.brandWhite = dec(A.tex.brand({ w: 512, h: 256, text: 'AOS', color: '#F3F0E8', cy: 0.5 }));
  };

  /* ------------------------------------------------------------------ */
  /* Chemins (pistes, rivière) avec index spatial                         */
  /* ------------------------------------------------------------------ */
  function Path(pts, o) {
    o = o || {};
    this.w = o.w || 9; this.blend = o.blend || 14; this.closed = !!o.closed;
    var vs = pts.map(function (p) { return new T.Vector3(p[0], 0, p[1]); });
    var c = new T.CatmullRomCurve3(vs, this.closed, 'centripetal');
    var L = c.getLength(), n = Math.max(2, Math.ceil(L / (o.step || 4)));
    this.n = n + 1;
    this.x = new Float32Array(n + 1); this.z = new Float32Array(n + 1); this.s = new Float32Array(n + 1); this.y = new Float32Array(n + 1);
    var v = new T.Vector3(), i;
    for (i = 0; i <= n; i++) {
      c.getPointAt(i / n, v);
      this.x[i] = v.x; this.z[i] = v.z;
      this.s[i] = i ? this.s[i - 1] + Math.hypot(v.x - this.x[i - 1], v.z - this.z[i - 1]) : 0;
    }
    this.L = this.s[n];
    var R = this.R = this.w + this.blend + 4;
    this.cell = 40;
    var minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
    for (i = 0; i <= n; i++) { minx = Math.min(minx, this.x[i]); maxx = Math.max(maxx, this.x[i]); minz = Math.min(minz, this.z[i]); maxz = Math.max(maxz, this.z[i]); }
    this.gx0 = minx - R; this.gz0 = minz - R;
    this.gw = Math.ceil((maxx - minx + 2 * R) / this.cell) + 1; this.gh = Math.ceil((maxz - minz + 2 * R) / this.cell) + 1;
    this.grid = new Array(this.gw * this.gh);
    for (i = 0; i < n; i++) {
      var x0 = Math.min(this.x[i], this.x[i + 1]) - R, x1 = Math.max(this.x[i], this.x[i + 1]) + R;
      var z0 = Math.min(this.z[i], this.z[i + 1]) - R, z1 = Math.max(this.z[i], this.z[i + 1]) + R;
      var gi0 = Math.floor((x0 - this.gx0) / this.cell), gi1 = Math.floor((x1 - this.gx0) / this.cell);
      var gj0 = Math.floor((z0 - this.gz0) / this.cell), gj1 = Math.floor((z1 - this.gz0) / this.cell);
      for (var gj = gj0; gj <= gj1; gj++) for (var gi = gi0; gi <= gi1; gi++) {
        var k = gj * this.gw + gi;
        (this.grid[k] || (this.grid[k] = [])).push(i);
      }
    }
  }
  Path.prototype.query = function (x, z, out) {
    var gi = Math.floor((x - this.gx0) / this.cell), gj = Math.floor((z - this.gz0) / this.cell);
    if (gi < 0 || gj < 0 || gi >= this.gw || gj >= this.gh) return false;
    var list = this.grid[gj * this.gw + gi];
    if (!list) return false;
    var best = this.R * this.R, bi = -1, bt = 0, X = this.x, Z = this.z;
    for (var k = 0; k < list.length; k++) {
      var i = list[k], ax = X[i], az = Z[i], bx = X[i + 1] - ax, bz = Z[i + 1] - az;
      var t = ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz + 1e-9);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var dx = x - (ax + bx * t), dz = z - (az + bz * t), d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    if (bi < 0) return false;
    var ax2 = X[bi], az2 = Z[bi], tx = X[bi + 1] - ax2, tz = Z[bi + 1] - az2;
    var cr = tx * (z - az2) - tz * (x - ax2);
    out.d = Math.sqrt(best);
    out.lat = cr < 0 ? -out.d : out.d;
    out.s = this.s[bi] + (this.s[bi + 1] - this.s[bi]) * bt;
    out.y = this.y[bi] + (this.y[bi + 1] - this.y[bi]) * bt;
    out.i = bi; out.t = bt;
    return true;
  };
  /* point + tangente à l'abscisse s */
  Path.prototype.at = function (s, out) {
    s = clamp(s, 0, this.L);
    var lo = 0, hi = this.n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (this.s[mid] <= s) lo = mid; else hi = mid; }
    var t = (s - this.s[lo]) / Math.max(1e-6, this.s[hi] - this.s[lo]);
    out.x = this.x[lo] + (this.x[hi] - this.x[lo]) * t;
    out.z = this.z[lo] + (this.z[hi] - this.z[lo]) * t;
    out.y = this.y[lo] + (this.y[hi] - this.y[lo]) * t;
    var dx = this.x[hi] - this.x[lo], dz = this.z[hi] - this.z[lo], l = Math.hypot(dx, dz) || 1;
    out.dx = dx / l; out.dz = dz / l;
    return out;
  };
  /* profil en long : lissage + pente maximale */
  Path.prototype.profile = function (hf, win, maxGrade, minY) {
    var n = this.n, raw = new Float32Array(n), i, j;
    for (i = 0; i < n; i++) raw[i] = hf(this.x[i], this.z[i]);
    var step = this.L / (n - 1), hw = Math.max(1, Math.round(win / step / 2)), sm1 = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var s = 0, c = 0;
      for (j = -hw; j <= hw; j++) { var k = clamp(i + j, 0, n - 1); s += raw[k]; c++; }
      sm1[i] = s / c;
    }
    var g = maxGrade * step;
    for (var it = 0; it < 3; it++) {
      for (i = 1; i < n; i++) sm1[i] = clamp(sm1[i], sm1[i - 1] - g, sm1[i - 1] + g);
      for (i = n - 2; i >= 0; i--) sm1[i] = clamp(sm1[i], sm1[i + 1] - g, sm1[i + 1] + g);
    }
    for (i = 0; i < n; i++) this.y[i] = Math.max(sm1[i], minY === undefined ? -1e9 : minY);
  };
  A.Path = Path;
  function offsetPts(pts, off) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      var dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      out.push([pts[i][0] - dz / l * off, pts[i][1] + dx / l * off]);
    }
    return out;
  }
  W.offsetPts = offsetPts;

  /* ------------------------------------------------------------------ */
  /* Implantation                                                         */
  /* ------------------------------------------------------------------ */
  var PIT = W.PIT = { cx: -1450, cz: -70, hx: 300, hz: 150, rr: 90, rot: 0.1, rim: 41.5, bh: 6.5, nb: 4, bw: 16, face: 4.6 };
  PIT.c = Math.cos(PIT.rot); PIT.s = Math.sin(PIT.rot);
  PIT.floor = PIT.rim - PIT.nb * PIT.bh;
  PIT.inner = PIT.nb * PIT.bw;
  W.pitL2W = function (px, pz) { return [PIT.cx + px * PIT.c - pz * PIT.s, PIT.cz + px * PIT.s + pz * PIT.c]; };
  W.pitW2L = function (x, z) { var dx = x - PIT.cx, dz = z - PIT.cz; return [dx * PIT.c + dz * PIT.s, -dx * PIT.s + dz * PIT.c]; };
  var RAMP = W.RAMP = { x0: 200, x1: -80, d0: 6, d1: 70, hw: 9, blend: 7 };
  W.EXC = { lx: -112, lz: -50 };          /* pelle (repère fosse) */
  W.LOAD = { lx: -127, lz: -40 };         /* arrêt de chargement des tombereaux */
  W.MUCK = { lx: -110, lz: -73, r: 17, h: 4.6 };
  W.ROM = { x: -1060, z: 40, hx: 72, hz: 62, h: PIT.rim };
  W.MINEPAD = { x: -1190, z: 200, hx: 60, hz: 38, h: PIT.rim };
  W.PORT = { x0: -265, x1: 168, z0: -275, z1: 175, h: 3.3 };
  W.QUAY = 168;
  W.JETTY = { x0: 166, x1: 336, z: -50, w: 16, h: 4.4 };
  W.FUELJETTY = { x0: 166, x1: 292, z: 142, w: 8, h: 4.2 };
  W.SHIP = { x: 1500, z: -120 };
  W.RIG = { x: 3300, z: 900 };
  W.DUMP = { lx: 0, lz: -255, hx: 175, hz: 58, h: 18 };

  function coastX(z) {
    return 175 + 62 * Math.sin(z * 0.0016 + 1.2) + 30 * Math.sin(z * 0.0043 + 0.3) + 14 * Math.sin(z * 0.0117 + 2.4) + 22 * fbm(z * 0.0021, 4.4, 3);
  }
  W.coastX = coastX;

  /* relief naturel (LOD_CELL = taille de maille locale : le bruit plus fin que la maille est filtré) */
  var LOD_CELL = 0;
  function natural(x, z) {
    var u = coastX(z) - x, h;
    if (u <= 0) {
      return u * 0.0125 - 0.9 * sm(0, -30, u) + 0.5 * fbm(x * 0.004, z * 0.004, 2) * sm(0, -150, u);
    }
    h = 10.5 * (1 - Math.exp(-u / 430)) + 1.25 * sm(0, 70, u);
    var scarp = 1060 + 80 * fbm(z * 0.0024 + 3.1, 1.7, 3) + 35 * Math.sin(z * 0.0037);
    var ue = u - scarp + 26 * fbm(x * 0.006, z * 0.006, 2);
    h += 30.2 * sm(-85, 85, ue);
    var pl = sm(0, 350, ue);
    var lodM = 1 - sm(60, 160, LOD_CELL), lodS = 1 - sm(6, 22, LOD_CELL);
    h += pl * 2.6 * fbm(x * 0.0019 + 7.3, z * 0.0019, 3);
    var far = sm(2400, 5200, u);
    if (far > 0) {
      var m = fbm(x * 0.00042 + 1.7, z * 0.00042 - 2.3, 4);
      h += far * (sm(0.02, 0.2, m) * 120 + sm(0.28, 0.42, m) * 95 + 28 * fbm(x * 0.0013, z * 0.0013, 3 - (LOD_CELL > 120 ? 1 : 0)));
    }
    h += (0.85 * fbm(x * 0.011, z * 0.011, 3) * lodM + 0.35 * noise(x * 0.043, z * 0.043) * lodS) * sm(10, 160, u);
    return h;
  }

  var RIVER = new Path([[-830, 1120], [-720, 990], [-590, 1015], [-450, 925], [-320, 950], [-190, 840], [-60, 775], [60, 712], [165, 668], [290, 650], [520, 640], [900, 650]], { w: 120, blend: 40, step: 6 });
  W.RIVER = RIVER;
  function riverHalfW(s) { return lerp(26, 92, sm(0, RIVER.L * 0.8, s)); }

  function padW(x, z, cx, cz, hx, hz, blend) {
    var dx = Math.abs(x - cx) - hx, dz = Math.abs(z - cz) - hz;
    var d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
    return 1 - sm(0, blend, d);
  }

  /* fosse : gradins (distance signée à un rectangle arrondi) + rampe + tas abattu */
  var Q0 = {};
  function pitSample(x, z, h, o) {
    var dx = x - PIT.cx, dz = z - PIT.cz;
    var px = dx * PIT.c + dz * PIT.s, pz = -dx * PIT.s + dz * PIT.c;
    if (Math.abs(px) > PIT.hx + 30 || Math.abs(pz) > PIT.hz + 30) return h;
    var qx = Math.abs(px) - (PIT.hx - PIT.rr), qz = Math.abs(pz) - (PIT.hz - PIT.rr);
    var sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - PIT.rr;
    var d = -sd + 4.5 * fbm(x * 0.021, z * 0.021, 2);
    o.pitD = d;
    if (d <= 0) {
      if (d > -30) o.dist = Math.max(o.dist, sm(-30, 0, d));
      return h;
    }
    var k = d / PIT.bw, n = Math.floor(k), f = k - n, level;
    if (n >= PIT.nb) level = PIT.floor + 0.35 * fbm(x * 0.03, z * 0.03, 2);
    else {
      var fr = (PIT.face + 1.2 * noise(x * 0.05, z * 0.05)) / PIT.bw;
      var tt = sm(0, fr, f);
      level = PIT.rim - (n + tt) * PIT.bh;
      if (tt > 0.02 && tt < 0.98) o.strata = Math.max(o.strata, 1);
      level += 0.25 * noise(x * 0.09, z * 0.09) * (1 - tt) * tt * 4;
    }
    var hh = Math.min(h, level);
    /* rampe le long du flanc nord, de l'ouest (haut) vers l'est (bas) */
    if (px < RAMP.x0 + 40 && px > RAMP.x1 - 30) {
      var t = clamp((RAMP.x0 - px) / (RAMP.x0 - RAMP.x1), 0, 1);
      var zr = PIT.hz - lerp(RAMP.d0, RAMP.d1, t);
      var yr = PIT.rim - (PIT.rim - PIT.floor) * t;
      var ld = Math.abs(pz - zr);
      var endFade = sm(RAMP.x0 + 40, RAMP.x0, px) * sm(RAMP.x1 - 30, RAMP.x1, px);
      if (ld < RAMP.hw + RAMP.blend && endFade > 0) {
        var wgt = (1 - sm(RAMP.hw, RAMP.hw + RAMP.blend, ld)) * endFade;
        var target = yr + 0.12 * (1 - Math.pow(ld / RAMP.hw, 2));
        if (px > RAMP.x0) target = Math.min(h, PIT.rim);
        hh = lerp(hh, target, wgt);
        if (ld < RAMP.hw) { o.road = pz - zr; o.kind = 2; }
        if (wgt < 0.95 && wgt > 0.05) o.strata = Math.max(o.strata, 0.6);
      }
    }
    /* tas abattu devant la pelle */
    var mx = px - W.MUCK.lx, mz = pz - W.MUCK.lz, md = Math.sqrt(mx * mx * 0.55 + mz * mz);
    if (md < W.MUCK.r) {
      var mh = W.MUCK.h * Math.pow(1 - md / W.MUCK.r, 1.4) * (0.85 + 0.3 * noise(x * 0.25, z * 0.25));
      hh = Math.max(hh, PIT.floor + mh + 0.4 * noise(x * 0.6, z * 0.6));
    }
    o.dist = 1;
    return hh;
  }

  /* verse à stériles (deux banquettes) */
  function dumpSample(x, z, h, o) {
    var D = W.DUMP, c = W.pitL2W(D.lx, D.lz);
    var dx = x - c[0], dz = z - c[1];
    var px = dx * PIT.c + dz * PIT.s, pz = -dx * PIT.s + dz * PIT.c;
    var qx = Math.abs(px) - (D.hx - 40), qz = Math.abs(pz) - (D.hz - 40);
    var sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 40;
    var d = -sd + 6 * fbm(x * 0.015, z * 0.015, 2);
    if (d < -30) return h;
    var base = natural(c[0], c[1]);
    var add = 9 * sm(0, 13, d) + 9 * sm(20, 33, d);
    if (d > -30 && d < 36) { o.dist = Math.max(o.dist, sm(-30, 0, d)); }
    if (d > 0 && ((d < 13) || (d > 20 && d < 33))) o.strata = Math.max(o.strata, 0.45);
    return Math.max(h, base + add + 0.3 * noise(x * 0.07, z * 0.07));
  }

  var ROADS = [];
  W.ROADS = ROADS;

  /* Échantillon complet du terrain : hauteur + attributs de surface */
  var QR = {};
  function S(x, z, o, noRoads) {
    o.kind = 0; o.road = 999; o.strata = 0; o.dist = 0; o.wet = 0; o.pad = 0; o.pitD = -999;
    var u = coastX(z) - x;
    var h = natural(x, z);
    o.u = u;
    var grass = u > 0 ? lerp(0.95, 0.82, sm(900, 1300, u)) : 0;
    /* rivière */
    if (RIVER.query(x, z, QR)) {
      var hw = riverHalfW(QR.s);
      if (QR.d < hw) { var bed = -3.2 + 3.8 * sm(hw * 0.2, hw, QR.d); h = Math.min(h, bed); }
      else { var tb = sm(hw, hw + 38, QR.d); h = lerp(Math.min(h, 0.7), h, tb); }
      o.wet = Math.max(o.wet, 1 - sm(hw, hw + 30, QR.d));
      o.river = 1 - sm(hw * 0.6, hw + 10, QR.d);
    } else o.river = 0;
    /* plateformes */
    var P = W.PORT, t;
    t = padW(x, z, (P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, (P.x1 - P.x0) / 2, (P.z1 - P.z0) / 2, 30);
    if (t > 0) {
      if (x > W.QUAY + 2 && z > P.z0 - 10 && z < P.z1 + 10) { h = Math.min(h, lerp(h, -7.5, sm(W.QUAY + 2, W.QUAY + 8, x) * sm(P.z0 - 10, P.z0 + 10, z) * sm(P.z1 + 10, P.z1 - 10, z))); }
      else { h = lerp(h, P.h, t); o.pad = Math.max(o.pad, t); }
    }
    if (x > W.QUAY + 2 && x < 420 && z > P.z0 - 40 && z < P.z1 + 40) {
      var bas = sm(P.z0 - 40, P.z0, z) * sm(P.z1 + 40, P.z1, z) * sm(W.QUAY + 2, W.QUAY + 10, x) * sm(430, 380, x);
      h = Math.min(h, lerp(h, -7.5, bas));
    }
    var R = W.ROM;
    t = padW(x, z, R.x, R.z, R.hx, R.hz, 22);
    if (t > 0) { h = lerp(h, R.h, t); o.dist = Math.max(o.dist, t); }
    var MP = W.MINEPAD;
    t = padW(x, z, MP.x, MP.z, MP.hx, MP.hz, 20);
    if (t > 0) { h = lerp(h, MP.h, t); o.pad = Math.max(o.pad, t * 0.8); o.dist = Math.max(o.dist, t * 0.5); }
    /* verse + fosse */
    if (x < -1000 && x > -1900 && z > -480 && z < 200) {
      h = dumpSample(x, z, h, o);
      h = pitSample(x, z, h, o);
    }
    /* pistes */
    if (!noRoads) {
      for (var k = 0; k < ROADS.length; k++) {
        var rd = ROADS[k];
        if (!rd.query(x, z, QR)) continue;
        if (QR.d < rd.w) {
          h = QR.y + 0.1 * (1 - Math.pow(QR.d / rd.w, 2));
          o.road = QR.lat; o.kind = 2; grass = 0;
        } else if (QR.d < rd.w + rd.blend) {
          t = sm(rd.w, rd.w + rd.blend, QR.d);
          var dh = Math.abs(h - QR.y);
          h = lerp(QR.y, h, t);
          if (dh > 1.5 && t < 0.97) o.strata = Math.max(o.strata, 0.5 * sm(1.5, 5, dh));
          grass *= lerp(0.15, 1, t);
          o.dist = Math.max(o.dist, (1 - t) * 0.6);
        }
      }
    }
    grass *= (1 - o.dist) * (1 - o.pad * 0.95) * (1 - sm(0.2, 0.6, o.wet) * 0.5);
    if (h < 1.2) grass *= sm(0.3, 1.2, h);
    o.grass = grass;
    o.h = h;
    return h;
  }
  W.S = S;
  var QS = {};
  W.H = function (x, z) { return S(x, z, QS); };

  /* pistes : création + profils en long */
  function buildRoads() {
    var L = W.pitL2W;
    var rampTop = L(RAMP.x0, PIT.hz - RAMP.d0), rampTop2 = L(RAMP.x0 + 45, PIT.hz - 2), rampTop3 = L(RAMP.x0 + 80, PIT.hz + 18);
    /* piste minière : sommet de rampe -> plateforme ROM */
    var mine = new Path([rampTop, rampTop2, rampTop3, [-1160, 92], [-1125, 80], [-1100, 74]], { w: 9.5, blend: 12, step: 3 });
    mine.kind = 'mine';
    mine.profile(function (x, z) { return W.PIT.rim; }, 30, 0.05);
    ROADS.push(mine);
    W.MINEROAD = mine;
    /* route de la bauxite : ROM -> escarpement -> plaine -> port */
    var main = new Path([[-1010, 14], [-976, 22], [-945, 60], [-905, 120], [-850, 158], [-790, 162], [-745, 128], [-712, 84], [-685, 40], [-640, 16], [-560, 30], [-470, 52], [-380, 48], [-312, 14], [-262, -30], [-226, -74], [-205, -100]], { w: 8.2, blend: 15, step: 3 });
    main.kind = 'main';
    main.profile(function (x, z) { return S(x, z, QS, true); }, 70, 0.075, 2.6);
    ROADS.push(main);
    W.MAINROAD = main;
    /* pistes de villages */
    var v1 = new Path([[-470, 52], [-500, 130], [-540, 190], [-555, 250]], { w: 3.6, blend: 6, step: 3 });
    v1.profile(function (x, z) { return S(x, z, QS, true); }, 30, 0.12, 1.2);
    ROADS.push(v1);
    var v2 = new Path([[-380, 48], [-330, 150], [-300, 260], [-310, 380], [-290, 470]], { w: 3.6, blend: 6, step: 3 });
    v2.profile(function (x, z) { return S(x, z, QS, true); }, 30, 0.12, 1.2);
    ROADS.push(v2);
    W.VROADS = [v1, v2];
  }

  /* ------------------------------------------------------------------ */
  /* Construction du terrain                                              */
  /* ------------------------------------------------------------------ */
  function axis(min, max, coreMin, coreMax, fine, maxStep, growth) {
    var a = [], x;
    var left = [];
    x = coreMin; var st = fine;
    while (x > min) { st = Math.min(maxStep, st * growth); x -= st; left.push(Math.max(x, min)); }
    left.reverse();
    for (var i = 0; i < left.length; i++) a.push(left[i]);
    var n = Math.round((coreMax - coreMin) / fine);
    for (i = 0; i <= n; i++) a.push(coreMin + i * fine);
    x = coreMax; st = fine;
    while (x < max) { st = Math.min(maxStep, st * growth); x += st; a.push(Math.min(x, max)); }
    return new Float64Array(a);
  }

  var CL = {
    laterite: A.col('#874129'), lateriteDry: A.col('#985233'), bauxite: A.col('#a9502c'), bauxitePale: A.col('#ba724b'),
    crust: A.col('#6a3221'), road: A.col('#93502f'), roadDark: A.col('#74391f'), gravel: A.col('#8a7566'),
    sand: A.col('#b59c78'), mud: A.col('#4a4134'), seabed: A.col('#5a5141'), plain: A.col('#7d4a2e'), concrete: A.col('#9b958c')
  };
  var _c = new T.Color(), _c2 = new T.Color();
  function surfaceColor(x, z, o, out) {
    var n1 = fbm(x * 0.006 + 11.3, z * 0.006 - 4.1, 3), n2 = noise(x * 0.035, z * 0.035);
    var h = o.h;
    if (h < -0.4) { out.copy(CL.seabed); }
    else if (o.kind === 2) { out.copy(CL.road).lerp(CL.roadDark, 0.3 + 0.3 * n1); }
    else if (o.dist > 0.01) {
      _c.copy(CL.bauxite).lerp(CL.bauxitePale, clamp(0.22 + n1 * 0.75 + n2 * 0.25, 0, 1));
      _c2.copy(CL.laterite).lerp(CL.lateriteDry, clamp(0.5 + n1, 0, 1));
      out.copy(_c2).lerp(_c, clamp(o.dist, 0, 1));
      if (o.pitD > 0 && o.pitD < 3) out.lerp(CL.crust, 0.5);
    } else {
      out.copy(CL.laterite).lerp(CL.lateriteDry, clamp(0.5 + n1 * 1.2, 0, 1));
      if (o.u < 900) out.lerp(CL.plain, sm(900, 300, o.u) * 0.5);
      if (h < 1.6 && o.u > -5) {
        var nearMouth = sm(420, 120, Math.abs(z - 640)) + o.river;
        _c.copy(CL.sand).lerp(CL.mud, clamp(nearMouth + o.wet * 0.6, 0, 1));
        out.lerp(_c, sm(1.6, 0.7, h));
      }
    }
    if (o.pad > 0.01) { _c.copy(CL.gravel).lerp(CL.concrete, clamp(0.3 + n2 * 0.4, 0, 1)); out.lerp(_c, clamp(o.pad, 0, 1)); }
    out.multiplyScalar(0.92 + 0.16 * n2);
    return out;
  }

  W.buildTerrain = function (Q) {
    buildRoads();
    var o = {}, col = new T.Color();
    var fine = Q.terrainFine;
    var xs = axis(-9000, 560, -1820, 420, fine, Q.lite ? 260 : 150, 1.07);
    var zs = axis(-7000, 7000, -560, 1180, fine, Q.lite ? 260 : 150, 1.07);
    /* tuile haute définition de la fosse, alignée sur la grille de base */
    function idx(arr, v) { var best = 0, bd = 1e9; for (var i = 0; i < arr.length; i++) { var d = Math.abs(arr[i] - v); if (d < bd) { bd = d; best = i; } } return best; }
    var ex = PIT.hx * PIT.c + PIT.hz * PIT.s + 28, ez = PIT.hx * PIT.s + PIT.hz * PIT.c + 28;
    var ti0 = idx(xs, PIT.cx - ex), ti1 = idx(xs, PIT.cx + ex), tj0 = idx(zs, PIT.cz - ez - 8), tj1 = idx(zs, PIT.cz + ez + 30);
    var TX0 = xs[ti0], TX1 = xs[ti1], TZ0 = zs[tj0], TZ1 = zs[tj1];

    function makeGrid(gx, gz, hole) {
      var nx = gx.length, nz = gz.length, N = nx * nz;
      var pos = new Float32Array(N * 3), colA = new Float32Array(N * 3), aux = new Float32Array(N * 4);
      for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) {
        var k = j * nx + i, x = gx[i], z = gz[j];
        var cdx = Math.max(gx[Math.min(i + 1, nx - 1)] - gx[i], gx[i] - gx[Math.max(i - 1, 0)]);
        var cdz = Math.max(gz[Math.min(j + 1, nz - 1)] - gz[j], gz[j] - gz[Math.max(j - 1, 0)]);
        LOD_CELL = Math.max(cdx, cdz);
        S(x, z, o);
        pos[k * 3] = x; pos[k * 3 + 1] = o.h; pos[k * 3 + 2] = z;
        surfaceColor(x, z, o, col);
        colA[k * 3] = col.r; colA[k * 3 + 1] = col.g; colA[k * 3 + 2] = col.b;
        aux[k * 4] = clamp(o.wet + (o.h < 0.8 ? sm(0.8, 0.0, o.h) : 0), 0, 1);
        aux[k * 4 + 1] = o.strata;
        aux[k * 4 + 2] = o.road;
        aux[k * 4 + 3] = o.grass;
      }
      LOD_CELL = 0;
      var cells = (nx - 1) * (nz - 1), ind = N > 65535 ? new Uint32Array(cells * 6) : new Uint16Array(cells * 6), q = 0;
      for (j = 0; j < nz - 1; j++) for (i = 0; i < nx - 1; i++) {
        if (hole && i >= hole[0] && i < hole[1] && j >= hole[2] && j < hole[3]) continue;
        var a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        ind[q++] = a; ind[q++] = c; ind[q++] = b; ind[q++] = b; ind[q++] = c; ind[q++] = d;
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('color', new T.BufferAttribute(colA, 3));
      g.setAttribute('aAux', new T.BufferAttribute(aux, 4));
      g.setIndex(new T.BufferAttribute(ind.subarray(0, q), 1));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    }
    var base = makeGrid(xs, zs, [ti0, ti1, tj0, tj1]);
    var sub = Q.lite ? 2 : 3;
    var txs = [], tzs = [], i;
    for (i = ti0; i < ti1; i++) for (var s2 = 0; s2 < sub; s2++) txs.push(xs[i] + (xs[i + 1] - xs[i]) * s2 / sub);
    txs.push(xs[ti1]);
    for (i = tj0; i < tj1; i++) for (s2 = 0; s2 < sub; s2++) tzs.push(zs[i] + (zs[i + 1] - zs[i]) * s2 / sub);
    tzs.push(zs[tj1]);
    var tile = makeGrid(txs, tzs, null);
    var g = new T.Group();
    var m1 = new T.Mesh(base, A.M.terrain); m1.receiveShadow = true; m1.castShadow = false; g.add(m1);
    var m2 = new T.Mesh(tile, A.M.terrain); m2.receiveShadow = true; m2.castShadow = true; g.add(m2);
    /* jupe autour de la tuile (masque les micro-fissures) */
    var skirt = [];
    function edge(ax, az, bx, bz) {
      var n = Math.ceil(Math.hypot(bx - ax, bz - az) / (fine / sub));
      for (var e = 0; e < n; e++) {
        var x0 = lerp(ax, bx, e / n), z0 = lerp(az, bz, e / n), x1 = lerp(ax, bx, (e + 1) / n), z1 = lerp(az, bz, (e + 1) / n);
        var y0 = W.H(x0, z0), y1 = W.H(x1, z1);
        skirt.push(x0, y0, z0, x1, y1, z1, x0, y0 - 2, z0, x1, y1, z1, x1, y1 - 2, z1, x0, y0 - 2, z0);
      }
    }
    edge(TX0, TZ0, TX1, TZ0); edge(TX1, TZ0, TX1, TZ1); edge(TX1, TZ1, TX0, TZ1); edge(TX0, TZ1, TX0, TZ0);
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(skirt, 3));
    var sc = new Float32Array(skirt.length); for (i = 0; i < sc.length; i += 3) { sc[i] = CL.laterite.r; sc[i + 1] = CL.laterite.g; sc[i + 2] = CL.laterite.b; }
    sg.setAttribute('color', new T.BufferAttribute(sc, 3));
    var sa = new Float32Array(skirt.length / 3 * 4); for (i = 0; i < sa.length; i += 4) { sa[i + 2] = 999; sa[i + 3] = 0.5; }
    sg.setAttribute('aAux', new T.BufferAttribute(sa, 4));
    sg.computeVertexNormals();
    var m3 = new T.Mesh(sg, A.M.terrain); m3.receiveShadow = true; g.add(m3);
    /* rubans de pistes (bords nets, merlons de sécurité, ornières) */
    g.add(buildRibbons(Q));
    W.tileRect = [TX0, TX1, TZ0, TZ1];
    return g;
  };

  function buildRibbons(Q) {
    var grp = new T.Group(), o = {}, col = new T.Color();
    ROADS.forEach(function (rd) {
      var W2 = rd.w, berm = rd.kind ? 1.0 : 0.35, offs;
      if (rd.kind) offs = [-(W2 + 4), -(W2 + 1.9), -(W2 + 0.9), -(W2 + 0.2), -W2 + 0.6, -W2 * 0.5, 0, W2 * 0.5, W2 - 0.6, W2 + 0.2, W2 + 0.9, W2 + 1.9, W2 + 4];
      else offs = [-(W2 + 2), -(W2 + 0.4), -W2 * 0.5, 0, W2 * 0.5, W2 + 0.4, W2 + 2];
      var nc = offs.length, step = 2.4, ns = Math.ceil(rd.L / step) + 1;
      var pos = new Float32Array(ns * nc * 3), cl = new Float32Array(ns * nc * 3), aux = new Float32Array(ns * nc * 4), p = {};
      for (var i = 0; i < ns; i++) {
        rd.at(Math.min(rd.L, i * step), p);
        var nx = -p.dz, nz = p.dx;
        for (var j = 0; j < nc; j++) {
          var off = offs[j], x = p.x + nx * off, z = p.z + nz * off, y, k = (i * nc + j);
          var a = Math.abs(off), isEdge = j === 0 || j === nc - 1;
          if (isEdge) y = W.H(x, z) - 0.06;
          else if (a <= W2 - 0.5) y = p.y + 0.1 * (1 - Math.pow(a / W2, 2)) + 0.04;
          else if (rd.kind && a > W2 + 0.5 && a < W2 + 1.5) y = p.y + berm;
          else y = p.y + (rd.kind ? berm * 0.35 : 0.06);
          pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
          S(x, z, o);
          if (a <= W2) { col.copy(CL.road).lerp(CL.roadDark, 0.25 + 0.25 * noise(x * 0.05, z * 0.05)); }
          else { col.copy(CL.bauxite).lerp(CL.laterite, isEdge ? 0.8 : 0.35); if (isEdge) surfaceColor(x, z, o, col); }
          col.multiplyScalar(0.94 + 0.1 * noise(x * 0.11, z * 0.11));
          cl[k * 3] = col.r; cl[k * 3 + 1] = col.g; cl[k * 3 + 2] = col.b;
          aux[k * 4] = 0; aux[k * 4 + 1] = a > W2 ? 0.3 : 0; aux[k * 4 + 2] = a <= W2 ? off : 999; aux[k * 4 + 3] = isEdge ? o.grass : (a > W2 ? 0.15 : 0);
        }
      }
      var ind = [];
      for (i = 0; i < ns - 1; i++) for (j = 0; j < nc - 1; j++) { var a0 = i * nc + j, b0 = a0 + 1, c0 = a0 + nc, d0 = c0 + 1; ind.push(a0, b0, c0, b0, d0, c0); }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('color', new T.BufferAttribute(cl, 3));
      g.setAttribute('aAux', new T.BufferAttribute(aux, 4));
      g.setIndex(ind);
      g.computeVertexNormals();
      /* orientation des triangles : normales vers le haut */
      var nrm = g.attributes.normal;
      if (nrm.getY(Math.floor(nc / 2)) < 0) { for (var q = 0; q < ind.length; q += 3) { var tmp = ind[q + 1]; ind[q + 1] = ind[q + 2]; ind[q + 2] = tmp; } g.setIndex(ind); g.computeVertexNormals(); }
      var m = new T.Mesh(g, A.M.road); m.receiveShadow = true;
      grp.add(m);
    });
    return grp;
  }

  /* ------------------------------------------------------------------ */
  /* Eau + texture de profondeur littorale                                */
  /* ------------------------------------------------------------------ */
  W.buildWater = function (Q) {
    var x0 = -1000, x1 = 3800, z0 = -2400, z1 = 2600, res = Q.lite ? 12 : 8;
    var nx = Math.ceil((x1 - x0) / res), nz = Math.ceil((z1 - z0) / res), data = new Uint8Array(nx * nz * 4), o = {};
    for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) {
      var x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res, k = (j * nx + i) * 4;
      var h = S(x, z, o, true);
      data[k] = Math.round(255 * clamp(-h / 30, 0, 1));
      var plume = Math.max(o.river, Math.exp(-Math.pow((z - 650) / 260, 2)) * sm(1200, 200, x) * sm(-300, 100, x));
      data[k + 1] = Math.round(255 * clamp(plume, 0, 1));
      data[k + 2] = 0; data[k + 3] = 255;
    }
    var tex = new T.DataTexture(data, nx, nz, T.RGBAFormat, T.UnsignedByteType);
    tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearFilter; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    A.U.uShore.value = tex;
    A.U.uShoreRect.value.set(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0));
    var geo = new T.PlaneGeometry(36000, 36000, 64, 64);
    geo.rotateX(-Math.PI / 2);
    geo.translate(9000, 0, 0);
    var m = new T.Mesh(geo, A.M.water);
    m.receiveShadow = true;
    m.renderOrder = 1;
    return m;
  };

  /* ------------------------------------------------------------------ */
  /* Végétation (instanciée, par tuiles pour le culling)                  */
  /* ------------------------------------------------------------------ */
  /* houppier : grappe de lobes irréguliers, normales « volumiques » (mélange
     normale de face / direction depuis le centre) pour un feuillage doux */
  function crownGeo(r, blobs, seed, flat, colTop, colBot, detail) {
    var rr = A.rng(seed), list = [];
    for (var b = 0; b < blobs; b++) {
      var a = rr() * Math.PI * 2, rad = b === 0 ? 0 : Math.sqrt(rr()) * r * 0.66;
      var y = b === 0 ? 0 : (rr() - 0.35) * r * 0.6 * flat;
      var br = r * (0.4 + rr() * 0.24) * (b === 0 ? 1.25 : 1);
      var g = new T.IcosahedronGeometry(br, detail === undefined ? 1 : detail);
      g.scale(1, 0.7 * flat + 0.25, 1);
      g.translate(Math.cos(a) * rad, y, Math.sin(a) * rad);
      list.push(g);
    }
    var g2 = A.merge(list);
    var p = g2.attributes.position, n = p.count, c = new Float32Array(n * 3), ct = new T.Color(colTop), cb = new T.Color(colBot), tc = new T.Color();
    var minY = 1e9, maxY = -1e9, i;
    for (i = 0; i < n; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
    var cy = (minY + maxY) * 0.5;
    for (i = 0; i < n; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      var l = Math.hypot(x, (y - cy) * 1.2, z) || 1;
      var dn = (noise(x * 1.1 + seed, z * 1.1 + y * 0.7) * 0.5 + noise(x * 2.9 - seed, z * 2.9 + y * 2.1) * 0.25) * r * 0.55;
      p.setXYZ(i, x + x / l * dn, y + (y - cy) / l * dn * 0.6, z + z / l * dn);
    }
    g2.computeVertexNormals();
    var nr = g2.attributes.normal, v = new T.Vector3(), q = new T.Vector3();
    for (i = 0; i < n; i++) {
      x = p.getX(i); y = p.getY(i); z = p.getZ(i);
      q.set(x, (y - cy) * 1.3 + r * 0.25, z).normalize();
      v.set(nr.getX(i), nr.getY(i), nr.getZ(i)).lerp(q, 0.62);
      if (v.lengthSq() < 1e-4) v.copy(q); else v.normalize();
      nr.setXYZ(i, v.x, v.y, v.z);
      var k = (y - minY) / (maxY - minY + 1e-6), rad2 = Math.hypot(x, z) / (r * 1.3);
      tc.copy(cb).lerp(ct, clamp(Math.pow(k, 0.75) * 0.8 + rad2 * 0.35, 0, 1));
      tc.multiplyScalar(0.82 + 0.36 * (noise(x * 1.7, z * 1.7 + y) * 0.5 + 0.5));
      c[i * 3] = tc.r; c[i * 3 + 1] = tc.g; c[i * 3 + 2] = tc.b;
    }
    g2.setAttribute('color', new T.BufferAttribute(c, 3));
    return g2;
  }
  function paint(g, hex) {
    var n = g.attributes.position.count, c = new Float32Array(n * 3), cc = new T.Color(hex);
    for (var i = 0; i < n; i++) { c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    return g;
  }
  A.paint = paint;
  function treeTypes(Q) {
    var types = {};
    function both(build) { return { hi: build(1), lo: build(0) }; }
    /* grand arbre de savane (fromager, néré) : tronc, branches, houppier étalé */
    types.tall = both(function (lod) {
      var trunk = paint(A.cyl(0.32, 0.7, 6.5, lod ? 7 : 5, [0, 3.25, 0]), '#5a4838');
      var parts = [trunk];
      if (lod) {
        parts.push(paint(A.bar([0, 4.8, 0], [3.0, 7.6, 0.9], 0.24, 5), '#5a4838'));
        parts.push(paint(A.bar([0, 5.2, 0], [-2.6, 7.9, -1.5], 0.21, 5), '#5a4838'));
        parts.push(paint(A.bar([0, 5.6, 0], [0.4, 8.2, 2.9], 0.19, 5), '#5a4838'));
      }
      var cr = crownGeo(5.4, lod ? 9 : 6, 11, 0.42, '#4f6326', '#16210d', lod); cr.translate(0, 8.6, 0);
      parts.push(cr);
      return A.merge(parts);
    });
    types.tall.cast = true;
    /* manguier : houppier dense et bas */
    types.round = both(function (lod) {
      var t2 = paint(A.cyl(0.3, 0.55, 2.6, lod ? 6 : 4, [0, 1.3, 0]), '#4e3d2f');
      var c2 = crownGeo(4.0, lod ? 8 : 5, 23, 0.8, '#435c22', '#111c0a', lod); c2.translate(0, 4.4, 0);
      return A.merge([t2, c2]);
    });
    types.round.cast = true;
    /* buisson */
    types.shrub = both(function (lod) { var c3 = crownGeo(1.9, lod ? 4 : 3, 37, 0.7, '#56652a', '#1e2c11', lod); c3.translate(0, 1.2, 0); return c3; });
    types.shrub.cast = !Q.lite;
    /* palétuvier (mangrove) : bas, large, sombre, sur racines-échasses */
    types.mangrove = both(function (lod) {
      var c4 = crownGeo(3.4, lod ? 6 : 4, 51, 0.45, '#3e5829', '#13200e', lod); c4.translate(0, 3.6, 0);
      var roots = [];
      if (lod) for (var r = 0; r < 6; r++) { var a = r * 1.05; roots.push(paint(A.bar([Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6], [0, 2.4, 0], 0.09, 4), '#4a3c30')); }
      roots.push(paint(A.cyl(0.18, 0.25, 2.4, 5, [0, 2.2, 0]), '#4a3c30'));
      return A.merge(roots.concat([c4]));
    });
    types.mangrove.cast = false;
    /* lointain : silhouette simple */
    var c5 = crownGeo(4.2, 3, 71, 0.75, '#4f6429', '#1f2e16', 0); c5.translate(0, 6, 0);
    var t5 = paint(A.cyl(0.4, 0.5, 4, 4, [0, 2, 0]), '#4e3d2f');
    var farG = A.merge([t5, c5]);
    types.far = { hi: farG, lo: farG, cast: false };
    /* palmier à huile (Elaeis guineensis) : stipe + palmes */
    var stipe = [], sh = 11;
    for (var s = 0; s < 4; s++) {
      var y0 = s / 4 * sh, y1 = (s + 1) / 4 * sh, bend = function (y) { return 0.04 * y * y / sh; };
      stipe.push(paint(A.bar([bend(y0), y0, 0], [bend(y1), y1, 0], 0.32 - s * 0.018, 6), s % 2 ? '#5a4a3a' : '#66533f'));
    }
    var crownBall = paint(A.sph(0.8, 7, 5, [0.44, sh + 0.2, 0], [1, 0.8, 1]), '#4f5a26');
    var palmG = A.merge(stipe.concat([crownBall]));
    types.palm = { hi: palmG, lo: palmG, mat: A.M.trunk, cast: true };
    var fr = [], nf = 13, rr = A.rng(5);
    for (var f = 0; f < nf; f++) {
      var ang = f / nf * Math.PI * 2 + rr() * 0.2, droop = 0.35 + (f % 3) * 0.25 + rr() * 0.2, len = 5.4 + rr() * 1.2;
      var pts = [], uvs = [], idx = [], segs = 5;
      for (var q = 0; q <= segs; q++) {
        var t = q / segs, rad = t * len, yy = sh + 0.3 + Math.sin(t * 1.6) * 1.2 - t * t * droop * 4.2;
        var wdt = Math.max(0.03, 0.95 * Math.sin(Math.PI * Math.min(0.97, t * 1.05 + 0.08)));
        var cx = 0.44 + Math.cos(ang) * rad, cz = Math.sin(ang) * rad, px = -Math.sin(ang) * wdt, pz = Math.cos(ang) * wdt;
        pts.push(cx - px, yy + 0.12 * t, cz - pz, cx + px, yy + 0.12 * t, cz + pz);
        uvs.push(0, t, 1, t);
        if (q < segs) { var b0 = q * 2; idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2); }
      }
      var fg = new T.BufferGeometry();
      fg.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      fg.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      fg.setIndex(idx); fg.computeVertexNormals();
      paint(fg, f % 2 ? '#c9d4a0' : '#e4e8c0');
      fr.push(fg);
    }
    var frG = A.merge(fr, true);
    types.frond = { hi: frG, lo: frG, mat: A.M.frond, cast: true };
    /* herbe : trois plans croisés */
    var gq = [];
    for (var gi = 0; gi < 3; gi++) {
      var pg = new T.PlaneGeometry(2.0, 1.1); pg.translate(0, 0.5, 0); pg.rotateY(gi * Math.PI / 3);
      gq.push(paint(pg, '#a8a68a'));
    }
    var grG = A.merge(gq, true);
    types.grass = { hi: grG, lo: grG, mat: A.M.grass, cast: false };
    ['tall', 'round', 'shrub', 'mangrove', 'far'].forEach(function (k) { types[k].mat = A.M.leaves; });
    return types;
  }

  /* tuiles d'instances avec sphère englobante dédiée */
  W.VEG = [];
  function chunkGeo(src, sphere) {
    var geo = new T.BufferGeometry();
    for (var an in src.attributes) geo.setAttribute(an, src.attributes[an]);
    if (src.index) geo.setIndex(src.index);
    geo.boundingSphere = sphere;
    return geo;
  }
  function instanced(type, list, chunk, cast) {
    var grp = new T.Group(), buckets = {};
    for (var i = 0; i < list.length; i++) {
      var it = list[i], key = Math.floor(it[0] / chunk) + ':' + Math.floor(it[2] / chunk);
      (buckets[key] || (buckets[key] = [])).push(it);
    }
    var m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), s = new T.Vector3(), c = new T.Color();
    for (var k in buckets) {
      var b = buckets[k];
      var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, miny = 1e9, maxy = -1e9;
      for (var j = 0; j < b.length; j++) {
        minx = Math.min(minx, b[j][0]); maxx = Math.max(maxx, b[j][0]); minz = Math.min(minz, b[j][2]); maxz = Math.max(maxz, b[j][2]);
        miny = Math.min(miny, b[j][1]); maxy = Math.max(maxy, b[j][1]);
      }
      var center = new T.Vector3((minx + maxx) / 2, (miny + maxy) / 2 + 6, (minz + maxz) / 2);
      var sphere = new T.Sphere(center, Math.hypot(maxx - minx, maxz - minz, maxy - miny) / 2 + 20);
      var hiG = chunkGeo(type.hi, sphere), loG = type.lo === type.hi ? hiG : chunkGeo(type.lo, sphere);
      var mesh = new T.InstancedMesh(loG, type.mat, b.length);
      for (j = 0; j < b.length; j++) {
        var it2 = b[j];
        e.set(it2[5], it2[3], it2[6]); q.setFromEuler(e);
        p.set(it2[0], it2[1], it2[2]); s.set(it2[4], it2[4] * it2[7], it2[4]);
        m4.compose(p, q, s);
        mesh.setMatrixAt(j, m4);
        c.setRGB(it2[8], it2[9], it2[10]);
        mesh.setColorAt(j, c);
      }
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.userData.veg = { hi: hiG, lo: loG, center: center, r: sphere.radius, cast: !!cast };
      W.VEG.push(mesh);
      grp.add(mesh);
    }
    return grp;
  }
  /* LOD : lobes détaillés et ombres portées uniquement pour les tuiles proches */
  W.updateVegLOD = function (cam, hiDist, shadowDist) {
    for (var i = 0; i < W.VEG.length; i++) {
      var m = W.VEG[i], v = m.userData.veg;
      var d = Math.max(0, cam.distanceTo(v.center) - v.r);
      var g = d < hiDist ? v.hi : v.lo;
      if (m.geometry !== g) m.geometry = g;
      m.castShadow = v.cast && d < shadowDist;
    }
  };

  W.buildVegetation = function (Q) {
    var types = treeTypes(Q), r = A.rng(2024), o = {}, lists = { tall: [], round: [], shrub: [], mangrove: [], far: [], palm: [], grass: [] };
    var k = Q.veg;
    function ok(x, z, minH, avoidRoad) {
      S(x, z, o);
      if (o.h < minH) return false;
      if (o.kind === 2 || o.pad > 0.05 || o.dist > 0.05) return false;
      if (o.pitD > -40) return false;
      if (avoidRoad) {
        for (var i = 0; i < ROADS.length; i++) { if (ROADS[i].query(x, z, QR) && QR.d < ROADS[i].w + avoidRoad) return false; }
      }
      return true;
    }
    function tint(base, v) { return [base[0] * (1 + v * (r() - 0.5)), base[1] * (1 + v * (r() - 0.5)), base[2] * (1 + v * (r() - 0.5))]; }
    /* [x, y, z, rotY, échelle, inclinaisonX, inclinaisonZ, étirement vertical, r, v, b] */
    function push(list, x, z, scale, colv, yoff, sy) {
      var c = tint([1, 1, 1], colv);
      list.push([x, o.h + (yoff || 0) - 0.2, z, r() * Math.PI * 2, scale, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08, sy || (0.9 + r() * 0.25), c[0], c[1], c[2]]);
    }
    var dens, x, z, i, tries;
    /* zone proche (détaillée) : x de -2100 à 420, z de -1000 à 1500 */
    tries = Math.round(26000 * k);
    for (i = 0; i < tries; i++) {
      x = -2100 + r() * 2520; z = -1000 + r() * 2500;
      var dn = fbm(x * 0.0035 + 2.2, z * 0.0035 - 1.3, 3);
      var u = coastX(z) - x;
      dens = 0.3 + dn * 1.1;
      if (u > 1000 && u < 1180) dens += 0.55;                /* forêt de l'escarpement */
      if (RIVER.query(x, z, QR) && QR.d < riverHalfW(QR.s) + 140) dens += 0.6;   /* forêt galerie */
      if (r() > dens) continue;
      if (!ok(x, z, 1.2, 12)) continue;
      var pick = r();
      if (u < 650 && pick < 0.42) { push(lists.palm, x, z, 0.8 + r() * 0.45, 0.25); }
      else if (pick < 0.32) push(lists.tall, x, z, 0.85 + r() * 0.55, 0.3);
      else if (pick < 0.76) push(lists.round, x, z, 0.8 + r() * 0.65, 0.35);
      else push(lists.shrub, x, z, 0.85 + r() * 0.9, 0.35);
    }
    /* mangrove : berges de la rivière et littoral proche de l'embouchure */
    tries = Math.round(16000 * k);
    for (i = 0; i < tries; i++) {
      x = -900 + r() * 1300; z = 200 + r() * 1100;
      S(x, z, o);
      var nearR = RIVER.query(x, z, QR) ? QR.d - riverHalfW(QR.s) : 999;
      var coastNear = Math.abs(coastX(z) - x);
      if (!((nearR > -6 && nearR < 45) || (coastNear < 60 && Math.abs(z - 640) < 520))) continue;
      if (o.h < -0.4 || o.h > 2.6 || o.pad > 0.05 || o.kind === 2) continue;
      push(lists.mangrove, x, z, 0.8 + r() * 0.5, 0.25, -0.3);
    }
    /* cocotiers / palmiers le long de la plage */
    tries = Math.round(2500 * k);
    for (i = 0; i < tries; i++) {
      z = -2200 + r() * 4400; x = coastX(z) - 15 - r() * 140;
      if (Math.abs(z - 640) < 300 || (z > W.PORT.z0 - 60 && z < W.PORT.z1 + 60)) continue;
      if (!ok(x, z, 0.9, 10)) continue;
      push(lists.palm, x, z, 0.85 + r() * 0.4, 0.2);
    }
    /* herbes hautes autour des points de vue */
    var spots = [[-1060, 40, 260], [-800, 140, 260], [-560, 40, 220], [W.pitL2W(-127, -40)[0], W.pitL2W(-127, -40)[1], 380]];
    tries = Math.round(22000 * k);
    for (i = 0; i < tries; i++) {
      var sp = spots[i % spots.length], a = r() * Math.PI * 2, d = Math.sqrt(r()) * sp[2];
      x = sp[0] + Math.cos(a) * d; z = sp[1] + Math.sin(a) * d;
      if (!ok(x, z, 1.5, 3)) continue;
      if (o.grass < 0.25 || r() > o.grass) continue;
      push(lists.grass, x, z, 0.8 + r() * 0.8, 0.35);
    }
    /* lointain */
    tries = Math.round(24000 * k);
    for (i = 0; i < tries; i++) {
      x = -8500 + r() * 8800; z = -6500 + r() * 13000;
      if (x > -2100 && x < 420 && z > -1000 && z < 1500) continue;
      var u2 = coastX(z) - x;
      if (u2 < 30) continue;
      var dd = fbm(x * 0.0011, z * 0.0011, 3) * 0.8 + 0.3;
      if (r() > dd) continue;
      S(x, z, o);
      if (o.h < 1 || o.kind === 2 || o.dist > 0.05 || o.pitD > -40) continue;
      if (u2 < 700 && r() < 0.35) push(lists.palm, x, z, 0.9 + r() * 0.3, 0.2);
      else push(lists.far, x, z, 0.9 + r() * 0.8, 0.35);
    }
    var g = new T.Group(), CH = 650;
    g.add(instanced(types.tall, lists.tall, CH, true));
    g.add(instanced(types.round, lists.round, CH, true));
    g.add(instanced(types.shrub, lists.shrub, CH, types.shrub.cast));
    g.add(instanced(types.mangrove, lists.mangrove, CH, false));
    g.add(instanced(types.far, lists.far, 2500, false));
    g.add(instanced(types.palm, lists.palm, CH, true));
    g.add(instanced(types.frond, lists.palm, CH, true));
    if (!Q.lite) g.add(instanced(types.grass, lists.grass, 500, false));
    W.vegCount = { tall: lists.tall.length, round: lists.round.length, shrub: lists.shrub.length, mangrove: lists.mangrove.length, far: lists.far.length, palm: lists.palm.length, grass: lists.grass.length };
    return g;
  };

  /* ------------------------------------------------------------------ */
  /* Port : quai, stocks, convoyeur, appontement, dépôt pétrolier AOS      */
  /* ------------------------------------------------------------------ */
  /* tas de bauxite (prisme arrondi bruité) */
  W.stockpile = function (len, wid, hgt, seed) {
    var nx = Math.max(8, Math.round(len / 3)), nz = Math.max(6, Math.round(wid / 3));
    var g = new T.PlaneGeometry(len + wid, wid * 1.6, nx, nz);
    g.rotateX(-Math.PI / 2);
    var p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), aux = new Float32Array(n * 4), c = new T.Color();
    for (var i = 0; i < n; i++) {
      var x = p.getX(i), z = p.getZ(i);
      var dx = Math.max(0, Math.abs(x) - len / 2) , dz = Math.abs(z);
      var rr = Math.sqrt(dx * dx + dz * dz) / (wid / 2);
      var hh = Math.max(0, 1 - rr);
      hh = hgt * (hh < 0.85 ? hh / 0.85 : 1) * (0.96 + 0.08 * noise(x * 0.12 + seed, z * 0.12));
      hh = Math.min(hh, hgt * 0.97) + 0.3 * noise(x * 0.5, z * 0.5 + seed);
      p.setY(i, hh - 0.6);
      c.copy(CL.bauxite).lerp(CL.bauxitePale, clamp(0.45 + 0.6 * noise(x * 0.05 + seed, z * 0.07), 0, 1));
      c.multiplyScalar(0.9 + 0.18 * (hh / hgt));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      aux[i * 4] = 0; aux[i * 4 + 1] = 0.25; aux[i * 4 + 2] = 999; aux[i * 4 + 3] = 0;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setAttribute('aAux', new T.BufferAttribute(aux, 4));
    g.computeVertexNormals();
    var m = new T.Mesh(g, A.M.heap); m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  /* treillis (galerie de convoyeur, mâts) */
  function truss(B, key, a, b, w, h, step, r) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var n = Math.max(1, Math.round(L / step)), sx = -dz / Math.hypot(dx, dz), sz = dx / Math.hypot(dx, dz);
    function P(t, side, up) { return [a[0] + dx * t + sx * side * w / 2, a[1] + dy * t + up * h, a[2] + dz * t + sz * side * w / 2]; }
    for (var s = -1; s <= 1; s += 2) for (var u = 0; u <= 1; u++) B.add(key, A.bar(P(0, s, u), P(1, s, u), r, 4, true));
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      B.add(key, A.bar(P(t, -1, 0), P(t, 1, 0), r * 0.7, 4, true));
      B.add(key, A.bar(P(t, -1, 1), P(t, 1, 1), r * 0.7, 4, true));
      B.add(key, A.bar(P(t, -1, 0), P(t, -1, 1), r * 0.7, 4, true));
      B.add(key, A.bar(P(t, 1, 0), P(t, 1, 1), r * 0.7, 4, true));
      if (i < n) {
        var t2 = (i + 1) / n;
        B.add(key, A.bar(P(t, -1, 0), P(t2, -1, 1), r * 0.55, 4, true));
        B.add(key, A.bar(P(t, 1, 0), P(t2, 1, 1), r * 0.55, 4, true));
      }
    }
  }
  W.truss = truss;
  function lightMast(B, x, y, z, h) {
    B.add('grey', A.cyl(0.35, 0.6, h, 8, [x, y + h / 2, z]));
    B.add('dark', A.box(4.2, 0.5, 4.2, [x, y + h, z]));
    for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2; B.add('lampW', A.box(1.1, 0.7, 0.3, [x + Math.cos(a) * 1.6, y + h - 0.5, z + Math.sin(a) * 1.6], [0, -a + Math.PI / 2, 0])); }
  }
  W.lightMast = lightMast;

  W.buildPort = function (Q, lights) {
    var B = new A.Builder(), P = W.PORT, grp = new T.Group(), J = W.JETTY, F = W.FUELJETTY, i;
    var py = P.h;
    /* mur de quai */
    B.add('concrete', A.box(4, 12, P.z1 - P.z0 + 20, [W.QUAY + 0.5, py - 5.6, (P.z0 + P.z1) / 2]));
    B.add('black', A.box(0.6, 0.6, P.z1 - P.z0 + 20, [W.QUAY + 2.6, py + 0.1, (P.z0 + P.z1) / 2]));
    for (i = 0; i < 14; i++) B.add('black', A.cyl(0.6, 0.6, 2.2, 10, [W.QUAY + 2.7, py - 1.4, P.z0 + 15 + i * 30], [0, 0, 0]));
    /* appontement minéralier sur pieux */
    var jl = J.x1 - J.x0;
    B.add('concrete', A.box(jl, 1.4, J.w, [(J.x0 + J.x1) / 2, J.h - 0.7, J.z]));
    for (i = 0; i <= Math.floor(jl / 12); i++) for (var s = -1; s <= 1; s += 2) B.add('concrete', A.cyl(0.55, 0.55, J.h + 10, 8, [J.x0 + i * 12, (J.h - 10) / 2, J.z + s * (J.w / 2 - 1)]));
    for (i = 0; i < 8; i++) B.add('black', A.cyl(0.9, 0.9, 2.6, 12, [J.x0 + 20 + i * 20, J.h - 1.8, J.z - J.w / 2 - 0.6], [Math.PI / 2, 0, 0]));
    B.add('steel', A.box(jl, 1.1, 0.08, [(J.x0 + J.x1) / 2, J.h + 0.55, J.z + J.w / 2 - 0.2]));
    for (i = 0; i < 9; i++) B.add('dark', A.cyl(0.25, 0.32, 0.6, 8, [J.x0 + 10 + i * 19, J.h + 0.3, J.z - J.w / 2 + 0.8]));
    /* appontement pétrolier */
    var fl = F.x1 - F.x0;
    B.add('concrete', A.box(fl, 1.0, F.w, [(F.x0 + F.x1) / 2, F.h - 0.5, F.z]));
    for (i = 0; i <= Math.floor(fl / 14); i++) for (s = -1; s <= 1; s += 2) B.add('concrete', A.cyl(0.45, 0.45, F.h + 9, 8, [F.x0 + i * 14, (F.h - 9) / 2, F.z + s * (F.w / 2 - 0.8)]));
    for (s = 0; s < 3; s++) B.add('steel', A.bar([F.x0 - 40, F.h + 0.6 + s * 0.6, F.z + 2.2], [F.x1 - 6, F.h + 0.6 + s * 0.6, F.z + 2.2], 0.28, 8));
    B.add('dark', A.box(8, 4, 6, [F.x1 - 8, F.h + 2, F.z]));
    B.add('steel', A.bar([F.x1 - 4, F.h + 4, F.z], [F.x1 - 4, F.h + 13, F.z], 0.35, 8));
    B.add('steel', A.bar([F.x1 - 4, F.h + 13, F.z], [F.x1 + 6, F.h + 9, F.z], 0.25, 8));

    /* parc de stockage : tas de bauxite */
    var piles = [[-40, -215, 170, 40, 14], [-40, -160, 170, 36, 12.5]];
    piles.forEach(function (pp, k) { var m = W.stockpile(pp[2], pp[3], pp[4], k * 7.3); m.position.set(pp[0], py, pp[1]); grp.add(m); });
    W.PORTDUMP = [-150, -160];
    /* trémie + convoyeur vers le chargeur de barges */
    var hop = [78, py, -188];
    B.add('dark', A.box(12, 1.2, 12, [hop[0], py + 7.5, hop[2]]));
    B.add('yellow', A.cyl(6.5, 2.2, 5, 4, [hop[0], py + 10.6, hop[2]], [0, Math.PI / 4, 0], true));
    for (i = 0; i < 4; i++) B.add('grey', A.box(0.6, 7.5, 0.6, [hop[0] + (i % 2 ? 5 : -5), py + 3.75, hop[2] + (i < 2 ? 5 : -5)]));
    var c0 = [hop[0] + 6, py + 6.5, hop[2] + 4], c1 = [150, py + 15, -72], c2 = [J.x1 - 14, J.h + 15.5, J.z - 2];
    truss(B, 'grey', c0, c1, 3.4, 2.6, 7, 0.14);
    truss(B, 'grey', c1, c2, 3.4, 2.6, 7, 0.14);
    W.CONVEYOR = [c0, c1, c2];
    function hood(a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var g = new T.CylinderGeometry(1.5, 1.5, L, 10, 1, true, -Math.PI / 2, Math.PI); g.rotateX(-Math.PI / 2);
      var m = new T.Mesh(paint(g, '#ffffff'), A.M.lightgrey);
      m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2.4, (a[2] + b[2]) / 2);
      m.lookAt(b[0], b[1] + 2.4, b[2]); m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
      var belt = new T.Mesh(paint(new T.BoxGeometry(1.4, 0.18, L), '#ffffff'), A.M.black);
      belt.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.9, (a[2] + b[2]) / 2); belt.lookAt(b[0], b[1] + 0.9, b[2]);
      grp.add(belt);
    }
    hood(c0, c1); hood(c1, c2);
    /* pylônes du convoyeur */
    function legs(a, b, n) { for (var q = 1; q < n; q++) { var t = q / n, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t), z = lerp(a[2], b[2], t), gy = x > W.QUAY ? -8 : py; B.add('grey', A.box(0.8, y - gy, 0.8, [x, (y + gy) / 2, z])); B.add('grey', A.box(3.8, 0.5, 0.6, [x, y - 0.2, z])); } }
    legs(c0, c1, 5); legs(c1, [J.x0, c2[1], J.z - 2], 2);
    /* chargeur de barges (tour + flèche) */
    var lx = J.x1 - 16;
    B.add('yellow', A.box(6, 18, 6, [lx, J.h + 9, J.z]));
    B.add('dark', A.box(7, 2, 7, [lx, J.h + 18.5, J.z]));
    truss(B, 'yellow', [lx, J.h + 17, J.z - 2], [lx, J.h + 13, J.z - 30], 2.6, 2.2, 5, 0.16);
    B.add('dark', A.cyl(1.2, 0.8, 6, 10, [lx, J.h + 9.5, J.z - 30]));
    W.LOADER = [lx, J.h + 7, J.z - 30];
    /* dépôt pétrolier AOS : 6 cuves + cuvette de rétention */
    var tanks = [], tx0 = -200, tz0 = 75;
    for (var tr = 0; tr < 2; tr++) for (var tc = 0; tc < 3; tc++) tanks.push([tx0 + tc * 32, tz0 + tr * 36]);
    tanks.forEach(function (t, k) {
      var R = 11, Hh = 14 + (k % 2) * 2;
      B.add('white', A.cyl(R, R, Hh, 36, [t[0], py + Hh / 2, t[1]]));
      B.add('lightgrey', A.cyl(R + 0.05, R + 0.05, 0.6, 36, [t[0], py + Hh + 0.1, t[1]]));
      B.add('lightgrey', A.cyl(R * 0.15, R, 1.4, 36, [t[0], py + Hh + 0.9, t[1]]));
      B.add('green', A.cyl(R + 0.06, R + 0.06, 1.6, 36, [t[0], py + Hh * 0.72, t[1]], null, true));
      B.add('gold', A.cyl(R + 0.07, R + 0.07, 0.35, 36, [t[0], py + Hh * 0.72 - 1.1, t[1]], null, true));
      /* escalier hélicoïdal */
      for (var st = 0; st < 10; st++) { var a = st * 0.24 - 0.6, y = py + 1 + st * (Hh - 1) / 10; B.add('grey', A.box(1.0, 0.12, 1.4, [t[0] + Math.cos(a) * (R + 0.7), y, t[1] + Math.sin(a) * (R + 0.7)], [0, -a, 0])); }
      var bandMesh = new T.Mesh(new T.CylinderGeometry(R + 0.12, R + 0.12, 5, 48, 1, true, -0.55, 1.1), A.M.brandTank);
      bandMesh.position.set(t[0], py + Hh * 0.45, t[1]);
      bandMesh.rotation.y = Math.PI / 2 + 0.2;
      grp.add(bandMesh);
      lights.push({ p: [t[0], py + Hh + 1.2, t[1]], c: [1, 0.82, 0.6], s: 1.2, st: 0.2 });
    });
    W.TANKS = tanks;
    var bx0 = tx0 - 16, bx1 = tx0 + 64 + 16, bz0 = tz0 - 16, bz1 = tz0 + 36 + 16;
    B.add('concrete', A.box(bx1 - bx0, 1.6, 0.6, [(bx0 + bx1) / 2, py + 0.8, bz0]));
    B.add('concrete', A.box(bx1 - bx0, 1.6, 0.6, [(bx0 + bx1) / 2, py + 0.8, bz1]));
    B.add('concrete', A.box(0.6, 1.6, bz1 - bz0, [bx0, py + 0.8, (bz0 + bz1) / 2]));
    B.add('concrete', A.box(0.6, 1.6, bz1 - bz0, [bx1, py + 0.8, (bz0 + bz1) / 2]));
    /* rampe de chargement camions-citernes */
    B.add('dark', A.box(26, 0.6, 12, [-100, py + 7, 168]));
    for (i = 0; i < 4; i++) B.add('grey', A.box(0.5, 7, 0.5, [-112 + i * 8, py + 3.5, 162]));
    for (i = 0; i < 4; i++) B.add('grey', A.box(0.5, 7, 0.5, [-112 + i * 8, py + 3.5, 174]));
    /* tuyauteries vers l'appontement pétrolier */
    for (s = 0; s < 3; s++) {
      B.add('steel', A.bar([tx0 + 70, py + 1.2 + s * 0.6, F.z + 2.2], [F.x0 - 40, py + 1.2 + s * 0.6, F.z + 2.2], 0.28, 8));
      B.add('steel', A.bar([F.x0 - 40, py + 1.2 + s * 0.6, F.z + 2.2], [F.x0 - 2, F.h + 0.6 + s * 0.6, F.z + 2.2], 0.28, 8));
    }
    for (i = 0; i < 12; i++) B.add('grey', A.box(0.4, 1.2, 3, [tx0 + 74 + i * 18, py + 0.6, F.z + 2.2]));
    /* bâtiments */
    function building(x, z, w, d, h, roof, wallKey) {
      B.add(wallKey || 'white', A.box(w, h, d, [x, py + h / 2, z]));
      B.add(roof || 'roofMetal', A.box(w + 1, 0.5, d + 1, [x, py + h + 0.25, z]));
      var nwin = Math.floor(w / 4);
      for (var fl2 = 0; fl2 < Math.floor(h / 3.4); fl2++) for (var wi = 0; wi < nwin; wi++) {
        var wx = x - w / 2 + 2 + wi * (w - 4) / Math.max(1, nwin - 1);
        B.add('windowLit', A.box(1.8, 1.3, 0.12, [wx, py + 1.9 + fl2 * 3.4, z + d / 2 + 0.05]));
        B.add('windowLit', A.box(1.8, 1.3, 0.12, [wx, py + 1.9 + fl2 * 3.4, z - d / 2 - 0.05]));
      }
    }
    building(-224, -28, 34, 14, 7.6, 'roofBlue');
    building(-135, -22, 64, 30, 12, 'roofMetal', 'lightgrey');
    building(-226, 22, 38, 20, 9, 'roofMetal', 'lightgrey');
    building(-246, -70, 8, 6, 3.4, 'roofBlue');
    /* entrepôt : bardage ondulé (nervures) */
    for (i = 0; i < 16; i++) B.add('grey', A.box(0.25, 12, 0.25, [-166 + i * 4.1, py + 6, -22 + 15.1]));
    /* mâts d'éclairage */
    var masts = [[-150, -120], [-20, -125], [70, -235], [120, -70], [-240, 50], [-60, 120], [150, 100], [260, -50], [-190, -250]];
    masts.forEach(function (m) { lightMast(B, m[0], py, m[1], 28); lights.push({ p: [m[0], py + 28, m[1]], c: [1, 0.86, 0.66], s: 3.2, st: 0.05, pool: 34 }); });
    for (i = 0; i < 9; i++) lights.push({ p: [J.x0 + 10 + i * 19, J.h + 6, J.z + J.w / 2 - 1], c: [1, 0.85, 0.62], s: 1.6, st: 0.3 });
    for (i = 0; i < 5; i++) { B.add('grey', A.cyl(0.12, 0.15, 6, 6, [J.x0 + 10 + i * 38, J.h + 3, J.z + J.w / 2 - 1])); }
    lights.push({ p: [F.x1, F.h + 2, F.z], c: [0.3, 1, 0.4], s: 1.4, st: 0.4 });
    /* drapeau guinéen */
    B.add('steel', A.cyl(0.12, 0.16, 14, 8, [-205, py + 7, -44]));
    var flag = new T.Mesh(new T.PlaneGeometry(4.5, 3, 12, 4), A.M.flag);
    flag.geometry.translate(2.25, 0, 0);
    flag.position.set(-205, py + 12.4, -44); flag.rotation.y = 0.3; flag.castShadow = true;
    grp.add(flag);
    var built = B.build({ dirt: [0, 4, 0.5], seed: 3 });
    grp.add(built);
    return grp;
  };

  /* installations minières : plateforme ROM, tas, ateliers, mâts */
  W.buildMineSite = function (Q, lights) {
    var B = new A.Builder(), grp = new T.Group(), R = W.ROM, i;
    var rom = W.stockpile(26, 20, 7.5, 3.1); rom.position.set(-1040, R.h, 50); grp.add(rom);
    W.ROMPILE = [-1040, 50];
    var MP = W.MINEPAD, y = MP.h;
    B.add('lightgrey', A.box(40, 10, 22, [MP.x - 10, y + 5, MP.z])); B.add('roofMetal', A.box(41, 0.6, 23, [MP.x - 10, y + 10.3, MP.z]));
    B.add('white', A.box(18, 6, 10, [MP.x + 28, y + 3, MP.z + 10])); B.add('roofBlue', A.box(19, 0.5, 11, [MP.x + 28, y + 6.25, MP.z + 10]));
    for (i = 0; i < 4; i++) B.add('windowLit', A.box(1.8, 1.2, 0.12, [MP.x + 21 + i * 4.6, y + 3.4, MP.z + 15.1]));
    for (i = 0; i < 2; i++) { B.add('white', A.cyl(3, 3, 9, 20, [MP.x + 32 + i * 7, y + 4.5, MP.z - 14])); B.add('green', A.cyl(3.05, 3.05, 1, 20, [MP.x + 32 + i * 7, y + 6.5, MP.z - 14], null, true)); }
    var masts = [[R.x + 40, R.z + 40], [R.x - 50, R.z - 40], W.pitL2W(-150, 20), W.pitL2W(-60, -60), W.pitL2W(120, 60), W.pitL2W(250, 140), [MP.x - 40, MP.z + 30]];
    masts.forEach(function (m, k) {
      var hy = W.H(m[0], m[1]);
      B.add('yellow', A.box(2.6, 1.2, 4.6, [m[0], hy + 0.6, m[1]]));
      lightMast(B, m[0], hy, m[1], 16);
      lights.push({ p: [m[0], hy + 16, m[1]], c: [1, 0.88, 0.7], s: 2.6, st: 6.0 + k * 0.08, pool: 30 });
    });
    grp.add(B.build({ dirt: [0, 3, 0.8], seed: 5 }));
    return grp;
  };

  /* ------------------------------------------------------------------ */
  /* Villages : maisons à toit de tôle et cases rondes (instanciées)       */
  /* ------------------------------------------------------------------ */
  W.VILLAGES = [[-560, 255, 26], [-300, 470, 30], [-30, 420, 18], [70, -560, 24], [-640, -380, 22], [-1830, 280, 24], [-2250, -330, 20],
    [-930, 640, 18], [-80, 980, 26], [-2650, 520, 20], [-420, -930, 26], [140, 1250, 22], [-1500, 700, 18], [-3200, -100, 22]];
  W.buildVillages = function (Q, lights) {
    var grp = new T.Group(), r = A.rng(99), o = {};
    /* maison rectangulaire */
    function vcount(g) { return g.index ? g.index.count : g.attributes.position.count; }
    function houseGeo() {
      var winY = 1.5;
      var wall = paint(A.box(7, 3, 5, [0, 1.5, 0]), '#ffffff');
      var door = paint(A.box(1.0, 2.0, 0.08, [0, 1.0, 2.53]), '#6b4a30');
      var wins = [A.box(1.0, 0.9, 0.08, [-1.8, winY, 2.52]), A.box(1.0, 0.9, 0.08, [1.8, winY, 2.52]), A.box(0.9, 0.9, 0.08, [0, winY, -2.52]), A.box(0.08, 0.9, 0.9, [3.52, winY, 0])];
      var base = vcount(wall) + vcount(door);
      var g = A.merge([wall, door].concat(wins.map(function (w) { return paint(w, '#20262a'); })));
      var n = g.attributes.position.count, aw = new Float32Array(n);
      for (var i = base; i < n; i++) aw[i] = 1;
      g.setAttribute('aWin', new T.BufferAttribute(aw, 1));
      return g;
    }
    function roofGeo() {
      var sh = new T.Shape(); sh.moveTo(-3.9, 0); sh.lineTo(3.9, 0); sh.lineTo(0, 1.6); sh.closePath();
      var g = new T.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: false }); g.translate(0, 3, -3);
      g.deleteAttribute('uv');
      return paint(A.merge([g]), '#ffffff');
    }
    function hutGeo() {
      var g = paint(A.cyl(2.4, 2.5, 2.4, 14, [0, 1.2, 0]), '#ffffff');
      var w = paint(A.box(0.9, 0.8, 0.08, [0, 1.3, 2.45]), '#20262a');
      var b = vcount(g);
      var m = A.merge([g, w]), n = m.attributes.position.count, aw = new Float32Array(n);
      for (var i = b; i < n; i++) aw[i] = 1;
      m.setAttribute('aWin', new T.BufferAttribute(aw, 1));
      return m;
    }
    var hutRoof = paint(A.cyl(0.05, 3.3, 2.6, 14, [0, 3.6, 0]), '#ffffff');
    var H = { wall: houseGeo(), roof: roofGeo(), hut: hutGeo(), hutRoof: hutRoof };
    var houses = [], huts = [];
    var wallCols = ['#d8c3a0', '#e6dccb', '#c99a74', '#d9d2c2', '#b98d6a', '#e9e1cf', '#cfa98a'];
    var roofCols = ['#9aa0a3', '#8f8f86', '#a3776a', '#7f8b8f', '#b0b3b0', '#8a5b45'];
    W.VILLAGES.forEach(function (v, vi) {
      var dist = Math.hypot(v[0] - (-150), v[1] - 0);
      var stage = clamp(1.3 + dist / 520, 1.3, 8.8);
      var n = v[2], placed = 0, guard = 0;
      while (placed < n && guard < n * 12) {
        guard++;
        var a = r() * Math.PI * 2, d = Math.sqrt(r()) * (34 + n * 2.2), x = v[0] + Math.cos(a) * d, z = v[1] + Math.sin(a) * d;
        S(x, z, o);
        if (o.h < 1.2 || o.kind === 2 || o.pad > 0.05 || o.dist > 0.05) continue;
        var rot = Math.round(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.3;
        var wc = new T.Color(wallCols[(r() * wallCols.length) | 0]), rc = new T.Color(roofCols[(r() * roofCols.length) | 0]);
        var item = { x: x, y: o.h, z: z, rot: rot, s: 0.85 + r() * 0.35, wc: wc, rc: rc, st: r() < 0.25 ? 99 : stage + r() * 0.6 };
        if (r() < 0.32) huts.push(item); else houses.push(item);
        placed++;
      }
      var ly = W.H(v[0], v[1]);
      for (var l = 0; l < Math.max(3, n / 4); l++) {
        var la = r() * Math.PI * 2, ld = r() * (24 + n * 1.6);
        var lxp = v[0] + Math.cos(la) * ld, lzp = v[1] + Math.sin(la) * ld;
        lights.push({ p: [lxp, W.H(lxp, lzp) + 5.5, lzp], c: [1, 0.72, 0.42], s: 1.9, st: stage + 0.15 + r() * 0.4, pool: 12 });
      }
      lights.push({ p: [v[0], ly + 9, v[1]], c: [1, 0.72, 0.42], s: 3.2, st: stage + 0.3, halo: 1 });
    });
    function inst(geo, mat, items, colKey, withStage) {
      var mesh = new T.InstancedMesh(geo, mat, Math.max(1, items.length));
      var m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), s = new T.Vector3();
      var st = new Float32Array(Math.max(1, items.length));
      items.forEach(function (it, i) {
        e.set(0, it.rot, 0); q.setFromEuler(e); p.set(it.x, it.y - 0.15, it.z); s.set(it.s, it.s, it.s);
        m4.compose(p, q, s); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, it[colKey]); st[i] = it.st;
      });
      mesh.count = items.length;
      if (withStage) geo.setAttribute('aIStage', new T.InstancedBufferAttribute(st, 1));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      return mesh;
    }
    grp.add(inst(H.wall, A.M.houseWall, houses, 'wc', true));
    grp.add(inst(H.roof, A.M.houseRoof, houses, 'rc', false));
    grp.add(inst(H.hut, A.M.houseWall, huts, 'wc', true));
    grp.add(inst(H.hutRoof, A.M.hutRoof, huts.map(function (h) { var c = h.rc.clone().lerp(new T.Color('#8e7646'), 0.85); return { x: h.x, y: h.y, z: h.z, rot: h.rot, s: h.s, rc: c }; }), 'rc', false));
    W.houseCount = houses.length + huts.length;
    return grp;
  };

  /* lampadaires le long de la route principale (s'allument du port vers la mine) */
  W.buildStreetLights = function (Q, lights) {
    var B = new A.Builder(), rd = W.MAINROAD, p = {}, n = Math.floor(rd.L / 46);
    for (var i = 1; i < n; i++) {
      var s = i * 46;
      rd.at(s, p);
      var side = (i % 2 ? 1 : -1), off = rd.w + 3.2, x = p.x - p.dz * off * side, z = p.z + p.dx * off * side, y = W.H(x, z);
      B.add('grey', A.cyl(0.1, 0.14, 8, 6, [x, y + 4, z]));
      B.add('grey', A.bar([x, y + 8, z], [x + p.dz * 1.6 * side, y + 8.2, z - p.dx * 1.6 * side], 0.06, 4));
      B.add('lampW', A.box(0.7, 0.18, 0.35, [x + p.dz * 1.7 * side, y + 8.1, z - p.dx * 1.7 * side]));
      var stage = 1.0 + (rd.L - s) / rd.L * 4.6;
      lights.push({ p: [x + p.dz * 1.7 * side, y + 7.8, z - p.dx * 1.7 * side], c: [1, 0.8, 0.55], s: 2.0, st: stage, pool: 13 });
    }
    return B.build({ cast: true });
  };
})(window);
