/**
 * HTML-страница карты: Leaflet + тайлы OpenStreetMap (приглушены фильтром под палитру BULO).
 * Живёт внутри WebView (iOS/Android) или iframe (веб) и общается с приложением сообщениями:
 *   приложение → карта: window.__bulo({ type, ... })
 *   карта → приложение: ReactNativeWebView.postMessage / parent.postMessage (JSON-строка).
 * Страница грузится один раз, дальше меняются только слои — без перезагрузки.
 */
export const MAP_HTML = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&display=swap" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #EFE9DA; overflow: hidden; }
  * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
  .leaflet-container { background: #EFE9DA; font-family: Manrope, system-ui, sans-serif; }
  .leaflet-control-attribution { background: rgba(249,245,230,.78) !important; color: rgba(38,66,43,.7); font: 600 9px/1.3 Manrope, system-ui, sans-serif; padding: 1px 6px !important; border-radius: 8px 0 0 0; }
  .leaflet-control-attribution a { color: inherit; text-decoration: none; }
  .leaflet-div-icon { background: none; border: none; }
  /* тёплая, приглушённая подложка в тон бренду — маршрут и пины читаются лучше */
  .leaflet-tile-pane { filter: saturate(0.55) sepia(0.18) brightness(1.03) contrast(0.95); }

  .pin { position: absolute; left: 0; top: 0; width: 36px; height: 36px; border-radius: 50% 50% 50% 6px; transform: rotate(-45deg);
         background: #E94F15; border: 3px solid #fff; box-shadow: 0 6px 14px rgba(90,59,30,.32); display: flex; align-items: center; justify-content: center; }
  .pin > * { transform: rotate(45deg); }
  .pin b { color: #fff; font: 800 15px/1 Manrope, system-ui, sans-serif; }
  .pin.dim { background: #fff; border-color: #E94F15; width: 30px; height: 30px; left: 3px; top: 6px; }
  .pin.dim b { color: #26422B; font-size: 13px; }
  .pin.active { width: 44px; height: 44px; left: -4px; top: -9px; }
  .pin.active b { font-size: 18px; }
  .pin.bakery { background: #70171F; }
  .pin.dest { background: #E94F15; }
  .pin svg { width: 18px; height: 18px; }
  .pin.active svg { width: 22px; height: 22px; }
  .shadow { position: absolute; left: 10px; top: 40px; width: 16px; height: 6px; border-radius: 50%; background: rgba(38,66,43,.25); filter: blur(1px); }

  .courier { position: absolute; left: 0; top: 0; width: 44px; height: 44px; }
  .courier .halo { position: absolute; inset: 0; border-radius: 50%; background: rgba(233,79,21,.22); animation: halo 1.8s ease-out infinite; }
  .courier .dot { position: absolute; left: 6px; top: 6px; width: 32px; height: 32px; border-radius: 50%; background: #26422B; border: 3px solid #fff;
                  box-shadow: 0 4px 12px rgba(38,66,43,.4); display: flex; align-items: center; justify-content: center; transition: transform .6s ease; }
  .courier .dot svg { width: 16px; height: 16px; }
  @keyframes halo { 0% { transform: scale(.6); opacity: .9 } 100% { transform: scale(1.6); opacity: 0 } }

  .me { width: 18px; height: 18px; border-radius: 50%; background: #004B97; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,75,151,.45); }
  #err { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; text-align: center; padding: 24px;
         color: rgba(38,66,43,.7); font: 700 14px/1.4 Manrope, system-ui, sans-serif; }
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
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onerror="__fail()"></script>
<script>
(function () {
  if (!window.L) { __fail(); return; }
  var ICONS = {
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v9h16v-9M3 6l2-3h14l2 3v1.5a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.5 19.5 20 12 16l-7.5 4z"/></svg>'
  };

  var map = L.map('map', { zoomControl: false, attributionControl: true, zoomSnap: 0.25, fadeAnimation: true, inertia: true })
    .setView([42.8746, 74.5698], 13);
  map.attributionControl.setPrefix(false);

  // Тайлы OpenStreetMap. Для продакшена с большим трафиком — свой тайл-сервер или платный провайдер
  // (условия tile.openstreetmap.org не рассчитаны на коммерческую нагрузку): поменять URL здесь.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: false
  }).addTo(map);

  var pad = { top: 80, bottom: 80, left: 40, right: 40 };
  var layers = {};
  var routeCasing = null, routeLine = null, routeKey = '';
  var courier = null, courierAngle = 0, anim = 0, lastCourier = null;
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
    var c = map.getCenter();
    __send({ type: 'moveEnd', lat: c.lat, lng: c.lng, zoom: map.getZoom() });
  });

  function pinHtml(cls, inner) { return '<div class="shadow"></div><div class="pin ' + cls + '">' + inner + '</div>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function iconFor(m) {
    var html;
    if (m.kind === 'bakery') html = pinHtml('bakery' + (m.active ? ' active' : ''), ICONS.shop);
    else if (m.kind === 'dest') html = pinHtml('dest active', ICONS.home);
    else if (m.kind === 'me') return L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    else html = pinHtml(m.active ? 'active' : 'dim', '<b>' + esc(m.label) + '</b>');
    return L.divIcon({ className: '', html: html, iconSize: [36, 36], iconAnchor: [18, 42] });
  }

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
    var opts = { paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom], maxZoom: 16, animate: animate !== false };
    if (pts.length === 1) { centerOn(pts[0], 15.5, animate); return; }
    map.fitBounds(L.latLngBounds(pts), opts);
  }

  /** Центр с поправкой на шторку: точка оказывается посередине видимой части. */
  function centerOn(ll, zoom, animate) {
    var z = zoom == null ? map.getZoom() : zoom;
    var p = map.project(ll, z).add([(pad.right - pad.left) / 2, (pad.bottom - pad.top) / 2]);
    map.setView(map.unproject(p, z), z, { animate: animate !== false });
  }

  function setRoute(route, byRoads) {
    var key = route && route.length > 1 ? route.length + ':' + route[0] + ':' + route[route.length - 1] + ':' + byRoads : '';
    if (key === routeKey) return;
    routeKey = key;
    if (!key) {
      if (routeLine) { map.removeLayer(routeLine); map.removeLayer(routeCasing); routeLine = routeCasing = null; }
      return;
    }
    if (!routeLine) {
      routeCasing = L.polyline(route, { color: '#ffffff', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      routeLine = L.polyline(route, { color: '#E94F15', weight: 5.5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
    } else {
      routeCasing.setLatLngs(route);
      routeLine.setLatLngs(route);
    }
    routeLine.setStyle({ dashArray: byRoads ? null : '1 11', weight: byRoads ? 5.5 : 6 });
    routeCasing.setStyle({ opacity: byRoads ? 0.95 : 0 });
    if (courier) courier.setZIndexOffset(1000);
  }

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
      var mk = L.marker([m.lat, m.lng], { icon: iconFor(m), zIndexOffset: m.active ? 600 : m.kind === 'bakery' ? 100 : 0, keyboard: false, interactive: m.kind !== 'me' });
      mk.on('click', function () { __send({ type: 'marker', id: m.id }); });
      mk.addTo(map);
      layers[m.id] = { m: mk, key: key };
    });
    Object.keys(layers).forEach(function (k) { if (!seen[k]) { map.removeLayer(layers[k].m); delete layers[k]; } });
    setRoute(s.route, s.byRoads);
    if (s.fit && !userMoved && !follow) fit(fitPending);
    fitPending = true;
  }

  function bearing(a, b) {
    var toR = Math.PI / 180, y = Math.sin((b.lng - a.lng) * toR) * Math.cos(b.lat * toR);
    var x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lng - a.lng) * toR);
    return (Math.atan2(y, x) / toR + 360) % 360;
  }

  function setHeading(deg) {
    if (deg == null || isNaN(deg) || !courier) return;
    // кратчайший поворот: 350° → 10° крутим на +20°, а не на −340°
    var d = ((deg - courierAngle) % 360 + 540) % 360 - 180;
    courierAngle += d;
    var dot = courier.getElement() && courier.getElement().querySelector('.dot');
    if (dot) dot.style.transform = 'rotate(' + courierAngle + 'deg)';
  }

  function courierTo(c) {
    if (!c) {
      if (courier) { map.removeLayer(courier); courier = null; }
      lastCourier = null;
      return;
    }
    var to = L.latLng(c.lat, c.lng);
    if (!courier) {
      courier = L.marker(to, {
        icon: L.divIcon({ className: '', html: '<div class="courier"><div class="halo"></div><div class="dot">' + ICONS.arrow + '</div></div>', iconSize: [44, 44], iconAnchor: [22, 22] }),
        zIndexOffset: 1000, interactive: false, keyboard: false
      }).addTo(map);
      setHeading(c.heading == null ? 0 : c.heading);
      if (follow && !userMoved) centerOn(to, Math.max(map.getZoom(), 16), false);
      else if (autoFit && !userMoved) fit(false);
      lastCourier = to;
      return;
    }
    var from = courier.getLatLng();
    var dist = from.distanceTo(to);
    var h = c.heading != null && !isNaN(c.heading) ? c.heading : dist > 4 ? bearing(from, to) : null;
    setHeading(h);
    cancelAnimationFrame(anim);
    // скачок больше 2 км — не «летим» через полгорода, а переставляем
    if (dist > 2000) { courier.setLatLng(to); if (follow && !userMoved) centerOn(to, null, false); return; }
    var dur = Math.max(300, Math.min(c.ms || 1000, 12000)), t0 = performance.now();
    // экран получателя: курьер и адрес всегда в кадре
    if (keepInView && !follow && !userMoved) {
      var b = map.getBounds().pad(-0.12);
      if (!b.contains(to)) fit(true, to);
    }
    function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var p = L.latLng(from.lat + (to.lat - from.lat) * k, from.lng + (to.lng - from.lng) * k);
      courier.setLatLng(p);
      if (follow && !userMoved) centerOn(p, null, false);
      if (k < 1) anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
    lastCourier = to;
  }

  function handle(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'scene': scene(m); break;
      case 'courier': courierTo(m.courier); break;
      case 'fit': userMoved = false; follow = false; fit(true); break;
      case 'follow':
        follow = !!m.on; userMoved = false;
        if (follow && courier) centerOn(courier.getLatLng(), Math.max(map.getZoom(), 16), true);
        else if (!follow) fit(true);
        break;
      case 'view': picker = !!m.picker; map.setView([m.lat, m.lng], m.zoom || map.getZoom(), { animate: !!m.animate }); break;
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
