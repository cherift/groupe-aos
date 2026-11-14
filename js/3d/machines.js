/* =====================================================================
   Groupe AOS — moteur 3D · 3/4 · engins, navires, plateforme
   Modèles procéduraux (aucun fichier 3D) aux proportions réelles.
   Repère local : +Z vers l'avant, Y vers le haut, origine au sol.
   ===================================================================== */
(function (root) {
  'use strict';
  var A = root.AOSX;
  if (!A) return;
  var T = A.T, W = A.W, lerp = A.lerp;
  var V = A.V = {};
  var paint = function (g, hex) { return A.paint(g, hex); };
  var _a = new T.Vector3(), _b = new T.Vector3();

  /* ------------------------------------------------------------------ */
  /* Roues : pneu à crampons + jante, une seule géométrie colorée          */
  /* ------------------------------------------------------------------ */
  function wheel(R, wd, hubR, lugs, rimHex, x) {
    var hw = wd / 2, parts = [];
    var prof = [[hubR, -hw * 0.96], [R * 0.84, -hw], [R * 0.95, -hw * 0.94], [R, -hw * 0.72], [R * 1.01, -hw * 0.3], [R * 1.01, hw * 0.3], [R, hw * 0.72], [R * 0.95, hw * 0.94], [R * 0.84, hw], [hubR, hw * 0.96]];
    var tire = new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), 26);
    tire.rotateZ(Math.PI / 2);
    parts.push(paint(tire, '#1a1a1a'));
    for (var k = 0; k < lugs; k++) {
      var a = k / lugs * Math.PI * 2, off = (k % 2 ? 1 : -1) * hw * 0.38;
      var lug = new T.BoxGeometry(wd * 0.42, R * 0.07, R * 0.16);
      lug.translate(off, R * 1.02, 0); lug.rotateX(a);
      parts.push(paint(lug, '#161616'));
    }
    var rprof = [[0.02, -hw * 0.62], [hubR * 0.97, -hw * 0.7], [hubR, -hw * 0.5], [hubR, hw * 0.5], [hubR * 0.97, hw * 0.7], [hubR * 0.55, hw * 0.74], [hubR * 0.25, hw * 0.66], [0.02, hw * 0.6]];
    var rim = new T.LatheGeometry(rprof.map(function (p) { return new T.Vector2(p[0], p[1]); }), 18);
    rim.rotateZ(Math.PI / 2);
    parts.push(paint(rim, rimHex));
    for (k = 0; k < 8; k++) {
      var b = k / 8 * Math.PI * 2, bolt = new T.CylinderGeometry(hubR * 0.06, hubR * 0.06, hw * 0.25, 6);
      bolt.rotateZ(Math.PI / 2); bolt.translate(hw * 0.7, Math.cos(b) * hubR * 0.62, Math.sin(b) * hubR * 0.62);
      parts.push(paint(bolt, '#8a8a80'));
      var bolt2 = bolt.clone(); bolt2.translate(-hw * 1.4, 0, 0); parts.push(bolt2);
    }
    var g = A.merge(parts);
    g.translate(x, 0, 0);
    return g;
  }
  function axle(list, matKey) {
    var m = new T.Mesh(A.merge(list), A.M[matKey || 'tire']);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  /* multiplie les couleurs de sommets par une teinte de poussière */
  function dust(geo, y0, y1, k) {
    var p = geo.attributes.position, c = geo.attributes.color, d = new T.Color('#a5745a'), t = new T.Color();
    for (var i = 0; i < p.count; i++) {
      var f = (1 - A.smooth(y0, y1, p.getY(i))) * k;
      t.setRGB(c.getX(i), c.getY(i), c.getZ(i));
      t.lerp(d.clone().multiply(t).multiplyScalar(1.6), f);
      c.setXYZ(i, t.r, t.g, t.b);
    }
    return geo;
  }

  /* vérin hydraulique (fût + tige) entre deux points de deux objets */
  function Hyd(parent, aObj, aPt, bObj, bPt, rB, lB, rR, lR, barrelKey) {
    this.parent = parent; this.aObj = aObj; this.bObj = bObj;
    this.aPt = new T.Vector3().fromArray(aPt); this.bPt = new T.Vector3().fromArray(bPt);
    var gb = new T.CylinderGeometry(rB, rB, lB, 10); gb.rotateX(Math.PI / 2); gb.translate(0, 0, lB / 2);
    var gr = new T.CylinderGeometry(rR, rR, lR, 8); gr.rotateX(Math.PI / 2); gr.translate(0, 0, lR / 2);
    this.barrel = new T.Mesh(paint(gb, '#ffffff'), A.M[barrelKey || 'yellow']);
    this.rod = new T.Mesh(paint(gr, '#ffffff'), A.M.steel);
    this.barrel.castShadow = this.rod.castShadow = true;
    parent.add(this.barrel); parent.add(this.rod);
  }
  Hyd.prototype.update = function () {
    this.aObj.localToWorld(_a.copy(this.aPt));
    this.bObj.localToWorld(_b.copy(this.bPt));
    this.barrel.position.copy(this.parent.worldToLocal(_a.clone()));
    this.barrel.lookAt(_b);
    this.rod.position.copy(this.parent.worldToLocal(_b.clone()));
    this.rod.lookAt(_a);
  };
  V.Hyd = Hyd;

  function rails(B, key, pts, h, r) {
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      B.add(key, A.bar([p[0], p[1], p[2]], [p[0], p[1] + h, p[2]], r, 5));
      if (i < pts.length - 1) {
        var q = pts[i + 1];
        B.add(key, A.bar([p[0], p[1] + h, p[2]], [q[0], q[1] + h, q[2]], r, 5));
        B.add(key, A.bar([p[0], p[1] + h * 0.5, p[2]], [q[0], q[1] + h * 0.5, q[2]], r * 0.8, 5));
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Tombereau rigide de mine (~90 t)                                    */
  /* ------------------------------------------------------------------ */
  V.haulTruck = function (seed) {
    var B = new A.Builder(), g = new T.Group(), i, s;
    /* châssis */
    B.add('dark', A.box(0.5, 0.9, 8.4, [-0.66, 1.55, 0.3]));
    B.add('dark', A.box(0.5, 0.9, 8.4, [0.66, 1.55, 0.3]));
    for (i = 0; i < 4; i++) B.add('dark', A.box(1.9, 0.35, 0.45, [0, 1.5, -3.4 + i * 2.5]));
    B.add('dark', A.cyl(0.46, 0.46, 3.3, 12, [0, 1.3, -1.7], [0, 0, Math.PI / 2]));
    B.add('dark', A.sph(0.86, 12, 8, [0, 1.3, -1.7], [1, 0.82, 1]));
    for (s = -1; s <= 1; s += 2) {
      B.add('steel', A.cyl(0.17, 0.17, 1.3, 8, [s * 1.72, 2.05, 3.3]));
      B.add('dark', A.cyl(0.3, 0.3, 0.8, 10, [s * 1.72, 2.65, 3.3]));
      B.add('dark', A.box(0.5, 0.45, 2.2, [s * 1.4, 1.35, 3.3]));
    }
    /* capot moteur + calandre */
    B.add('yellow', A.rbox(2.5, 1.5, 2.7, 0.14, 2, [0, 2.4, 4.1]));
    B.add('black', A.box(2.2, 1.25, 0.1, [0, 2.3, 5.46]));
    for (i = 0; i < 7; i++) B.add('grey', A.box(2.26, 0.06, 0.09, [0, 1.76 + i * 0.18, 5.53]));
    /* pare-chocs */
    B.add('yellow', A.rbox(5.4, 0.72, 0.56, 0.1, 1, [0, 1.42, 5.58]));
    /* plateforme avant pleine largeur + flancs */
    B.add('yellow', A.box(6.1, 0.16, 2.6, [0, 3.2, 4.2]));
    for (s = -1; s <= 1; s += 2) {
      B.add('yellow', A.box(1.35, 0.95, 0.12, [s * 2.4, 2.75, 5.46]));
      B.add('yellow', A.box(0.12, 0.95, 2.4, [s * 3.03, 2.75, 4.2]));
    }
    /* garde-corps */
    rails(B, 'yellow', [[-3.0, 3.28, 5.45], [-1.2, 3.28, 5.45]], 1.0, 0.035);
    rails(B, 'yellow', [[0.2, 3.28, 5.45], [3.0, 3.28, 5.45], [3.0, 3.28, 3.0]], 1.0, 0.035);
    rails(B, 'yellow', [[-3.0, 3.28, 5.45], [-3.0, 3.28, 3.0]], 1.0, 0.035);
    /* échelle diagonale en façade */
    var la = [-2.25, 0.75, 5.92], lb = [-0.55, 3.25, 5.6];
    B.add('dark', A.bar([la[0] - 0.3, la[1], la[2]], [lb[0] - 0.3, lb[1], lb[2]], 0.05, 5));
    B.add('dark', A.bar([la[0] + 0.3, la[1], la[2]], [lb[0] + 0.3, lb[1], lb[2]], 0.05, 5));
    for (i = 0; i <= 6; i++) { var t = i / 6; B.add('grey', A.box(0.6, 0.05, 0.22, [lerp(la[0], lb[0], t), lerp(la[1], lb[1], t), lerp(la[2], lb[2], t)])); }
    /* cabine (côté gauche) */
    B.add('yellow', A.rbox(2.1, 2.0, 2.25, 0.12, 2, [-1.85, 4.3, 4.15]));
    B.add('glass', A.box(1.85, 0.95, 0.06, [-1.85, 4.7, 5.29], [-0.08, 0, 0]));
    B.add('glass', A.box(0.06, 0.95, 1.8, [-2.91, 4.7, 4.15]));
    B.add('glass', A.box(0.06, 0.95, 1.8, [-0.79, 4.7, 4.15]));
    B.add('glass', A.box(1.7, 0.8, 0.06, [-1.85, 4.75, 3.01]));
    B.add('dark', A.box(2.2, 0.12, 2.35, [-1.85, 5.33, 4.15]));
    /* module droit, filtres à air, échappement, rétroviseurs */
    B.add('yellow', A.rbox(1.6, 1.3, 1.9, 0.1, 1, [1.9, 3.95, 4.0]));
    B.add('dark', A.cyl(0.32, 0.32, 1.1, 12, [0.9, 3.85, 5.0]));
    B.add('dark', A.cyl(0.32, 0.32, 1.1, 12, [1.5, 3.85, 5.0]));
    B.add('dark', A.cyl(0.12, 0.14, 1.6, 8, [0.6, 4.1, 3.2]));
    B.add('dark', A.bar([-3.0, 4.4, 5.3], [-3.5, 4.6, 5.4], 0.04, 4)); B.add('black', A.box(0.12, 0.55, 0.35, [-3.55, 4.5, 5.42]));
    B.add('dark', A.bar([3.0, 4.0, 5.3], [3.5, 4.3, 5.4], 0.04, 4)); B.add('black', A.box(0.12, 0.55, 0.35, [3.55, 4.25, 5.42]));
    /* phares, feux */
    var heads = [[-2.55, 3.42, 5.5], [-2.1, 3.42, 5.5], [2.1, 3.42, 5.5], [2.55, 3.42, 5.5], [-2.2, 1.55, 5.88], [2.2, 1.55, 5.88]];
    heads.forEach(function (h) { B.add('lampW', A.box(0.3, 0.2, 0.1, h)); });
    B.add('lampR', A.box(0.35, 0.22, 0.1, [-1.0, 1.6, -3.95])); B.add('lampR', A.box(0.35, 0.22, 0.1, [1.0, 1.6, -3.95]));
    var chassis = B.build({ dirt: [0.4, 3.6, 0.75], seed: seed });
    g.add(chassis);
    /* benne basculante */
    var bed = new T.Group(); bed.position.set(0, 2.08, -4.0); g.add(bed);
    var BB = new A.Builder();
    var prof = [[0, 0], [7.25, 0], [7.25, 3.05], [0.6, 2.15], [0, 1.95]];
    for (s = -1; s <= 1; s += 2) {
      var side = A.extrude(prof, 0.26, 0.04, [s * 2.74, 0, 0], [0, -Math.PI / 2, 0]);
      BB.add('yellow', side);
      [1.0, 2.5, 4.0, 5.5, 6.8].forEach(function (z) {
        var top = lerp(1.95, 3.05, z / 7.25);
        BB.add('yellow', A.box(0.2, top - 0.3, 0.3, [s * 2.92, (top - 0.3) / 2 + 0.15, z]));
      });
      BB.add('yellow', A.bar([s * 2.86, 1.98, 0.05], [s * 2.86, 3.08, 7.25], 0.13, 8));
    }
    BB.add('rust', A.box(5.3, 0.3, 7.3, [0, 0.15, 3.62]));
    BB.add('yellow', A.box(5.8, 3.2, 0.3, [0, 1.6, 7.25]));
    BB.add('yellow', A.box(5.95, 0.22, 2.45, [0, 3.42, 8.45]));
    BB.add('yellow', A.box(5.95, 0.5, 0.15, [0, 3.22, 9.62]));
    for (s = -1; s <= 1; s += 2) BB.add('yellow', A.box(0.15, 0.75, 2.3, [s * 2.95, 3.1, 8.45]));
    BB.add('dark', A.box(0.36, 0.4, 7.0, [-0.66, -0.2, 3.6])); BB.add('dark', A.box(0.36, 0.4, 7.0, [0.66, -0.2, 3.6]));
    BB.add('lampA', A.cyl(0.16, 0.16, 0.25, 10, [-2.6, 3.66, 9.3]));
    var bedMesh = BB.build({ dirt: [0, 2.8, 0.7], seed: seed + 3 });
    bed.add(bedMesh);
    var load = W.stockpile(2.5, 4.8, 2.1, seed * 1.7);
    load.rotation.y = Math.PI / 2; load.position.set(0, 0.62, 3.7);
    bed.add(load);
    /* roues : un essieu avant, un essieu arrière (jumelées) */
    var fw = axle([wheel(1.3, 0.86, 0.78, 22, '#b7ae96', -2.3), wheel(1.3, 0.86, 0.78, 22, '#b7ae96', 2.3)]);
    fw.position.set(0, 1.3, 3.3); g.add(fw);
    var rw = axle([wheel(1.3, 0.86, 0.78, 22, '#b7ae96', -2.43), wheel(1.3, 0.86, 0.78, 22, '#b7ae96', -1.52), wheel(1.3, 0.86, 0.78, 22, '#b7ae96', 1.52), wheel(1.3, 0.86, 0.78, 22, '#b7ae96', 2.43)]);
    rw.position.set(0, 1.3, -1.7); g.add(rw);
    dust(fw.geometry, 0.3, 2.6, 0.8); dust(rw.geometry, 0.3, 2.6, 0.8);
    /* vérins de levage */
    var hyd = [new Hyd(g, g, [-0.95, 1.7, 0.4], bed, [-0.95, -0.1, 3.2], 0.2, 2.2, 0.12, 2.4, 'dark'), new Hyd(g, g, [0.95, 1.7, 0.4], bed, [0.95, -0.1, 3.2], 0.2, 2.2, 0.12, 2.4, 'dark')];
    return { g: g, bed: bed, load: load, wheels: [fw, rw], wheelR: 1.3, hyd: hyd, len: 10.4, wid: 5.8,
      heads: [[-2.3, 3.42, 5.6], [2.3, 3.42, 5.6]], tails: [[-1.0, 1.6, -4.05], [1.0, 1.6, -4.05]] };
  };

  /* ------------------------------------------------------------------ */
  /* Camion benne routier 8x4 aux couleurs AOS                           */
  /* ------------------------------------------------------------------ */
  V.roadTruck = function (seed) {
    var B = new A.Builder(), g = new T.Group(), s, i;
    B.add('dark', A.box(0.22, 0.32, 9.3, [-0.46, 0.98, -0.1]));
    B.add('dark', A.box(0.22, 0.32, 9.3, [0.46, 0.98, -0.1]));
    for (i = 0; i < 5; i++) B.add('dark', A.box(1.1, 0.18, 0.2, [0, 0.95, -4.2 + i * 2.1]));
    /* cabine avancée */
    B.add('white', A.rbox(2.5, 2.45, 2.15, 0.16, 2, [0, 2.45, 4.05]));
    B.add('white', A.rbox(2.4, 0.55, 1.6, 0.2, 1, [0, 3.85, 3.75]));
    B.add('green', A.box(2.52, 0.16, 2.0, [0, 1.75, 4.05]));
    B.add('gold', A.box(2.53, 0.05, 2.0, [0, 1.64, 4.05]));
    B.add('glass', A.box(2.2, 1.05, 0.06, [0, 2.95, 5.12], [-0.12, 0, 0]));
    B.add('glass', A.box(0.06, 0.75, 1.05, [-1.26, 2.95, 4.5]));
    B.add('glass', A.box(0.06, 0.75, 1.05, [1.26, 2.95, 4.5]));
    B.add('black', A.box(1.9, 0.62, 0.06, [0, 1.95, 5.14]));
    for (i = 0; i < 4; i++) B.add('grey', A.box(1.92, 0.05, 0.07, [0, 1.72 + i * 0.15, 5.18]));
    B.add('grey', A.rbox(2.5, 0.42, 0.36, 0.06, 1, [0, 0.92, 5.12]));
    B.add('black', A.box(2.42, 0.14, 0.42, [0, 3.58, 5.18]));
    B.add('lampW', A.box(0.42, 0.18, 0.08, [-0.92, 1.24, 5.17])); B.add('lampW', A.box(0.42, 0.18, 0.08, [0.92, 1.24, 5.17]));
    B.add('lampA', A.box(0.16, 0.08, 0.06, [-1.1, 3.72, 5.2])); B.add('lampA', A.box(0.16, 0.08, 0.06, [1.1, 3.72, 5.2]));
    for (s = -1; s <= 1; s += 2) {
      B.add('dark', A.bar([s * 1.25, 2.9, 4.9], [s * 1.55, 3.0, 4.95], 0.03, 4));
      B.add('black', A.box(0.08, 0.5, 0.28, [s * 1.58, 2.85, 4.95]));
      B.add('dark', A.box(0.6, 0.12, 0.5, [s * 1.1, 0.75, 4.55]));
      B.add('dark', A.box(0.6, 0.12, 0.5, [s * 1.1, 0.4, 4.55]));
    }
    /* réservoir, coffres, garde-boue */
    B.add('steel', A.cyl(0.32, 0.32, 1.5, 14, [-0.95, 1.0, 1.6], [Math.PI / 2, 0, 0]));
    B.add('dark', A.box(0.6, 0.55, 0.9, [0.95, 1.0, 1.7]));
    for (s = -1; s <= 1; s += 2) { B.add('black', A.box(0.75, 0.06, 2.7, [s * 1.05, 1.3, -2.55])); B.add('black', A.box(0.6, 0.06, 0.9, [s * 1.0, 1.25, 3.4])); }
    B.add('lampR', A.box(0.3, 0.15, 0.06, [-1.0, 1.05, -4.82])); B.add('lampR', A.box(0.3, 0.15, 0.06, [1.0, 1.05, -4.82]));
    var cab = B.build({ dirt: [0.2, 2.6, 0.7], seed: seed });
    g.add(cab);
    /* logos de portière */
    for (s = -1; s <= 1; s += 2) {
      var dec = new T.Mesh(new T.PlaneGeometry(1.35, 0.68), A.M.brandDoor);
      dec.position.set(s * 1.272, 2.25, 4.0); dec.rotation.y = s * Math.PI / 2;
      g.add(dec);
    }
    /* benne basculante */
    var bed = new T.Group(); bed.position.set(0, 1.2, -4.75); g.add(bed);
    var BB = new A.Builder();
    BB.add('grey', A.box(2.42, 0.15, 7.4, [0, 0.08, 3.75]));
    for (s = -1; s <= 1; s += 2) {
      BB.add('grey', A.box(0.08, 1.55, 7.4, [s * 1.2, 0.85, 3.75]));
      for (i = 0; i < 5; i++) BB.add('grey', A.box(0.12, 1.55, 0.12, [s * 1.26, 0.85, 0.5 + i * 1.6]));
      BB.add('grey', A.box(0.14, 0.14, 7.5, [s * 1.24, 1.62, 3.75]));
    }
    BB.add('grey', A.box(2.42, 1.95, 0.12, [0, 1.05, 7.45]));
    BB.add('grey', A.box(2.42, 0.12, 0.55, [0, 2.0, 7.7]));
    BB.add('grey', A.box(2.42, 1.55, 0.1, [0, 0.85, 0.05]));
    bed.add(BB.build({ dirt: [0, 1.6, 0.85], seed: seed + 1 }));
    var load = W.stockpile(5.0, 2.25, 1.15, seed * 2.3);
    load.rotation.y = Math.PI / 2; load.position.set(0, 0.85, 3.75);
    bed.add(load);
    /* essieux */
    var wl = [], ax = [4.15, 2.65, -1.85, -3.25];
    var wheels = ax.map(function (z, k) {
      var list = k < 2 ? [wheel(0.53, 0.32, 0.33, 14, '#c9c9c4', -1.06), wheel(0.53, 0.32, 0.33, 14, '#c9c9c4', 1.06)]
        : [wheel(0.53, 0.3, 0.33, 14, '#c9c9c4', -1.2), wheel(0.53, 0.3, 0.33, 14, '#c9c9c4', -0.86), wheel(0.53, 0.3, 0.33, 14, '#c9c9c4', 0.86), wheel(0.53, 0.3, 0.33, 14, '#c9c9c4', 1.2)];
      var m = axle(list); m.position.set(0, 0.53, z); dust(m.geometry, 0.0, 1.0, 0.75); g.add(m);
      return m;
    });
    return { g: g, bed: bed, load: load, wheels: wheels, wheelR: 0.53, hyd: [], len: 10.2, wid: 2.5,
      heads: [[-0.92, 1.24, 5.25], [0.92, 1.24, 5.25]], tails: [[-1.0, 1.05, -4.9], [1.0, 1.05, -4.9]] };
  };

  /* ------------------------------------------------------------------ */
  /* Pelle hydraulique (rétro) de grande taille                          */
  /* ------------------------------------------------------------------ */
  V.excavator = function () {
    var g = new T.Group(), B = new A.Builder(), s, i;
    /* train de chenilles */
    for (s = -1; s <= 1; s += 2) {
      var x = s * 2.25;
      var fr = new T.Shape();
      fr.moveTo(-2.7, 0.15); fr.lineTo(2.7, 0.15); fr.absarc(2.7, 0.72, 0.57, -Math.PI / 2, Math.PI / 2, false);
      fr.lineTo(-2.7, 1.29); fr.absarc(-2.7, 0.72, 0.57, Math.PI / 2, Math.PI * 1.5, false);
      B.add('dark', A.shapeExtrude(fr, 0.78, 0.04, [x, 0, 0], [0, -Math.PI / 2, 0], 10));
      /* patins */
      var n = 52, L = 2 * 5.4 + 2 * Math.PI * 0.68;
      for (i = 0; i < n; i++) {
        var d = i / n * L, px, py, ang;
        if (d < 5.4) { px = -2.7 + d; py = 0.04; ang = 0; }
        else if (d < 5.4 + Math.PI * 0.68) { ang = (d - 5.4) / 0.68; px = 2.7 + Math.sin(ang) * 0.68; py = 0.72 - Math.cos(ang) * 0.68; }
        else if (d < 10.8 + Math.PI * 0.68) { px = 2.7 - (d - 5.4 - Math.PI * 0.68); py = 1.4; ang = Math.PI; }
        else { ang = Math.PI + (d - 10.8 - Math.PI * 0.68) / 0.68; px = -2.7 + Math.sin(ang) * 0.68; py = 0.72 - Math.cos(ang) * 0.68; }
        B.add('black', A.box(0.96, 0.1, 0.36, [x, py, px], [-ang, 0, 0]));
      }
      for (i = 0; i < 6; i++) B.add('grey', A.cyl(0.18, 0.18, 0.5, 10, [x, 0.36, -2.0 + i * 0.8], [0, 0, Math.PI / 2]));
    }
    B.add('dark', A.box(3.4, 0.9, 3.0, [0, 1.25, 0]));
    B.add('dark', A.cyl(1.35, 1.35, 0.5, 20, [0, 1.85, 0]));
    g.add(B.build({ dirt: [0, 2.0, 1.0], seed: 11 }));
    /* tourelle */
    var up = new T.Group(); up.position.y = 2.1; g.add(up);
    var U = new A.Builder();
    U.add('dark', A.rbox(4.7, 0.55, 6.4, 0.08, 1, [0, 0.3, -0.45]));
    U.add('yellow', A.rbox(4.5, 1.75, 2.9, 0.16, 2, [0, 1.45, -2.0]));
    U.add('yellow', A.rbox(4.6, 1.6, 1.35, 0.5, 2, [0, 1.2, -3.85]));
    U.add('black', A.box(3.6, 0.9, 0.06, [0, 1.6, -0.52]));
    for (i = 0; i < 6; i++) U.add('grey', A.box(0.06, 0.8, 2.4, [-1.6 + i * 0.64, 2.36, -2.0]));
    U.add('yellow', A.rbox(1.7, 1.25, 2.3, 0.1, 1, [1.45, 1.2, 0.9]));
    U.add('yellow', A.rbox(1.7, 2.0, 2.25, 0.12, 2, [-1.45, 1.6, 1.55]));
    U.add('glass', A.box(1.45, 1.15, 0.06, [-1.45, 1.85, 2.7], [-0.1, 0, 0]));
    U.add('glass', A.box(0.06, 1.1, 1.7, [-2.31, 1.8, 1.55]));
    U.add('glass', A.box(0.06, 1.1, 1.0, [-0.59, 1.8, 1.9]));
    U.add('dark', A.box(1.8, 0.12, 2.35, [-1.45, 2.63, 1.55]));
    U.add('dark', A.cyl(0.14, 0.16, 1.1, 8, [1.2, 2.8, -2.6]));
    rails(U, 'yellow', [[2.25, 2.35, -3.3], [2.25, 2.35, 0.1]], 0.9, 0.03);
    rails(U, 'yellow', [[-2.25, 2.35, -3.3], [-2.25, 2.35, 0.3]], 0.9, 0.03);
    U.add('lampW', A.box(0.35, 0.22, 0.12, [-1.0, 2.75, 2.65])); U.add('lampW', A.box(0.35, 0.22, 0.12, [-1.9, 2.75, 2.65]));
    U.add('lampW', A.box(0.35, 0.22, 0.12, [1.5, 1.95, 2.08]));
    U.add('lampA', A.cyl(0.15, 0.15, 0.25, 10, [-1.45, 2.82, 1.0]));
    up.add(U.build({ dirt: [0, 1.4, 0.55], seed: 12 }));
    /* flèche (profil « banane ») */
    var boom = new T.Group(); boom.position.set(0.35, 1.0, 1.35); up.add(boom);
    var BM = new A.Builder();
    BM.add('yellow', A.extrude([[-0.4, -0.55], [2.4, 0.15], [4.5, 0.85], [6.7, 0.5], [8.0, -0.25], [8.1, 0.45], [6.9, 1.4], [4.5, 1.9], [2.4, 1.05], [-0.4, 0.65]], 1.05, 0.06, [0, 0, 0], [0, -Math.PI / 2, 0]));
    BM.add('dark', A.cyl(0.32, 0.32, 1.3, 12, [0, 0, 0], [0, 0, Math.PI / 2]));
    BM.add('dark', A.cyl(0.3, 0.3, 1.25, 12, [0, 0.1, 7.95], [0, 0, Math.PI / 2]));
    BM.add('steel', A.bar([0.5, 1.9, 4.5], [0.5, 1.3, 7.0], 0.05, 6));
    boom.add(BM.build({ dirt: [-0.5, 1.0, 0.35], seed: 13 }));
    /* balancier */
    var stick = new T.Group(); stick.position.set(0, 0.1, 7.95); boom.add(stick);
    var SB = new A.Builder();
    SB.add('yellow', A.extrude([[-0.7, -0.35], [4.3, -0.22], [4.4, 0.2], [0.5, 0.62], [-0.85, 0.75]], 0.78, 0.05, [0, 0, 0], [0, -Math.PI / 2, 0]));
    SB.add('dark', A.cyl(0.24, 0.24, 0.95, 10, [0, 0, 4.35], [0, 0, Math.PI / 2]));
    stick.add(SB.build({ dirt: [-1, 0.8, 0.45], seed: 14 }));
    /* godet */
    var bucket = new T.Group(); bucket.position.set(0, 0, 4.35); stick.add(bucket);
    var GB = new A.Builder();
    var bp = [[-0.25, 0.3], [0.55, 0.42], [1.5, 0.15], [2.05, -0.5], [2.1, -1.45], [1.85, -1.95], [1.45, -1.85], [1.7, -1.2], [1.55, -0.45], [0.8, -0.15], [-0.25, -0.2]];
    GB.add('yellow', A.extrude(bp, 2.5, 0.05, [0, 0, 0], [0, -Math.PI / 2, 0]));
    for (i = 0; i < 5; i++) GB.add('steel', A.box(0.2, 0.16, 0.5, [-1.0 + i * 0.5, -1.95, 1.75], [0.5, 0, 0]));
    GB.add('black', A.box(2.3, 0.1, 1.2, [0, -1.5, 1.35], [0.9, 0, 0]));
    bucket.add(GB.build({ dirt: [-2, 0.5, 1.0], seed: 15 }));
    var bl = W.stockpile(1.1, 1.2, 0.75, 4.4); bl.position.set(0, -0.85, 1.05); bl.rotation.set(0.4, 0, 0);
    bucket.add(bl);
    var hyd = [
      new Hyd(up, up, [-0.35, 1.25, 2.3], boom, [-0.35, -0.42, 3.2], 0.22, 2.6, 0.14, 2.9),
      new Hyd(up, up, [1.05, 1.25, 2.3], boom, [0.35, -0.42, 3.2], 0.22, 2.6, 0.14, 2.9),
      new Hyd(boom, boom, [0, 1.75, 3.9], stick, [0, 0.62, -0.62], 0.2, 2.4, 0.12, 2.6),
      new Hyd(stick, stick, [0, 0.55, 0.55], bucket, [0, 0.35, -0.15], 0.17, 2.0, 0.1, 2.1)
    ];
    return { g: g, up: up, boom: boom, stick: stick, bucket: bucket, load: bl, hyd: hyd };
  };

  /* chargeuse sur pneus (alimentation des camions routiers) */
  V.loader = function () {
    var g = new T.Group(), B = new A.Builder(), s;
    B.add('yellow', A.rbox(2.5, 1.5, 3.6, 0.15, 2, [0, 1.85, -1.9]));
    B.add('yellow', A.rbox(2.4, 0.5, 1.2, 0.2, 1, [0, 1.4, -3.75]));
    B.add('yellow', A.rbox(1.7, 1.9, 1.7, 0.12, 2, [0, 3.35, -0.35]));
    B.add('glass', A.box(1.45, 1.1, 0.06, [0, 3.55, 0.52]));
    B.add('glass', A.box(0.06, 1.0, 1.3, [-0.86, 3.55, -0.35])); B.add('glass', A.box(0.06, 1.0, 1.3, [0.86, 3.55, -0.35]));
    B.add('dark', A.box(1.85, 0.12, 1.85, [0, 4.33, -0.35]));
    B.add('dark', A.box(1.6, 1.0, 2.6, [0, 1.25, 1.1]));
    B.add('lampW', A.box(0.3, 0.18, 0.1, [-0.6, 4.2, 0.55])); B.add('lampW', A.box(0.3, 0.18, 0.1, [0.6, 4.2, 0.55]));
    B.add('lampA', A.cyl(0.13, 0.13, 0.22, 8, [0, 4.5, -0.6]));
    g.add(B.build({ dirt: [0.2, 2.6, 0.8], seed: 21 }));
    var wf = axle([wheel(0.95, 0.65, 0.55, 18, '#b7ae96', -1.25), wheel(0.95, 0.65, 0.55, 18, '#b7ae96', 1.25)]); wf.position.set(0, 0.95, 1.5); g.add(wf);
    var wr = axle([wheel(0.95, 0.65, 0.55, 18, '#b7ae96', -1.25), wheel(0.95, 0.65, 0.55, 18, '#b7ae96', 1.25)]); wr.position.set(0, 0.95, -2.0); g.add(wr);
    dust(wf.geometry, 0, 1.8, 0.8); dust(wr.geometry, 0, 1.8, 0.8);
    var arm = new T.Group(); arm.position.set(0, 1.9, 1.6); g.add(arm);
    var AB = new A.Builder();
    for (s = -1; s <= 1; s += 2) AB.add('yellow', A.extrude([[0, -0.2], [3.4, -0.6], [3.6, -0.15], [0.1, 0.25]], 0.25, 0.03, [s * 0.75, 0, 0], [0, -Math.PI / 2, 0]));
    AB.add('dark', A.box(1.6, 0.25, 0.3, [0, -0.2, 2.2]));
    arm.add(AB.build({ dirt: [-1, 0.5, 0.6], seed: 22 }));
    var bk = new T.Group(); bk.position.set(0, -0.4, 3.55); arm.add(bk);
    var KB = new A.Builder();
    KB.add('yellow', A.extrude([[0, 0.6], [0.3, 0.75], [1.1, 0.1], [1.2, -0.75], [0.0, -0.75], [-0.2, -0.3]], 2.9, 0.04, [0, 0, 0], [0, -Math.PI / 2, 0]));
    KB.add('steel', A.box(2.9, 0.08, 0.3, [0, -0.75, 1.25]));
    bk.add(KB.build({ dirt: [-1, 0.5, 1.0], seed: 23 }));
    var bl = W.stockpile(1.4, 0.9, 0.6, 7.7); bl.position.set(0, -0.35, 0.55); bk.add(bl);
    return { g: g, arm: arm, bucket: bk, load: bl, wheels: [wf, wr], wheelR: 0.95 };
  };

  /* bouteur sur chenilles (verse à stériles) */
  V.dozer = function () {
    var g = new T.Group(), B = new A.Builder(), s;
    for (s = -1; s <= 1; s += 2) {
      var fr = new T.Shape();
      fr.moveTo(-1.6, 0.1); fr.lineTo(1.6, 0.1); fr.absarc(1.6, 0.55, 0.45, -Math.PI / 2, Math.PI / 2, false); fr.lineTo(-1.6, 1.0); fr.absarc(-1.6, 0.55, 0.45, Math.PI / 2, Math.PI * 1.5, false);
      B.add('black', A.shapeExtrude(fr, 0.65, 0.03, [s * 1.2, 0, 0], [0, -Math.PI / 2, 0], 8));
    }
    B.add('yellow', A.rbox(2.0, 1.3, 3.6, 0.12, 2, [0, 1.5, 0]));
    B.add('yellow', A.rbox(1.6, 1.4, 1.5, 0.1, 1, [0, 2.75, -0.6]));
    B.add('glass', A.box(1.4, 0.9, 0.06, [0, 2.85, 0.16])); B.add('glass', A.box(0.06, 0.85, 1.2, [-0.81, 2.85, -0.6])); B.add('glass', A.box(0.06, 0.85, 1.2, [0.81, 2.85, -0.6]));
    B.add('dark', A.box(1.7, 0.1, 1.6, [0, 3.5, -0.6]));
    B.add('yellow', A.extrude([[0, 0], [0.5, 0], [0.75, 1.6], [0.3, 1.75], [-0.05, 1.4]], 4.2, 0.04, [0, 0.05, 2.6], [0, -Math.PI / 2, 0]));
    B.add('dark', A.bar([-1.25, 0.9, 0.8], [-1.25, 0.5, 2.6], 0.12, 6)); B.add('dark', A.bar([1.25, 0.9, 0.8], [1.25, 0.5, 2.6], 0.12, 6));
    B.add('dark', A.box(0.3, 1.4, 0.3, [0, 0.8, -2.2]));
    B.add('lampW', A.box(0.28, 0.16, 0.08, [-0.5, 3.4, 0.2])); B.add('lampW', A.box(0.28, 0.16, 0.08, [0.5, 3.4, 0.2]));
    g.add(B.build({ dirt: [0.2, 2.2, 0.9], seed: 31 }));
    return { g: g };
  };

  /* ------------------------------------------------------------------ */
  /* Navires                                                             */
  /* ------------------------------------------------------------------ */
  /* coque : forme en plan extrudée verticalement (y de y0 à y1) */
  function hullPlan(halfB, sternZ, midA, midB, bowZ, sternW) {
    var s = new T.Shape(), sw = halfB * (sternW || 0.9);
    s.moveTo(-sw, sternZ); s.lineTo(sw, sternZ);
    s.quadraticCurveTo(halfB, sternZ + 1.5, halfB, midA);
    s.lineTo(halfB, midB);
    s.bezierCurveTo(halfB, midB + (bowZ - midB) * 0.55, halfB * 0.45, bowZ - (bowZ - midB) * 0.08, 0, bowZ);
    s.bezierCurveTo(-halfB * 0.45, bowZ - (bowZ - midB) * 0.08, -halfB, midB + (bowZ - midB) * 0.55, -halfB, midB);
    s.lineTo(-halfB, midA);
    s.quadraticCurveTo(-halfB, sternZ + 1.5, -sw, sternZ);
    return s;
  }
  function hullBand(shape, y0, y1, curveSeg) {
    var g = new T.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: curveSeg || 12 });
    g.rotateX(Math.PI / 2); g.translate(0, y1, 0);
    g.deleteAttribute('uv');
    return g;
  }
  function inset(shape, k) {
    var pts = shape.getPoints(12), s = new T.Shape();
    s.moveTo(pts[0].x * k, pts[0].y * (1 - (1 - k) * 0.15));
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i].x * k, pts[i].y * (1 - (1 - k) * 0.15));
    return s;
  }
  function windowRow(B, x0, x1, y, z, n, w, h, nx, key) {
    for (var i = 0; i < n; i++) {
      var x = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1);
      B.add(key || 'windowLit', nx ? A.box(0.12, h, w, [z, y, x]) : A.box(w, h, 0.12, [x, y, z]));
    }
  }
  function railLine(B, a, b, h, key) {
    B.add(key || 'lightgrey', A.bar([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.04, 4));
    B.add(key || 'lightgrey', A.bar([a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.03, 4));
    var L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.round(L / 3));
    for (var i = 0; i <= n; i++) { var t = i / n; B.add(key || 'lightgrey', A.bar([lerp(a[0], b[0], t), a[1], lerp(a[2], b[2], t)], [lerp(a[0], b[0], t), a[1] + h, lerp(a[2], b[2], t)], 0.035, 4)); }
  }

  /* vraquier (type Capesize) au mouillage, cale n°6 ouverte */
  V.bulkCarrier = function () {
    var g = new T.Group(), B = new A.Builder(), i;
    var HB = 21, sz = -120, bz = 121, deck = 8.5;
    var plan = hullPlan(HB, sz, -105, 72, bz, 0.9);
    B.add('hullRed', hullBand(plan, -3, 1.4, 16));
    B.add('hull', hullBand(plan, 1.4, deck, 16));
    B.add('deck', hullBand(inset(plan, 0.985), deck, deck + 0.12, 16));
    /* gaillard d'avant */
    var fc = new T.Shape(); fc.moveTo(-HB, 98); fc.lineTo(HB, 98); fc.bezierCurveTo(HB, 108, HB * 0.55, 119, 0, bz); fc.bezierCurveTo(-HB * 0.55, 119, -HB, 108, -HB, 98);
    B.add('hull', hullBand(fc, deck, deck + 3, 12));
    B.add('deck', hullBand(inset(fc, 0.97), deck + 3, deck + 3.1, 12));
    /* panneaux de cale */
    W.SHIPHATCH = [];
    for (i = 0; i < 9; i++) {
      var z = -80 + i * 19.2;
      B.add('hatch', A.box(19.5, 1.7, 14.2, [0, deck + 0.85, z]));
      if (i === 5) {
        B.add('black', A.box(18.5, 0.2, 13.2, [0, deck + 1.0, z]));
        B.add('hatch', A.box(9.6, 0.8, 14.6, [-14.6, deck + 2.15, z])); B.add('hatch', A.box(9.6, 0.8, 14.6, [-14.6, deck + 2.95, z]));
        W.SHIPHATCH = [0, deck + 1.7, z];
      } else {
        B.add('hatch', A.box(9.9, 0.7, 14.9, [-4.95, deck + 2.05, z]));
        B.add('hatch', A.box(9.9, 0.7, 14.9, [4.95, deck + 2.05, z]));
        for (var r = -2; r <= 2; r++) B.add('rust', A.box(19.8, 0.12, 0.25, [0, deck + 2.45, z + r * 3]));
      }
    }
    /* château arrière : 6 niveaux + passerelle + ailerons */
    var cz = -101;
    for (i = 0; i < 6; i++) {
      var w = 28 - i * 0.8, y = deck + 1.4 + i * 2.8;
      B.add('white', A.box(w, 2.8, 14, [0, y, cz]));
      windowRow(B, -w / 2 + 2, w / 2 - 2, y + 0.3, cz + 7.05, 9, 1.2, 1.0);
      windowRow(B, cz - 5, cz + 5, y + 0.3, w / 2 + 0.05, 4, 1.2, 1.0, true);
      windowRow(B, cz - 5, cz + 5, y + 0.3, -w / 2 - 0.05, 4, 1.2, 1.0, true);
      railLine(B, [-w / 2, y + 1.4, cz + 7.6], [w / 2, y + 1.4, cz + 7.6], 1.0);
    }
    var by = deck + 1.4 + 6 * 2.8;
    B.add('white', A.box(26, 2.8, 12, [0, by, cz + 0.5]));
    B.add('glass', A.box(24, 1.3, 0.1, [0, by + 0.35, cz + 6.55]));
    B.add('white', A.box(HB * 2, 0.45, 3.4, [0, by - 1.1, cz + 4.6]));
    B.add('glass', A.box(0.1, 1.0, 2.6, [HB - 0.2, by - 0.3, cz + 4.6])); B.add('glass', A.box(0.1, 1.0, 2.6, [-HB + 0.2, by - 0.3, cz + 4.6]));
    B.add('white', A.box(0.4, 1.6, 3.4, [HB - 0.2, by - 0.1, cz + 4.6])); B.add('white', A.box(0.4, 1.6, 3.4, [-HB + 0.2, by - 0.1, cz + 4.6]));
    B.add('white', A.box(27, 0.4, 13, [0, by + 1.6, cz + 0.5]));
    /* mât radar */
    B.add('white', A.box(1.2, 7, 1.2, [0, by + 5.2, cz - 1]));
    B.add('white', A.box(9, 0.3, 0.6, [0, by + 6.5, cz - 1]));
    B.add('dark', A.box(4.5, 0.2, 0.3, [0, by + 8.3, cz - 1]));
    B.add('lampW', A.sph(0.25, 8, 6, [0, by + 8.9, cz - 1]));
    /* cheminée */
    B.add('white', A.rbox(8, 9, 7, 1.2, 2, [0, by + 3.6, cz - 9]));
    B.add('black', A.rbox(8.05, 1.6, 7.05, 1.2, 2, [0, by + 7.9, cz - 9]));
    B.add('green', A.box(8.1, 1.2, 7.1, [0, by + 5.4, cz - 9]));
    /* canot de sauvetage en chute libre (orange) */
    B.add('orange', A.rbox(3.2, 3.0, 9.0, 1.3, 2, [0, deck + 6.2, -114], [-0.5, 0, 0]));
    B.add('lightgrey', A.bar([-2.2, deck, -108], [-2.2, deck + 8.5, -118], 0.25, 6)); B.add('lightgrey', A.bar([2.2, deck, -108], [2.2, deck + 8.5, -118], 0.25, 6));
    /* mâts avant/arrière, treuils, guindeau */
    B.add('lightgrey', A.cyl(0.35, 0.45, 12, 8, [0, deck + 9, 104]));
    B.add('lampW', A.sph(0.3, 8, 6, [0, deck + 15.2, 104]));
    for (i = -1; i <= 1; i += 2) {
      B.add('dark', A.cyl(1.0, 1.0, 2.0, 12, [i * 5, deck + 4.2, 109], [0, 0, Math.PI / 2]));
      B.add('dark', A.cyl(0.9, 0.9, 1.8, 12, [i * 8, deck + 1.0, -113], [0, 0, Math.PI / 2]));
    }
    /* garde-corps de pont */
    railLine(B, [HB - 0.4, deck, -105], [HB - 0.4, deck, 98], 1.1);
    railLine(B, [-HB + 0.4, deck, -105], [-HB + 0.4, deck, 98], 1.1);
    /* feux de pont */
    for (i = 0; i < 6; i++) B.add('lampW', A.box(0.4, 0.3, 0.3, [HB - 0.6, deck + 3.5, -60 + i * 26]));
    var ship = B.build({ dirt: [-3, 3, 0.25], seed: 41 });
    g.add(ship);
    /* chaîne d'ancre (caténaire) */
    var chain = new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(-13, deck + 1.5, 112), new T.Vector3(-17, 2, 128), new T.Vector3(-18, -1, 138)), 16, 0.22, 6, false);
    var ch = new T.Mesh(paint(chain, '#ffffff'), A.M.dark); g.add(ch);
    /* cargaison visible dans la cale ouverte */
    var pile = W.stockpile(8, 10, 3.0, 8.1); pile.position.set(0, deck - 1.0, W.SHIPHATCH[2]); g.add(pile);
    var lights = [
      { p: [0, deck + 15.4, 104], c: [1, 0.95, 0.85], s: 1.6, st: 4.6 },
      { p: [0, by + 9, cz - 1], c: [1, 0.95, 0.85], s: 1.6, st: 4.6 },
      { p: [HB + 0.5, by - 0.4, cz + 4.6], c: [0.2, 1, 0.35], s: 1.4, st: 4.6 },
      { p: [-HB - 0.5, by - 0.4, cz + 4.6], c: [1, 0.15, 0.1], s: 1.4, st: 4.6 }
    ];
    for (i = 0; i < 8; i++) lights.push({ p: [i % 2 ? HB - 1 : -HB + 1, deck + 4, -70 + i * 22], c: [1, 0.82, 0.55], s: 1.4, st: 4.4, pool: 0 });
    for (i = 0; i < 6; i++) lights.push({ p: [-12 + i * 5, by + 0.5, cz + 7.2], c: [1, 0.8, 0.5], s: 0.9, st: 4.5 });
    return { g: g, lights: lights, deck: deck, halfB: HB };
  };

  /* barge à trémie (chargée ou vide) */
  V.barge = function (loaded, seed) {
    var g = new T.Group(), B = new A.Builder();
    var plan = new T.Shape();
    plan.moveTo(-10, -42); plan.lineTo(10, -42); plan.lineTo(11, -38); plan.lineTo(11, 38); plan.lineTo(10, 42); plan.lineTo(-10, 42); plan.lineTo(-11, 38); plan.lineTo(-11, -38); plan.closePath();
    var fb = loaded ? 1.4 : 3.2;
    B.add('hullRed', hullBand(plan, -2, fb - 1.2, 2));
    B.add('hull', hullBand(plan, fb - 1.2, fb, 2));
    B.add('rust', A.box(20.4, 0.2, 82, [0, fb + 0.05, 0]));
    B.add('rust', A.box(0.6, 1.4, 76, [-9.6, fb + 0.7, 0])); B.add('rust', A.box(0.6, 1.4, 76, [9.6, fb + 0.7, 0]));
    B.add('rust', A.box(19.8, 1.4, 0.6, [0, fb + 0.7, -38])); B.add('rust', A.box(19.8, 1.4, 0.6, [0, fb + 0.7, 38]));
    for (var i = 0; i < 6; i++) { B.add('dark', A.cyl(0.3, 0.35, 0.7, 8, [-10.4, fb + 0.35, -36 + i * 14.4])); B.add('dark', A.cyl(0.3, 0.35, 0.7, 8, [10.4, fb + 0.35, -36 + i * 14.4])); }
    B.add('white', A.box(0.1, 0.6, 30, [11.02, fb - 0.6, 0])); B.add('white', A.box(0.1, 0.6, 30, [-11.02, fb - 0.6, 0]));
    g.add(B.build({ dirt: [-1, 2, 0.3], seed: seed || 51 }));
    var cargo = null;
    if (loaded) { cargo = W.stockpile(58, 16, 4.6, (seed || 1) * 3.7); cargo.rotation.y = Math.PI / 2; cargo.position.set(0, fb + 0.2, 0); g.add(cargo); }
    return { g: g, cargo: cargo, freeboard: fb };
  };

  /* pousseur / remorqueur */
  V.tug = function () {
    var g = new T.Group(), B = new A.Builder();
    var plan = hullPlan(4.6, -13, -11, 4, 15, 0.85);
    B.add('hullRed', hullBand(plan, -1.5, 0.6, 10));
    B.add('hull', hullBand(plan, 0.6, 2.4, 10));
    B.add('deck', hullBand(inset(plan, 0.95), 2.4, 2.5, 10));
    B.add('white', A.box(9.2, 0.25, 0.6, [0, 2.0, 15.0]));
    B.add('black', A.box(8.6, 1.2, 0.8, [0, 2.0, 14.6]));
    B.add('white', A.rbox(7.4, 2.6, 10, 0.2, 1, [0, 3.8, -1]));
    B.add('white', A.rbox(5.6, 2.4, 5.2, 0.2, 1, [0, 6.3, 1.2]));
    B.add('glass', A.box(5.0, 1.0, 0.08, [0, 6.6, 3.82])); B.add('glass', A.box(0.08, 0.9, 4, [2.81, 6.6, 1.2])); B.add('glass', A.box(0.08, 0.9, 4, [-2.81, 6.6, 1.2]));
    B.add('dark', A.box(6, 0.2, 5.8, [0, 7.6, 1.2]));
    B.add('green', A.rbox(1.6, 3, 2.2, 0.4, 1, [0, 6.5, -4]));
    B.add('gold', A.box(1.65, 0.3, 2.25, [0, 7.2, -4]));
    B.add('lightgrey', A.cyl(0.12, 0.12, 5, 6, [0, 10.5, 1.5]));
    B.add('lampW', A.sph(0.2, 6, 4, [0, 13, 1.5])); B.add('lampA', A.sph(0.2, 6, 4, [0, 12.4, 1.5]));
    for (var i = 0; i < 6; i++) { B.add('black', A.xf(new T.TorusGeometry(0.55, 0.22, 6, 12), [4.75, 1.6, -9 + i * 3.4], [0, Math.PI / 2, 0])); B.add('black', A.xf(new T.TorusGeometry(0.55, 0.22, 6, 12), [-4.75, 1.6, -9 + i * 3.4], [0, Math.PI / 2, 0])); }
    windowRow(B, -2.8, 2.8, 4.0, 4.05, 4, 0.8, 0.7);
    g.add(B.build({ dirt: [-1, 2, 0.2], seed: 61 }));
    return { g: g, lights: [{ p: [0, 13.1, 1.5], c: [1, 0.95, 0.85], s: 1.0, st: 4.2 }, { p: [4.8, 6, 1.2], c: [0.2, 1, 0.35], s: 0.9, st: 4.2 }, { p: [-4.8, 6, 1.2], c: [1, 0.15, 0.1], s: 0.9, st: 4.2 }] };
  };

  /* grue flottante de transbordement (ponton + grue à benne preneuse) */
  V.floatingCrane = function () {
    var g = new T.Group(), B = new A.Builder(), i;
    B.add('grey', A.box(30, 4.8, 62, [0, 0.4, 0]));
    B.add('paintYellow2', A.box(30.1, 0.6, 62.1, [0, 2.5, 0]));
    B.add('deck', A.box(29.4, 0.1, 61.4, [0, 2.86, 0]));
    B.add('yellow', A.box(12, 6.5, 9, [0, 6.1, 20]));
    B.add('yellow', A.cyl(5.5, 1.8, 4.5, 4, [8, 7.2, 4], [0, Math.PI / 4, 0], true));
    for (i = 0; i < 4; i++) B.add('grey', A.box(0.6, 4.5, 0.6, [8 + (i % 2 ? 3.5 : -3.5), 5.1, 4 + (i < 2 ? 3.5 : -3.5)]));
    B.add('white', A.box(8, 5, 7, [-8, 5.4, 22]));
    windowRow(B, -11, -5, 5.8, 25.55, 4, 0.9, 0.9);
    B.add('yellow', A.cyl(2.6, 3.2, 10, 16, [0, 7.9, -6]));
    for (i = 0; i < 4; i++) B.add('black', A.cyl(1.4, 1.4, 4, 12, [i % 2 ? 15.6 : -15.6, 1, -20 + Math.floor(i / 2) * 40], [Math.PI / 2, 0, 0]));
    g.add(B.build({ dirt: [-1, 4, 0.25], seed: 71 }));
    var slew = new T.Group(); slew.position.set(0, 12.9, -6); g.add(slew);
    var S2 = new A.Builder();
    S2.add('yellow', A.rbox(8, 5, 11, 0.3, 1, [0, 2.6, -3]));
    S2.add('yellow', A.rbox(3, 3, 3.2, 0.2, 1, [-3.2, 3.4, 3.8]));
    S2.add('glass', A.box(2.6, 1.6, 0.08, [-3.2, 3.7, 5.42]));
    S2.add('yellow', A.bar([-2.4, 5, -6], [0, 15, -3], 0.35, 8)); S2.add('yellow', A.bar([2.4, 5, -6], [0, 15, -3], 0.35, 8));
    S2.add('yellow', A.bar([-2.4, 5, 0], [0, 15, -3], 0.3, 8)); S2.add('yellow', A.bar([2.4, 5, 0], [0, 15, -3], 0.3, 8));
    var foot = [0, 3, 2], ang = 0.72, BL = 40, tip = [0, foot[1] + Math.sin(ang) * BL, foot[2] + Math.cos(ang) * BL];
    W.truss(S2, 'yellow', foot, tip, 2.6, 2.4, 3.2, 0.14);
    S2.add('dark', A.bar([0, 15, -3], [0, tip[1] + 2.3, tip[2]], 0.06, 4));
    S2.add('dark', A.bar([0, 15.2, -3], [0, tip[1] + 2.4, tip[2] - 0.5], 0.06, 4));
    S2.add('lampW', A.box(0.6, 0.4, 0.4, [0, tip[1] + 2.6, tip[2]]));
    S2.add('lampR', A.sph(0.25, 6, 4, [0, tip[1] + 3.0, tip[2]]));
    slew.add(S2.build({ dirt: [0, 3, 0.25], seed: 72 }));
    /* câbles de levage + benne preneuse */
    var cable = new T.Mesh(paint(new T.CylinderGeometry(0.05, 0.05, 1, 4).translate(0, -0.5, 0), '#ffffff'), A.M.dark);
    cable.position.set(0, tip[1] + 2.3, tip[2]); slew.add(cable);
    var grab = new T.Group(); slew.add(grab);
    var GB = new A.Builder();
    GB.add('dark', A.box(1.4, 1.6, 1.4, [0, 1.6, 0]));
    var halfA = new T.Group(), halfB = new T.Group(); grab.add(halfA); grab.add(halfB);
    var shellG = A.merge([paint(new T.CylinderGeometry(1.7, 1.7, 3.2, 12, 1, false, 0, Math.PI / 2).rotateZ(Math.PI / 2).translate(0, -0.2, 0), '#ffffff')]);
    var shA = new T.Mesh(shellG, A.M.paintYellow2); shA.rotation.x = Math.PI; shA.position.y = 0.6; halfA.add(shA);
    var shB = new T.Mesh(shellG, A.M.paintYellow2); shB.rotation.x = -Math.PI / 2; shB.position.y = 0.6; halfB.add(shB);
    shA.castShadow = shB.castShadow = true;
    grab.add(GB.build({ seed: 73 }));
    var grabLoad = W.stockpile(1.6, 2.4, 1.0, 9.9); grabLoad.rotation.y = Math.PI / 2; grabLoad.position.y = -0.4; grab.add(grabLoad);
    return { g: g, slew: slew, grab: grab, cable: cable, halves: [halfA, halfB], load: grabLoad, tip: tip,
      lights: [{ p: [0, 30, 0], c: [1, 0.85, 0.6], s: 2.2, st: 4.3 }] };
  };

  /* pétrolier souteur AOS */
  V.bunkerTanker = function () {
    var g = new T.Group(), B = new A.Builder(), i;
    var HB = 8.6, deck = 3.8;
    var plan = hullPlan(HB, -50, -44, 30, 52, 0.85);
    B.add('hullRed', hullBand(plan, -2, 0.8, 14));
    B.add('green', hullBand(plan, 0.8, deck, 14));
    B.add('white', hullBand(inset(plan, 1.003), deck - 0.35, deck - 0.1, 14));
    B.add('deck', hullBand(inset(plan, 0.98), deck, deck + 0.1, 14));
    var fc = new T.Shape(); fc.moveTo(-HB, 40); fc.lineTo(HB, 40); fc.bezierCurveTo(HB, 46, HB * 0.5, 51.5, 0, 52); fc.bezierCurveTo(-HB * 0.5, 51.5, -HB, 46, -HB, 40);
    B.add('green', hullBand(fc, deck, deck + 2.2, 10));
    /* tuyauteries de pont + passerelle */
    for (i = 0; i < 4; i++) B.add('steel', A.bar([-3 + i * 1.2, deck + 0.6, -34], [-3 + i * 1.2, deck + 0.6, 38], 0.22, 8));
    B.add('lightgrey', A.box(1.6, 0.12, 74, [3.4, deck + 2.2, 2]));
    for (i = 0; i < 12; i++) B.add('lightgrey', A.box(0.15, 2.2, 0.15, [3.4, deck + 1.1, -34 + i * 6.4]));
    /* collecteur + grue de manutention du flexible */
    B.add('steel', A.box(7, 1.2, 2.2, [-1, deck + 1.2, 0]));
    B.add('paintYellow2', A.cyl(0.5, 0.6, 5, 10, [-5.6, deck + 2.5, -2]));
    B.add('paintYellow2', A.bar([-5.6, deck + 5, -2], [-9.4, deck + 9.8, -1], 0.28, 8));
    /* château arrière */
    var cz = -40;
    for (i = 0; i < 3; i++) {
      var w = 15 - i * 0.8, y = deck + 1.3 + i * 2.6;
      B.add('white', A.box(w, 2.6, 10, [0, y, cz]));
      windowRow(B, -w / 2 + 1.5, w / 2 - 1.5, y + 0.3, cz + 5.05, 6, 0.9, 0.9);
    }
    var by = deck + 1.3 + 3 * 2.6;
    B.add('white', A.box(16.8, 2.6, 8, [0, by, cz + 0.5]));
    B.add('glass', A.box(15.4, 1.2, 0.08, [0, by + 0.3, cz + 4.55]));
    B.add('white', A.box(17.4, 0.3, 8.6, [0, by + 1.45, cz + 0.5]));
    B.add('white', A.box(0.8, 5, 0.8, [0, by + 4, cz - 1])); B.add('white', A.box(5, 0.25, 0.4, [0, by + 5.5, cz - 1]));
    B.add('green', A.rbox(4.4, 5.6, 4, 0.8, 2, [0, by + 1.6, cz - 7]));
    B.add('gold', A.box(4.45, 0.4, 4.05, [0, by + 2.8, cz - 7]));
    B.add('black', A.rbox(4.45, 0.9, 4.05, 0.8, 1, [0, by + 4.1, cz - 7]));
    B.add('orange', A.rbox(2.2, 2.0, 6.5, 0.9, 2, [6.6, deck + 4.6, cz - 1]));
    B.add('lightgrey', A.cyl(0.25, 0.3, 7, 6, [0, deck + 5.5, 46]));
    railLine(B, [HB - 0.3, deck, -44], [HB - 0.3, deck, 40], 1.0);
    railLine(B, [-HB + 0.3, deck, -44], [-HB + 0.3, deck, 40], 1.0);
    g.add(B.build({ dirt: [-2, 2, 0.2], seed: 81 }));
    /* « GROUPE AOS » sur les flancs + logo de cheminée */
    for (var s = -1; s <= 1; s += 2) {
      var hullTxt = new T.Mesh(new T.PlaneGeometry(26, 6.5), A.M.brandHull);
      hullTxt.position.set(s * (HB + 0.03), 2.4, 4); hullTxt.rotation.y = s * Math.PI / 2; g.add(hullTxt);
      var fun = new T.Mesh(new T.PlaneGeometry(3.6, 1.8), A.M.brandWhite);
      fun.position.set(s * 2.23, by + 1.4, cz - 7); fun.rotation.y = s * Math.PI / 2; g.add(fun);
    }
    var lights = [{ p: [0, deck + 9.2, 46], c: [1, 0.95, 0.85], s: 1.2, st: 4.5 }, { p: [0, by + 6.6, cz - 1], c: [1, 0.95, 0.85], s: 1.2, st: 4.5 }];
    for (i = 0; i < 5; i++) lights.push({ p: [-HB + 1, deck + 3.5, -30 + i * 14], c: [1, 0.82, 0.55], s: 1.0, st: 4.5 });
    return { g: g, lights: lights, deck: deck, halfB: HB, hoseTip: [-9.4, deck + 9.8, -1] };
  };

  /* pirogue guinéenne peinte */
  V.pirogue = function (seed) {
    var r = A.rng(seed), g = new T.Group();
    var L = 13 + r() * 6, Bw = 1.3 + r() * 0.3;
    var sh = new T.Shape();
    sh.moveTo(0, -L / 2); sh.quadraticCurveTo(Bw, -L / 4, Bw, 0); sh.quadraticCurveTo(Bw, L / 4, 0, L / 2); sh.quadraticCurveTo(-Bw, L / 4, -Bw, 0); sh.quadraticCurveTo(-Bw, -L / 4, 0, -L / 2);
    var cols = ['#1f5fa8', '#e2b31b', '#c0392b', '#1f8a4c', '#f2f2f2', '#2bb3c0'];
    var B = new A.Builder();
    var lo = hullBand(sh, -0.4, 0.25, 10), hi = hullBand(sh, 0.25, 0.75, 10);
    A.M['pir' + seed + 'a'] = A.M['pir' + seed + 'a'] || A.patch(new T.MeshStandardMaterial({ color: cols[(r() * cols.length) | 0], roughness: 0.6, vertexColors: true }), 'fog');
    A.M['pir' + seed + 'b'] = A.M['pir' + seed + 'b'] || A.patch(new T.MeshStandardMaterial({ color: cols[(r() * cols.length) | 0], roughness: 0.6, vertexColors: true }), 'fog');
    B.add('pir' + seed + 'a', lo); B.add('pir' + seed + 'b', hi);
    B.add('wood', A.box(Bw * 1.5, 0.1, L * 0.7, [0, 0.35, 0]));
    for (var i = 0; i < 4; i++) B.add('wood', A.box(Bw * 1.8, 0.12, 0.3, [0, 0.6, -L * 0.3 + i * L * 0.2]));
    B.add('black', A.box(0.4, 0.9, 0.4, [0, 0.4, -L / 2 + 0.6]));
    if (r() < 0.5) { B.add('wall', A.box(Bw * 1.7, 0.06, 3.5, [0, 2.0, 0])); B.add('wood', A.box(0.08, 1.4, 0.08, [Bw * 0.8, 1.3, 1.6])); B.add('wood', A.box(0.08, 1.4, 0.08, [-Bw * 0.8, 1.3, -1.6])); }
    g.add(B.build({ seed: seed }));
    return { g: g, len: L };
  };

  /* ------------------------------------------------------------------ */
  /* Plateforme pétrolière offshore (jacket + topsides + torchère)        */
  /* ------------------------------------------------------------------ */
  V.platform = function () {
    var g = new T.Group(), B = new A.Builder(), i, s, t;
    /* jacket à jambes inclinées */
    var legs = [[-16, -12], [16, -12], [16, 12], [-16, 12]];
    var top = 21, bot = -6;
    legs.forEach(function (l) {
      var bx = l[0] * 1.16, bz = l[1] * 1.2;
      B.add('lightgrey', A.bar([bx, bot, bz], [l[0], top, l[1]], 1.1, 12));
      B.add('paintYellow2', A.bar([lerp(bx, l[0], 0.16), bot + 4.3, lerp(bz, l[1], 0.16)], [lerp(bx, l[0], 0.31), bot + 8.4, lerp(bz, l[1], 0.31)], 1.16, 12));
    });
    function legAt(k, y) { var l = legs[k], f = (y - bot) / (top - bot); return [lerp(l[0] * 1.16, l[0], f), y, lerp(l[1] * 1.2, l[1], f)]; }
    [2, 13, 20].forEach(function (y) { for (var k = 0; k < 4; k++) B.add('lightgrey', A.bar(legAt(k, y), legAt((k + 1) % 4, y), 0.4, 8)); });
    for (var k = 0; k < 4; k++) { B.add('lightgrey', A.bar(legAt(k, 2), legAt((k + 1) % 4, 13), 0.32, 8)); B.add('lightgrey', A.bar(legAt((k + 1) % 4, 2), legAt(k, 13), 0.32, 8)); }
    /* ponts */
    var decks = [[21, 54, 42], [29, 54, 42], [37, 44, 34]];
    decks.forEach(function (d) {
      B.add('grey', A.box(d[1], 1.2, d[2], [0, d[0], 0]));
      B.add('paintYellow2', A.box(d[1] + 0.2, 0.25, d[2] + 0.2, [0, d[0] + 0.72, 0]));
      railLine(B, [-d[1] / 2, d[0] + 0.6, d[2] / 2], [d[1] / 2, d[0] + 0.6, d[2] / 2], 1.1, 'paintYellow2');
      railLine(B, [-d[1] / 2, d[0] + 0.6, -d[2] / 2], [d[1] / 2, d[0] + 0.6, -d[2] / 2], 1.1, 'paintYellow2');
    });
    for (i = 0; i < 8; i++) { var cx = -24 + (i % 4) * 16, cz2 = i < 4 ? -18 : 18; B.add('grey', A.box(0.8, 8, 0.8, [cx, 25, cz2])); B.add('grey', A.box(0.8, 8, 0.8, [cx * 0.8, 33, cz2 * 0.8])); }
    /* modules et équipements */
    var r = A.rng(5), keys = ['white', 'lightgrey', 'paintYellow2', 'orange', 'paintBlue', 'paintTeal', 'white', 'grey'];
    for (i = 0; i < 16; i++) {
      var lvl = decks[i % 2], w = 5 + r() * 8, d = 4 + r() * 7, h = 2.5 + r() * 4;
      var x = -20 + r() * 40, z = -14 + r() * 28;
      B.add(keys[(r() * keys.length) | 0], A.box(w, h, d, [x, lvl[0] + 0.6 + h / 2, z]));
    }
    for (i = 0; i < 4; i++) B.add('lightgrey', A.cyl(1.4, 1.4, 9, 14, [-12 + i * 4, 31.2, 14], [Math.PI / 2, 0, 0]));
    for (i = 0; i < 6; i++) B.add('steel', A.bar([-24, 23 + i * 0.5, -6 + i * 0.6], [24, 23 + i * 0.5, -6 + i * 0.6], 0.25, 6));
    /* quartiers d'habitation + hélipont */
    B.add('white', A.box(16, 12, 16, [-29, 43, 0]));
    for (i = 0; i < 3; i++) { windowRow(B, -6, 6, 39.5 + i * 3.6, -37.05, 7, 1.1, 1.0, true); windowRow(B, -35, -23, 39.5 + i * 3.6, 8.05, 6, 1.1, 1.0); }
    B.add('grey', A.box(0.8, 6, 0.8, [-36, 52, -7])); B.add('grey', A.box(0.8, 6, 0.8, [-36, 52, 7])); B.add('grey', A.box(0.8, 6, 0.8, [-22, 52, -7])); B.add('grey', A.box(0.8, 6, 0.8, [-22, 52, 7]));
    B.add('grey', A.cyl(13, 13, 0.8, 8, [-31, 55.4, 0]));
    var heli = new T.Mesh(new T.CircleGeometry(12.6, 8).rotateX(-Math.PI / 2).rotateY(Math.PI / 8), A.M.helipad);
    heli.position.set(-31, 55.82, 0); heli.receiveShadow = true;
    /* derrick (treillis effilé) */
    var dx0 = 8, dz0 = 0, dy0 = 37.6, dh = 50;
    function dp(c, f) { var hw = lerp(5, 1.4, f); return [dx0 + (c === 0 || c === 3 ? -hw : hw), dy0 + f * dh, dz0 + (c < 2 ? -hw : hw)]; }
    var nseg = 12;
    for (s = 0; s < nseg; s++) {
      var f0 = s / nseg, f1 = (s + 1) / nseg;
      for (var c = 0; c < 4; c++) {
        B.add('white', A.bar(dp(c, f0), dp(c, f1), 0.26, 4, true));
        B.add('white', A.bar(dp(c, f1), dp((c + 1) % 4, f1), 0.16, 4, true));
        B.add('white', A.bar(dp(c, f0), dp((c + 1) % 4, f1), 0.12, 4, true));
      }
    }
    B.add('grey', A.box(5, 3, 5, [dx0, dy0 + dh + 1.4, dz0]));
    B.add('grey', A.box(12, 6, 12, [dx0, dy0 - 2.4, dz0]));
    /* torchère */
    var fb0 = [27, 30, 12], ang = 0.55, FL = 52, fb1 = [27 + Math.cos(ang) * FL, 30 + Math.sin(ang) * FL, 12];
    W.truss(B, 'grey', fb0, fb1, 2.2, 2.2, 4, 0.16);
    B.add('dark', A.cyl(0.6, 0.8, 3, 10, [fb1[0], fb1[1] + 2.2, fb1[2]]));
    /* grues sur piédestal */
    [[22, 29.6, -18, 2.4], [-14, 37.6, -15, -0.8]].forEach(function (cr) {
      B.add('paintYellow2', A.cyl(1.2, 1.4, 6, 12, [cr[0], cr[1] + 3, cr[2]]));
      B.add('paintYellow2', A.box(3, 2.4, 4, [cr[0], cr[1] + 7, cr[2]]));
      var a = cr[3], end = [cr[0] + Math.cos(a) * 30, cr[1] + 14, cr[2] + Math.sin(a) * 30];
      W.truss(B, 'paintYellow2', [cr[0], cr[1] + 7, cr[2]], end, 1.4, 1.3, 3.4, 0.1);
    });
    /* canots de sauvetage */
    for (i = 0; i < 3; i++) B.add('orange', A.rbox(2.6, 2.4, 7, 1.1, 2, [-12 + i * 9, 24, -22.2], [0, Math.PI / 2, 0]));
    for (i = 0; i < 10; i++) B.add('lampW', A.box(0.5, 0.35, 0.35, [-24 + i * 5.3, 31.5, 21.5]));
    var built = B.build({ dirt: [-6, 8, 0.25], seed: 91 });
    g.add(built); g.add(heli);
    var lights = [];
    for (i = 0; i < 14; i++) lights.push({ p: [-26 + (i % 7) * 8.5, i < 7 ? 32 : 24, i < 7 ? 21.8 : -21.8], c: [1, 0.86, 0.6], s: 1.6, st: 5.2 + i * 0.02, pool: 0 });
    for (i = 0; i < 8; i++) lights.push({ p: [-26 + i * 7, 40.5, -17.6], c: [1, 0.86, 0.6], s: 1.3, st: 5.3 });
    lights.push({ p: [dx0, dy0 + dh + 3.4, dz0], c: [1, 0.12, 0.08], s: 2.2, st: 5.0, blink: 0.9 });
    lights.push({ p: [dx0, dy0 + dh * 0.5, dz0 + 3.4], c: [1, 0.12, 0.08], s: 1.6, st: 5.0, blink: 0.9, ph: 0.5 });
    lights.push({ p: [-31, 56.6, 12.8], c: [0.25, 1, 0.35], s: 1.0, st: 5.2 });
    lights.push({ p: [-31, 56.6, -12.8], c: [0.25, 1, 0.35], s: 1.0, st: 5.2 });
    return { g: g, flareTip: [fb1[0], fb1[1] + 3.8, fb1[2]], lights: lights };
  };
})(window);
