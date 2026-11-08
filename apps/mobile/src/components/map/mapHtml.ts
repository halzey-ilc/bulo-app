/**
 * HTML-страница карты: Leaflet + тайлы OpenStreetMap (приглушены фильтром под палитру BULO).
 * Живёт внутри WebView (iOS/Android) или iframe (веб) и общается с приложением сообщениями:
 *   приложение → карта: window.__bulo({ type, ... })
 *   карта → приложение: ReactNativeWebView.postMessage / parent.postMessage (JSON-строка).
 * Страница грузится один раз, дальше меняются только слои — без перезагрузки.
 *
 * Движение как в приложениях доставки: курьер едет по линии маршрута (а не напрямик между
 * точками GPS), плавно поворачивается по ходу, пройденная часть маршрута «съедается»,
 * новый маршрут прорисовывается, пины падают на карту с отскоком.
 */
import { LEAFLET_CSS, LEAFLET_JS } from './leafletBundle';

export const MAP_HTML = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="preconnect" href="https://tile.openstreetmap.org" crossorigin />
<style>${LEAFLET_CSS}</style>
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #EFE9DA; overflow: hidden; }
  * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
  .leaflet-container { background: #EFE9DA; font-family: system-ui, sans-serif; }
  .leaflet-control-attribution { background: rgba(249,245,230,.78) !important; color: rgba(38,66,43,.7); font: 600 9px/1.3 system-ui, sans-serif; padding: 1px 6px !important; border-radius: 8px 0 0 0; }
  .leaflet-control-attribution a { color: inherit; text-decoration: none; }
  .leaflet-div-icon { background: none; border: none; }
  /* тёплая, приглушённая подложка в тон бренду — маршрут и пины читаются лучше */
  .leaflet-tile-pane { filter: saturate(0.5) sepia(0.16) brightness(1.04) contrast(0.94); }
  .leaflet-tile { transition: opacity .35s ease; }
  .route-glow { filter: blur(3px); }

  /* пины: обёртка .mk падает сверху с отскоком, сам пин — «капля» */
  .mk { position: absolute; left: 0; top: 0; width: 36px; height: 48px; transform-origin: 18px 42px; animation: drop .5s cubic-bezier(.3,1.6,.6,1) both; }
  .mk.swap { animation: pop .35s cubic-bezier(.3,1.6,.6,1) both; }
  @keyframes drop { 0% { transform: translateY(-36px) scale(.7); opacity: 0 } 60% { opacity: 1 } 100% { transform: none; opacity: 1 } }
  @keyframes pop { 0% { transform: scale(.75) } 100% { transform: none } }
  .pin { position: absolute; left: 0; top: 0; width: 36px; height: 36px; border-radius: 50% 50% 50% 6px; transform: rotate(-45deg);
         background: #E94F15; border: 3px solid #fff; box-shadow: 0 6px 14px rgba(90,59,30,.32); display: flex; align-items: center; justify-content: center; }
  .pin > * { transform: rotate(45deg); }
  .pin b { color: #fff; font: 800 15px/1 system-ui, sans-serif; }
  .pin.dim { background: #fff; border-color: #E94F15; width: 30px; height: 30px; left: 3px; top: 6px; }
  .pin.dim b { color: #26422B; font-size: 13px; }
  .pin.active { width: 44px; height: 44px; left: -4px; top: -9px; }
  .pin.active b { font-size: 18px; }
  .pin.bakery { background: #70171F; }
  .pin.dest { background: #E94F15; }
  .pin svg { width: 18px; height: 18px; }
  .pin.active svg { width: 22px; height: 22px; }
  .shadow { position: absolute; left: 10px; top: 40px; width: 16px; height: 6px; border-radius: 50%; background: rgba(38,66,43,.25); filter: blur(1px); }
  /* «маячок» под адресом получателя */
  .ring { position: absolute; left: 4px; top: 36px; width: 28px; height: 12px; border-radius: 50%; border: 2px solid rgba(233,79,21,.6); animation: ring 2s ease-out infinite; }
  @keyframes ring { 0% { transform: scale(.4); opacity: 1 } 100% { transform: scale(2.4); opacity: 0 } }

  /* курьер: стрелка-навигатор в круге, мягкий ореол и подпись «4 мин» */
  .courier { position: absolute; left: 0; top: 0; width: 56px; height: 56px; }
  .courier .halo { position: absolute; left: 6px; top: 6px; width: 44px; height: 44px; border-radius: 50%; background: rgba(233,79,21,.25); animation: halo 2s ease-out infinite; }
  .courier .body { position: absolute; left: 10px; top: 10px; width: 36px; height: 36px; border-radius: 50%; background: #fff;
                   box-shadow: 0 6px 16px rgba(38,66,43,.35), 0 0 0 1px rgba(38,66,43,.06); display: flex; align-items: center; justify-content: center; will-change: transform; }
  .courier .body svg { width: 22px; height: 22px; }
  .courier .lbl { position: absolute; left: 50%; bottom: 52px; transform: translateX(-50%) scale(.6); opacity: 0; white-space: nowrap; background: #26422B; color: #F9F5E6;
                  font: 800 13px/1 system-ui, sans-serif; padding: 7px 10px; border-radius: 12px; box-shadow: 0 6px 14px rgba(38,66,43,.3);
                  transition: transform .35s cubic-bezier(.3,1.6,.6,1), opacity .25s ease; }
  .courier .lbl:after { content: ''; position: absolute; left: 50%; bottom: -5px; margin-left: -5px; border: 5px solid transparent; border-bottom: 0; border-top-color: #26422B; }
  .courier .lbl.on { transform: translateX(-50%) scale(1); opacity: 1; }
  .courier.appear { animation: pop .45s cubic-bezier(.3,1.6,.6,1) both; }
  @keyframes halo { 0% { transform: scale(.55); opacity: .9 } 100% { transform: scale(1.7); opacity: 0 } }

  .me { width: 18px; height: 18px; border-radius: 50%; background: #004B97; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,75,151,.45); }
  #err { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; text-align: center; padding: 24px;
         color: rgba(38,66,43,.7); font: 700 14px/1.4 system-ui, sans-serif; }
</style>
</head><body>
<div id="map"></div>
<div id="err">Карта не загрузилась.<br/>Проверьте интернет</div>
<script>
  function __send(m) {
    var s = JSON.stringify(m);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage(s, '*');
  }
  function __fail() { document.getElementById('err').style.display = 'flex'; __send({ type: 'error' }); }
</script>
<script>${LEAFLET_JS}</script>
<script>
(function () {
  if (!window.L) { __fail(); return; }
  var ICONS = {
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v9h16v-9M3 6l2-3h14l2 3v1.5a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M12 2.2 19.6 20.4 12 16.3 4.4 20.4z" fill="#E94F15" stroke="#E94F15" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  };
  // проекция для геометрии маршрута: пиксели на фиксированном масштабе, не зависят от текущего зума
  var Z = 17;

  var map = L.map('map', { zoomControl: false, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
                           fadeAnimation: true, zoomAnimation: true, markerZoomAnimation: true, inertia: true, inertiaDeceleration: 2600 })
    .setView([42.8746, 74.5698], 13);
  map.attributionControl.setPrefix(false);

  // Тайлы OpenStreetMap. Для продакшена с большим трафиком — свой тайл-сервер или платный провайдер
  // (условия tile.openstreetmap.org не рассчитаны на коммерческую нагрузку): поменять URL здесь.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: false, keepBuffer: 6, updateWhenZooming: false, updateWhenIdle: false
  }).addTo(map);

  var pad = { top: 80, bottom: 80, left: 40, right: 40 };
  var layers = {};
  var routeGlow = null, routeCasing = null, routeLine = null, routeKey = '', routeEnd = '';
  var routePts = [], prevRoutePts = [], routeHint = 0, drawing = false, byRoadsNow = true;
  var courier = null, courierPos = null, courierAngle = 0, targetAngle = 0, anim = 0;
  var follow = false, userMoved = false, picker = false, fitPending = false, keepInView = false, autoFit = false;

  function markUser() {
    if (!userMoved) { userMoved = true; __send({ type: 'userMove' }); }
  }
  var el = map.getContainer();
  el.addEventListener('touchstart', markUser, { passive: true });
  el.addEventListener('mousedown', markUser);
  el.addEventListener('wheel', markUser, { passive: true });

  map.on('movestart', function () { if (picker) __send({ type: 'moveStart' }); });
  map.on('moveend', function () {
    // в навигации камера двигается каждый кадр — не засыпаем приложение сообщениями
    if (!picker) return;
    var c = map.getCenter();
    __send({ type: 'moveEnd', lat: c.lat, lng: c.lng, zoom: map.getZoom() });
  });

  /* ───────── Пины ───────── */

  function pinHtml(cls, inner, extra, swap) {
    return '<div class="mk' + (swap ? ' swap' : '') + '">' + (extra || '') + '<div class="shadow"></div><div class="pin ' + cls + '">' + inner + '</div></div>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function iconFor(m, swap) {
    var html;
    if (m.kind === 'bakery') html = pinHtml('bakery' + (m.active ? ' active' : ''), ICONS.shop, '', swap);
    else if (m.kind === 'dest') html = pinHtml('dest active', ICONS.home, '<div class="ring"></div>', swap);
    else if (m.kind === 'me') return L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    else html = pinHtml(m.active ? 'active' : 'dim', '<b>' + esc(m.label) + '</b>', '', swap);
    return L.divIcon({ className: '', html: html, iconSize: [36, 36], iconAnchor: [18, 42] });
  }

  /* ───────── Камера ───────── */

  function allPoints(courierAt) {
    var pts = [];
    Object.keys(layers).forEach(function (k) { pts.push(layers[k].m.getLatLng()); });
    if (courierAt) pts.push(courierAt);
    else if (courier) pts.push(courier.getLatLng());
    // маршрут тоже должен целиком помещаться
    if (routeLine) { var r = routeLine.getLatLngs(), step = Math.max(1, Math.floor(r.length / 40)); for (var i = 0; i < r.length; i += step) pts.push(r[i]); if (r.length) pts.push(r[r.length - 1]); }
    return pts;
  }

  function fit(animate, courierAt) {
    var pts = allPoints(courierAt);
    if (!pts.length) return;
    if (pts.length === 1) { centerOn(pts[0], 15.5, animate); return; }
    var b = L.latLngBounds(pts);
    var opts = { paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom], maxZoom: 16.5 };
    if (animate === false) { opts.animate = false; map.fitBounds(b, opts); return; }
    // мягкий «перелёт»: небольшие сдвиги — плавной панорамой, большие — с отдалением
    var target = map.getBoundsZoom(b, false, L.point(pad.left + pad.right, pad.top + pad.bottom));
    if (Math.abs(target - map.getZoom()) < 0.6 && map.getBounds().intersects(b)) { opts.animate = true; opts.duration = 0.6; opts.easeLinearity = 0.25; map.fitBounds(b, opts); }
    else { opts.duration = 0.9; opts.easeLinearity = 0.2; map.flyToBounds(b, opts); }
  }

  /**
   * Центр с поправкой на шторку: точка оказывается посередине видимой части.
   * В режиме навигации курьер стоит ниже центра — впереди видно больше дороги (как в навигаторах).
   */
  function centered(ll, z) {
    var p = map.project(ll, z).add([(pad.right - pad.left) / 2, (pad.bottom - pad.top) / 2]);
    if (follow && courier) {
      var size = map.getSize(), visH = Math.max(120, size.y - pad.top - pad.bottom);
      var L = visH * 0.26, a = courierAngle * Math.PI / 180;
      p = p.add([Math.sin(a) * L, -Math.cos(a) * L]);
    }
    return map.unproject(p, z);
  }
  function centerOn(ll, zoom, animate) {
    var z = zoom == null ? map.getZoom() : zoom;
    if (animate === false) { map.setView(centered(ll, z), z, { animate: false }); return; }
    map.flyTo(centered(ll, z), z, { duration: 0.8, easeLinearity: 0.2 });
  }

  /* ───────── Маршрут ───────── */

  function project(route) { return route.map(function (p) { return map.project(L.latLng(p[0], p[1]), Z); }); }
  function unproj(p) { return map.unproject(p, Z); }

  /** Ближайшая к P точка на ломаной pts: индекс сегмента, сама точка и расстояние (px на Z). */
  function nearest(pts, P, from, to) {
    var best = null;
    from = Math.max(0, from || 0); to = Math.min(pts.length - 1, to == null ? pts.length - 1 : to);
    for (var i = from; i < to; i++) {
      var q = L.LineUtil.closestPointOnSegment(P, pts[i], pts[i + 1]), d = q.distanceTo(P);
      if (!best || d < best.d) best = { i: i, p: q, d: d };
    }
    return best;
  }

  /** Прорисовка нового маршрута «от курьера к адресу». */
  function drawIn() {
    var path = routeLine && routeLine._path;
    if (!path || !path.getTotalLength) return;
    var len = path.getTotalLength();
    if (!len) return;
    drawing = true;
    [routeLine, routeCasing, routeGlow].forEach(function (l) {
      var p = l && l._path; if (!p) return;
      p.style.transition = 'none'; p.style.strokeDasharray = len + ' ' + len; p.style.strokeDashoffset = String(len);
      p.getBoundingClientRect();
      p.style.transition = 'stroke-dashoffset .9s cubic-bezier(.4,0,.2,1)'; p.style.strokeDashoffset = '0';
    });
    setTimeout(function () {
      drawing = false;
      [routeLine, routeCasing, routeGlow].forEach(function (l) { var p = l && l._path; if (p) { p.style.transition = ''; p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; } });
      if (routeLine) routeLine.setStyle({ dashArray: byRoadsNow ? null : '1 11' });
      trim(true);
    }, 950);
  }

  function setRoute(route, byRoads) {
    var has = route && route.length > 1;
    var key = has ? route.length + ':' + route[0] + ':' + route[route.length - 1] + ':' + byRoads : '';
    if (key === routeKey) return;
    routeKey = key;
    byRoadsNow = byRoads !== false;
    prevRoutePts = routePts;
    if (!has) {
      routePts = [];
      if (routeLine) { [routeGlow, routeCasing, routeLine].forEach(function (l) { map.removeLayer(l); }); routeLine = routeCasing = routeGlow = null; }
      routeEnd = '';
      return;
    }
    routePts = project(route);
    routeHint = 0;
    var end = String(route[route.length - 1]), fresh = !routeLine || end !== routeEnd;
    routeEnd = end;
    if (!routeLine) {
      routeGlow = L.polyline(route, { color: '#E94F15', weight: 14, opacity: 0.16, lineCap: 'round', lineJoin: 'round', interactive: false, className: 'route-glow' }).addTo(map);
      routeCasing = L.polyline(route, { color: '#ffffff', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      routeLine = L.polyline(route, { color: '#E94F15', weight: 5.5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
    }
    routeLine.setStyle({ dashArray: byRoadsNow || drawing ? null : '1 11', weight: byRoadsNow ? 5.5 : 6 });
    routeCasing.setStyle({ opacity: byRoadsNow ? 0.95 : 0 });
    routeGlow.setStyle({ opacity: byRoadsNow ? 0.16 : 0 });
    trim(true);
    if (fresh && byRoadsNow) drawIn();
    if (courier) courier.setZIndexOffset(1000);
  }

  /** Отрезать пройденное: линия начинается ровно под курьером. */
  var lastTrim = '';
  function trim(force) {
    if (!routeLine || (drawing && !force)) return;
    var out;
    if (!courierPos || routePts.length < 2) out = routePts;
    else {
      var P = map.project(courierPos, Z);
      var n = nearest(routePts, P, routeHint - 3, routeHint + 60);
      if (!n || n.d > 60) n = nearest(routePts, P);
      // курьер далеко от линии (свернул) — линию не режем, пока сервер не пересчитает
      if (!n || n.d > 120) out = routePts;
      else { routeHint = n.i; out = [n.p].concat(routePts.slice(n.i + 1)); }
    }
    var k = out.length + ':' + (out[0] ? Math.round(out[0].x) + ',' + Math.round(out[0].y) : '');
    if (!force && k === lastTrim) return;
    lastTrim = k;
    var ll = out.map(unproj);
    routeLine.setLatLngs(ll); routeCasing.setLatLngs(ll); routeGlow.setLatLngs(ll);
  }

  /* ───────── Сцена ───────── */

  function scene(s) {
    if (s.padding) pad = s.padding;
    keepInView = !!s.keepInView;
    if (s.fit) autoFit = true;
    var seen = {};
    (s.markers || []).forEach(function (m) {
      seen[m.id] = 1;
      var key = m.kind + '|' + (m.label || '') + '|' + (m.active ? 1 : 0);
      var ex = layers[m.id];
      if (ex && ex.key === key) { ex.m.setLatLng([m.lat, m.lng]); return; }
      if (ex) map.removeLayer(ex.m);
      var mk = L.marker([m.lat, m.lng], { icon: iconFor(m, !!ex), zIndexOffset: m.active ? 600 : m.kind === 'bakery' ? 100 : 0, keyboard: false, interactive: m.kind !== 'me' });
      mk.on('click', function () { __send({ type: 'marker', id: m.id }); });
      mk.addTo(map);
      layers[m.id] = { m: mk, key: key };
    });
    Object.keys(layers).forEach(function (k) { if (!seen[k]) { map.removeLayer(layers[k].m); delete layers[k]; } });
    setRoute(s.route, s.byRoads);
    if (s.fit && !userMoved && !follow) fit(fitPending);
    fitPending = true;
  }

  /* ───────── Курьер ───────── */

  function angleOf(a, b) { return Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI; }
  function shortest(from, to) { return ((to - from) % 360 + 540) % 360 - 180; }
  function applyAngle() {
    var b = courier && courier.getElement() && courier.getElement().querySelector('.body');
    if (b) b.style.transform = 'rotate(' + courierAngle.toFixed(1) + 'deg)';
  }
  function setLabel(text) {
    var l = courier && courier.getElement() && courier.getElement().querySelector('.lbl');
    if (!l) return;
    if (text) l.textContent = text;
    l.classList.toggle('on', !!text);
  }

  /**
   * Путь от точки A до B: если обе лежат на маршруте — по его изгибам (как едет машина),
   * иначе по прямой. Точки — в проекции Z.
   */
  function pathBetween(A, B) {
    var sets = [routePts, prevRoutePts];
    for (var s = 0; s < sets.length; s++) {
      var pts = sets[s];
      if (pts.length < 2) continue;
      var a = nearest(pts, A), b = nearest(pts, B);
      if (!a || !b || a.d > 50 || b.d > 50) continue;
      if (b.i < a.i || (b.i === a.i && a.p.distanceTo(pts[a.i]) > b.p.distanceTo(pts[a.i]))) continue;
      return [A, a.p].concat(pts.slice(a.i + 1, b.i + 1)).concat([b.p, B]);
    }
    return [A, B];
  }

  // плавный поворот: догоняем целевой курс по кратчайшей дуге
  function turn() {
    var d = shortest(courierAngle, targetAngle);
    if (Math.abs(d) <= 0.3) return false;
    courierAngle += d * 0.18;
    applyAngle();
    return true;
  }

  var frame = 0;
  function courierTo(c) {
    if (!c) {
      cancelAnimationFrame(anim);
      if (courier) { map.removeLayer(courier); courier = null; }
      courierPos = null; trim(true);
      return;
    }
    var to = L.latLng(c.lat, c.lng);
    if (!courier) {
      courier = L.marker(to, {
        icon: L.divIcon({ className: '', html: '<div class="courier appear"><div class="halo"></div><div class="body">' + ICONS.arrow + '</div><div class="lbl"></div></div>', iconSize: [56, 56], iconAnchor: [28, 28] }),
        zIndexOffset: 1000, interactive: false, keyboard: false
      }).addTo(map);
      courierPos = to;
      courierAngle = targetAngle = c.heading == null || isNaN(c.heading) ? 0 : c.heading;
      applyAngle();
      setLabel(c.label);
      trim(true);
      if (follow && !userMoved) centerOn(to, Math.max(map.getZoom(), 16), false);
      else if (autoFit && !userMoved) fit(false);
      return;
    }
    setLabel(c.label);
    var from = courier.getLatLng();
    if (from.distanceTo(to) < 0.5) return;
    cancelAnimationFrame(anim);
    // скачок больше 2 км — не «летим» через полгорода, а переставляем
    if (from.distanceTo(to) > 2000) {
      courier.setLatLng(to); courierPos = to; trim(true);
      if (follow && !userMoved) centerOn(to, null, false);
      return;
    }

    var path = pathBetween(map.project(from, Z), map.project(to, Z));
    var cum = [0];
    for (var i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
    var total = cum[cum.length - 1];
    // чуть дольше интервала обновлений — курьер не замирает в ожидании новой точки
    var dur = Math.max(400, Math.min((c.ms || 1000) * 1.08, 15000)), t0 = performance.now(), seg = 1;

    // экран получателя: курьер и адрес всегда в кадре
    if (keepInView && !follow && !userMoved) {
      var vb = map.getBounds().pad(-0.12);
      if (!vb.contains(to)) fit(true, to);
    }

    function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var s = total * k;
      while (seg < path.length - 1 && cum[seg] < s) seg++;
      var a = path[seg - 1], b = path[seg], span = cum[seg] - cum[seg - 1];
      var f = span > 0 ? (s - cum[seg - 1]) / span : 1;
      var ll = unproj(L.point(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f));
      courier.setLatLng(ll);
      courierPos = ll;
      // курс — по участку пути (GPS-курс на месте бывает шумным)
      if (span > 0.6) targetAngle = angleOf(a, b);
      else if (c.heading != null && !isNaN(c.heading)) targetAngle = c.heading;
      turn();
      if ((frame++ & 1) === 0) trim();
      if (follow && !userMoved) map.setView(centered(ll, map.getZoom()), map.getZoom(), { animate: false, noMoveStart: true });
      if (k < 1) anim = requestAnimationFrame(step);
      else { courierPos = to; trim(); anim = requestAnimationFrame(settle); }
    }
    anim = requestAnimationFrame(step);
  }
  // после остановки доворачиваем стрелку до конца (камера в навигации доворачивается вместе с ней)
  function settle() {
    if (turn()) {
      if (follow && !userMoved && courierPos) map.setView(centered(courierPos, map.getZoom()), map.getZoom(), { animate: false, noMoveStart: true });
      anim = requestAnimationFrame(settle);
    }
  }

  function handle(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'scene': scene(m); break;
      case 'courier': courierTo(m.courier); break;
      case 'fit': userMoved = false; follow = false; fit(true); break;
      case 'follow':
        follow = !!m.on; userMoved = false;
        if (follow && courier) centerOn(courier.getLatLng(), 17.25, true);
        else if (!follow) fit(true);
        break;
      case 'view':
        picker = !!m.picker;
        if (m.animate) map.flyTo([m.lat, m.lng], m.zoom || map.getZoom(), { duration: 0.6 });
        else map.setView([m.lat, m.lng], m.zoom || map.getZoom(), { animate: false });
        break;
      case 'padding': pad = m.padding; break;
      case 'invalidate': map.invalidateSize(); break;
    }
  }
  window.__bulo = handle;
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
    if (d && d.__bulo) handle(d.msg);
  });
  __send({ type: 'ready' });
})();
</script>
</body></html>`;
