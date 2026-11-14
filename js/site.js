/* =====================================================================
   Groupe AOS — interface de la page
   Introduction, en-tête, défilement → récit 3D (window.AOS3D),
   cartes d'activités, rail de la chaîne de valeur, illumination finale.
   ===================================================================== */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement, win = window;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ------------------------------------------------------------------ */
  /* Introduction                                                         */
  /* ------------------------------------------------------------------ */
  var intro = $('#intro'), bar = $('#introBar'), t0 = performance.now(), introDone = false;
  function endIntro() {
    if (introDone) return;
    introDone = true;
    var wait = Math.max(0, 1500 - (performance.now() - t0));
    setTimeout(function () { intro.classList.add('is-done'); doc.body.classList.add('is-ready'); }, wait);
  }
  setTimeout(endIntro, 9500);

  /* ------------------------------------------------------------------ */
  /* 3D                                                                   */
  /* ------------------------------------------------------------------ */
  var api = win.AOS3D, has3D = false;
  function webglOK() {
    try { var c = doc.createElement('canvas'); return !!(win.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  if (!win.THREE || !api || api.unsupported || !api.init || !webglOK() || /[?&]no3d/.test(win.location.search)) {
    html.classList.add('no-3d');
    endIntro();
  } else {
    has3D = true;
    api.init($('#world'), { onProgress: function (p) { if (bar) bar.style.width = Math.round(p * 100) + '%'; } })
      .then(function () { update(true); endIntro(); })
      .catch(function (err) {
        if (win.console) console.error('Scène 3D indisponible :', err);
        has3D = false; html.classList.add('no-3d'); endIntro();
      });
  }

  /* ------------------------------------------------------------------ */
  /* Défilement → avancée du récit (0 = accueil, 1..5 = activités,          */
  /* 6 → 7 = la nuit tombe et la chaîne s'illumine)                        */
  /* ------------------------------------------------------------------ */
  var header = $('#header'), hero = $('.hero'), heroContent = $('.hero__content'), heroBottom = $('.hero__bottom');
  var actsIntro = $('#actsIntro'), chapters = $$('.chapter'), future = $('#avenir'), words = $$('.future__title .w');
  var rail = $('#rail'), railLight = $('#railLight'), railItems = $$('#rail li'), contact = $('#contact');
  var shadeHero = $('#shadeHero'), shadeStory = $('#shadeStory'), shadeFuture = $('#shadeFuture');
  var anchors = [], contactTop = 1e9, lastS = -1, ticking = false;

  function docTop(el) { var r = el.getBoundingClientRect(); return r.top + win.pageYOffset; }
  function computeAnchors() {
    var vh = win.innerHeight;
    anchors = [{ y: 0, s: 0 }];
    anchors.push({ y: docTop(actsIntro) + actsIntro.offsetHeight / 2 - vh / 2, s: 0.55 });
    chapters.forEach(function (ch) { anchors.push({ y: docTop(ch) + ch.offsetHeight / 2 - vh / 2, s: +ch.getAttribute('data-station') }); });
    var ft = docTop(future);
    anchors.push({ y: ft, s: 6 });
    anchors.push({ y: ft + future.offsetHeight - vh, s: 7 });
    for (var i = 1; i < anchors.length; i++) if (anchors[i].y <= anchors[i - 1].y) anchors[i].y = anchors[i - 1].y + 1;
    contactTop = docTop(contact);
  }
  function storyAt(y) {
    if (y <= anchors[0].y) return anchors[0].s;
    for (var i = 0; i < anchors.length - 1; i++) {
      var a = anchors[i], b = anchors[i + 1];
      if (y <= b.y) return a.s + (b.s - a.s) * (y - a.y) / (b.y - a.y);
    }
    return anchors[anchors.length - 1].s;
  }
  function scrollForStory(s) {
    for (var i = 0; i < anchors.length - 1; i++) {
      var a = anchors[i], b = anchors[i + 1];
      if (s <= b.s) return a.y + (b.y - a.y) * (s - a.s) / ((b.s - a.s) || 1);
    }
    return anchors[anchors.length - 1].y;
  }

  function update(force) {
    ticking = false;
    var y = win.pageYOffset, vh = win.innerHeight;
    var s = storyAt(y);
    header.classList.toggle('is-solid', y > 30);
    /* éléments qui dépendent de la position même quand le récit est terminé (zone contact) */
    rail.classList.toggle('is-on', s > 0.72 && y + vh * 0.55 < contactTop);
    if (has3D && api.ready) api.setActive(!doc.hidden && y + 2 < contactTop);
    if (!force && Math.abs(s - lastS) < 0.0005) return;
    lastS = s;
    if (has3D && api.ready) api.setStory(s);
    html.classList.toggle('is-night', s > 6.1);
    /* accueil */
    var hk = clamp(s * 2.4, 0, 1);
    heroContent.style.opacity = String(1 - hk);
    heroContent.style.transform = 'translateY(' + (-hk * 40).toFixed(1) + 'px)';
    heroBottom.style.opacity = String(1 - clamp(s * 4, 0, 1));
    shadeHero.style.opacity = String(1 - clamp(s * 1.8, 0, 1));
    shadeStory.style.opacity = String(clamp((s - 0.25) * 3, 0, 1) * (1 - clamp((s - 5.55) * 3, 0, 1)));
    shadeFuture.style.opacity = String(clamp((s - 5.9) * 3, 0, 1));
    /* introduction des activités */
    actsIntro.classList.toggle('is-in', s > 0.22 && s < 0.9);
    /* chapitres */
    var k = Math.round(s);
    chapters.forEach(function (ch) {
      var st = +ch.getAttribute('data-station');
      ch.classList.toggle('is-active', st === k && Math.abs(s - k) < 0.36);
    });
    /* rail de la chaîne de valeur */
    var p = clamp((s - 1) / 5, 0, 1);
    railLight.style.width = (p * 100).toFixed(2) + '%';
    var cur = 0;
    railItems.forEach(function (li) { var i = +li.getAttribute('data-i'); var lit = s >= i - 0.3; li.classList.toggle('is-lit', lit); if (lit) cur = i; });
    railItems.forEach(function (li) { li.classList.toggle('is-current', +li.getAttribute('data-i') === cur); });
    /* illumination finale, mot après mot */
    future.classList.toggle('is-lit', s > 6.02);
    future.classList.toggle('is-done', s > 6.78);
    words.forEach(function (w, i) { w.classList.toggle('is-lit', s > 6.06 + i * 0.075); });
  }
  function onScroll() { if (!ticking) { ticking = true; win.requestAnimationFrame(function () { update(false); }); } }

  computeAnchors();
  update(true);
  win.AOSPage = { scrollForStory: scrollForStory, anchors: function () { return anchors; } };
  win.addEventListener('scroll', onScroll, { passive: true });
  var rt = 0;
  win.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { computeAnchors(); update(true); }, 120); });
  win.addEventListener('load', function () { computeAnchors(); update(true); });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { computeAnchors(); update(true); });
  doc.addEventListener('visibilitychange', function () { if (has3D && api.ready) api.setActive(!doc.hidden && win.pageYOffset + 2 < contactTop); });

  /* rail : aller exactement à la station correspondante */
  railItems.forEach(function (li) {
    var a = $('a', li);
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var i = +li.getAttribute('data-i'), target = i === 6 ? scrollForStory(6.85) : scrollForStory(i);
      win.scrollTo({ top: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Accueil : points de vue + rotation à la souris / au doigt             */
  /* ------------------------------------------------------------------ */
  var cams = $$('#cams [data-cam]'), dragHint = $('#dragHint');
  cams.forEach(function (b) {
    b.addEventListener('click', function () {
      var mode = b.getAttribute('data-cam');
      cams.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      if (dragHint) dragHint.style.visibility = mode === 'orbit' ? 'visible' : 'hidden';
      if (has3D && api.ready) api.setHeroMode(mode);
    });
  });
  var dragging = false, lx = 0, ly = 0;
  hero.addEventListener('pointerdown', function (e) {
    if (!has3D || e.target.closest('a, button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true; lx = e.clientX; ly = e.clientY;
    try { hero.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    hero.classList.add('is-dragging');
  });
  hero.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    if (api && api.ready) {
      var activeCam = $('#cams [aria-pressed="true"]');
      if (activeCam && activeCam.getAttribute('data-cam') !== 'orbit') { activeCam.setAttribute('aria-pressed', 'false'); cams[0].setAttribute('aria-pressed', 'true'); api.setHeroMode('orbit'); }
      api.drag(dx, e.pointerType === 'touch' ? 0 : dy);
    }
  });
  function endDrag() { dragging = false; hero.classList.remove('is-dragging'); }
  hero.addEventListener('pointerup', endDrag);
  hero.addEventListener('pointercancel', endDrag);
  hero.addEventListener('lostpointercapture', endDrag);
})();
