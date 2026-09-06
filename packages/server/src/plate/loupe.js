/**
 * The loupe — "point at anything and see what it is" (COMMISSION.md §3). Injected by the
 * plate proxy (`proxy.ts`) into every HTML response from the clamped app's own dev server.
 *
 * Plain ES2020, zero dependencies, no build step — this file is served byte-for-byte as a
 * static string (see `proxy.ts`'s `loupeScript()`). It runs inside the TARGET app's page, at
 * the target's own origin, so it must never assume anything about that app's framework
 * beyond the one Angular dev-mode hook it optionally uses.
 *
 * Contract with the bench (postMessage, both ways — target origin is `data-jig-bench` on
 * this script's own <script> tag):
 *   bench -> plate  {type:'jig:survey', selectors:[{selector,name,file}]}
 *   bench -> plate  {type:'jig:mode', mode:'hand'|'loupe'}
 *   bench -> plate  {type:'jig:highlight', paths:[...]}
 *   bench -> plate  {type:'jig:clear'}
 *   plate -> bench  {type:'jig:pick', path, tag, text, component, componentClass, file, rect}
 *   plate -> bench  {type:'jig:event', kind:'click'|'input', path, value}
 *
 * Law I.6 (never a spinner) doesn't apply here directly — but the sibling law it shares in
 * spirit does: this script never modifies the target's own DOM nodes. Every visual it draws
 * (the hover outline, its label, and gauges highlights) is a sibling element it owns.
 */
(function () {
  'use strict';

  // The ONLY hardcoded colour in this file: the house "storm" token (#5fc9e0, live/
  // right-now signals — tokens.css --storm). The loupe runs inside a page that has no
  // access to Jig's own CSS custom properties, so the value is inlined here and documented,
  // rather than silently drifting from the source of truth.
  var STORM_COLOR = '#5fc9e0';

  var currentScript = document.currentScript;
  var benchOrigin = (currentScript && currentScript.getAttribute('data-jig-bench')) || '*';
  var reducedMotion = Boolean(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  var mode = 'hand'; // 'hand' | 'loupe'
  var surveySelectors = []; // [{selector, name, file}]

  // ---- overlay (hover outline + label) -----------------------------------

  var overlay = null;
  var label = null;
  var highlightBoxes = [];

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.setAttribute('data-jig-loupe-overlay', '');
    styleFixedBox(overlay, 2147483647);
    overlay.style.border = '1px solid ' + STORM_COLOR;
    overlay.style.display = 'none';
    if (!reducedMotion) overlay.style.transition = 'left 60ms, top 60ms, width 60ms, height 60ms';

    label = document.createElement('div');
    label.setAttribute('data-jig-loupe-label', '');
    label.style.position = 'fixed';
    label.style.pointerEvents = 'none';
    label.style.zIndex = '2147483647';
    label.style.background = STORM_COLOR;
    label.style.color = '#0a0c0f';
    label.style.font = '10.5px "Cascadia Code", "JetBrains Mono", Consolas, ui-monospace, monospace';
    label.style.padding = '2px 6px';
    label.style.borderRadius = '3px';
    label.style.display = 'none';
    label.style.whiteSpace = 'nowrap';

    document.body.appendChild(overlay);
    document.body.appendChild(label);
  }

  function styleFixedBox(el, zIndex) {
    el.style.position = 'fixed';
    el.style.pointerEvents = 'none';
    el.style.zIndex = String(zIndex);
    el.style.boxSizing = 'border-box';
  }

  function paintOutline(el) {
    ensureOverlay();
    var rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    var described = describeElement(el);
    var parts = [described.tag, described.component, described.file].filter(Boolean);
    label.textContent = parts.join(' · ');
    label.style.display = 'block';
    var top = rect.top - 20;
    label.style.left = rect.left + 'px';
    label.style.top = (top < 0 ? rect.bottom + 4 : top) + 'px';
  }

  function clearOutline() {
    if (overlay) overlay.style.display = 'none';
    if (label) label.style.display = 'none';
  }

  function clearHighlights() {
    for (var i = 0; i < highlightBoxes.length; i++) {
      var box = highlightBoxes[i];
      if (box.parentNode) box.parentNode.removeChild(box);
    }
    highlightBoxes = [];
  }

  function paintHighlights(paths) {
    clearHighlights();
    for (var i = 0; i < paths.length; i++) {
      var el = resolveDomPath(paths[i]);
      if (!el) continue;
      var rect = el.getBoundingClientRect();
      var box = document.createElement('div');
      box.setAttribute('data-jig-loupe-highlight', '');
      styleFixedBox(box, 2147483646);
      box.style.border = '1px solid ' + STORM_COLOR;
      box.style.left = rect.left + 'px';
      box.style.top = rect.top + 'px';
      box.style.width = rect.width + 'px';
      box.style.height = rect.height + 'px';
      document.body.appendChild(box);
      highlightBoxes.push(box);
    }
  }

  /* ==== S4 extension (jigbench#1 CHASSIS.md/Gauges panel) — begin delimited block ==========
     Two additions to the postMessage contract documented at the top of this file:
       bench -> plate  {type:'jig:highlight', selectors:[...]}   (paths still works, unchanged)
       bench -> plate  {type:'jig:navigate', path:'...'}
     Both are wired into the existing `window.addEventListener('message', ...)` dispatcher
     below with the smallest possible touch to that function (one branch extended, one added)
     — everything else the two features need lives in this one block. ==================== */

  /** Gauges-panel two-way lighting: "clicking a gauge lights the components whose style
   * files use it" (S4 brief) — the bench resolves the survey's component selectors for a
   * gauge's usages and posts them here, and every match on the page gets the same dashed
   * storm outline `paintHighlights` draws for a DOM-path highlight. Duplicates that
   * function's small box-painting instead of sharing it, so this block stays self-contained. */
  function paintHighlightsBySelectors(selectors) {
    clearHighlights();
    for (var i = 0; i < selectors.length; i++) {
      var matches;
      try {
        matches = document.querySelectorAll(selectors[i]);
      } catch (err) {
        continue; // a selector the survey emitted that isn't valid CSS — skip it, never throw
      }
      for (var j = 0; j < matches.length; j++) {
        var el = matches[j];
        var rect = el.getBoundingClientRect();
        var box = document.createElement('div');
        box.setAttribute('data-jig-loupe-highlight', '');
        styleFixedBox(box, 2147483646);
        box.style.border = '1px solid ' + STORM_COLOR;
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.width = rect.width + 'px';
        box.style.height = rect.height + 'px';
        document.body.appendChild(box);
        highlightBoxes.push(box);
      }
    }
  }

  /** The command palette's "routes" items navigate the plate (F1/S4 brief: "post a
   * jig:navigate {path} message ... location.assign(path) within the same origin"). Resolved
   * as a pure function so it can be unit-tested without touching the real `location` (jsdom's
   * `Location.prototype.assign` is neither writable nor configurable, unlike a real browser's)
   * — returns the absolute same-origin URL to navigate to, or null when `path` would leave the
   * target's own origin (or fails to parse at all), in which case nothing happens. */
  function resolveNavigateUrl(path) {
    try {
      var target = new URL(path, window.location.href);
      if (target.origin !== window.location.origin) return null;
      return target.href;
    } catch (err) {
      return null;
    }
  }

  function navigateSameOrigin(path) {
    var url = resolveNavigateUrl(path);
    if (url) window.location.assign(url);
  }

  /* ==== S4 extension — end delimited block ================================================ */

  // ---- DOM path: tag:nth-of-type chain, stable across reloads -----------

  function buildDomPath(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var tag = node.tagName.toLowerCase();
      var index = 1;
      var sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === node.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function resolveDomPath(path) {
    try {
      return document.querySelector(path);
    } catch (err) {
      return null;
    }
  }

  // ---- component resolution ------------------------------------------------

  /** Angular dev mode exposes these as console globals (Angular 9-20): DOM element -> live
   * component instance. Not guaranteed across versions, so every call is guarded. */
  function angularComponentName(el) {
    var ng = window.ng;
    if (!ng) return null;
    try {
      var instance =
        (ng.getComponent && ng.getComponent(el)) ||
        (ng.getOwningComponent && ng.getOwningComponent(el));
      if (instance && instance.constructor && instance.constructor.name) {
        return instance.constructor.name;
      }
    } catch (err) {
      // Dev-mode globals shift between Angular versions — degrade quietly, never throw from
      // a hover/click handler.
    }
    return null;
  }

  /** Walks up from `el` and returns the nearest ancestor whose tag name (or, defensively,
   * whose `.matches()`) is named in the survey's component list. */
  function surveyedMatch(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      var tag = node.tagName.toLowerCase();
      for (var i = 0; i < surveySelectors.length; i++) {
        var entry = surveySelectors[i];
        if (!entry || !entry.selector) continue;
        if (entry.selector.toLowerCase() === tag) return entry;
        try {
          if (node.matches(entry.selector)) return entry;
        } catch (err) {
          // Not every surveyed selector is valid as a CSS selector to `.matches()` — the
          // tag-name check above already covers the common Angular-element-selector case.
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  function describeElement(el) {
    var match = surveyedMatch(el);
    var component = angularComponentName(el) || (match ? match.name : undefined);
    var file = match ? match.file : undefined;
    return { tag: el.tagName.toLowerCase(), component: component, componentClass: component, file: file };
  }

  // ---- messaging to the bench --------------------------------------------

  function post(message) {
    window.parent.postMessage(message, benchOrigin);
  }

  function trimText(text) {
    var value = (text || '').replace(/\s+/g, ' ').trim();
    return value.length > 200 ? value.slice(0, 200) : value;
  }

  function postPick(el) {
    var described = describeElement(el);
    var rect = el.getBoundingClientRect();
    post({
      type: 'jig:pick',
      path: buildDomPath(el),
      tag: described.tag,
      text: trimText(el.textContent),
      component: described.component,
      componentClass: described.componentClass,
      file: described.file,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
  }

  function postEvent(kind, el, value) {
    if (!el) return;
    post({ type: 'jig:event', kind: kind, path: buildDomPath(el), value: value });
  }

  // ---- listeners ------------------------------------------------------------

  document.addEventListener(
    'mousemove',
    function (event) {
      if (mode !== 'loupe') return;
      var el = event.target;
      if (!el || el === overlay || el === label) return;
      paintOutline(el);
    },
    { passive: true },
  );

  // Loupe-mode clicks must be stopped before the app's own handlers ever run — not just
  // have their default action cancelled. preventDefault() alone cancels only the browser's
  // built-in default action (e.g. following an <a href>); it does nothing to a framework's
  // own imperative click handler, such as Angular's [routerLink], which navigates from
  // inside its own listener rather than through the default action. Capturing on `document`
  // for pointerdown/mousedown/click/auxclick and calling stopPropagation() there means the
  // event never reaches the target (or the bubble phase) at all in loupe mode, so the app's
  // own listeners — Angular's included — never run. None of these four are passive, and in
  // hand mode none of them touch the event; only 'click' and 'input' emit jig:event, exactly
  // as before.
  ['pointerdown', 'mousedown', 'auxclick'].forEach(function (type) {
    document.addEventListener(
      type,
      function (event) {
        if (mode !== 'loupe') return;
        event.stopPropagation();
        event.preventDefault();
      },
      { capture: true },
    );
  });

  document.addEventListener(
    'click',
    function (event) {
      if (mode === 'loupe') {
        event.stopPropagation();
        event.preventDefault();
        if (event.target) postPick(event.target);
        return;
      }
      postEvent('click', event.target);
    },
    { capture: true },
  );

  document.addEventListener(
    'input',
    function (event) {
      if (mode === 'loupe') return;
      var el = event.target;
      var value = el && 'value' in el ? String(el.value) : undefined;
      postEvent('input', el, value);
    },
    { passive: true },
  );

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data.type !== 'string') return;
    if (data.type === 'jig:mode') {
      mode = data.mode === 'loupe' ? 'loupe' : 'hand';
      if (mode !== 'loupe') clearOutline();
    } else if (data.type === 'jig:survey') {
      surveySelectors = Array.isArray(data.selectors) ? data.selectors : [];
    } else if (data.type === 'jig:highlight') {
      // S4 extension (see the delimited block above): selectors takes priority when both are
      // present — a bench message names one or the other, never both on purpose. `path`
      // (singular) is the integrator's addition — S5's TrayRegion posts one DOM path for the
      // order-in-hand's own mark (jigbench#wave3 integration seam), so it is folded into the
      // same one-path array `paths` already accepts rather than growing a fourth shape.
      if (Array.isArray(data.selectors) && data.selectors.length > 0) {
        paintHighlightsBySelectors(data.selectors);
      } else if (typeof data.path === 'string' && data.path) {
        paintHighlights([data.path]);
      } else {
        paintHighlights(Array.isArray(data.paths) ? data.paths : []);
      }
    } else if (data.type === 'jig:clear') {
      clearHighlights();
      clearOutline();
    } else if (data.type === 'jig:navigate') {
      // S4 extension (see the delimited block above).
      navigateSameOrigin(String(data.path || ''));
    }
  });

  // Exposed only so this file's own unit tests (jsdom, no real browser) can exercise its
  // pure helpers directly. Nothing in the runtime listeners above reads through this hook.
  window.__jigLoupeInternal = {
    buildDomPath: buildDomPath,
    surveyedMatch: surveyedMatch,
    describeElement: describeElement,
    setSurveySelectors: function (next) {
      surveySelectors = next;
    },
    setMode: function (next) {
      mode = next;
    },
    resolveNavigateUrl: resolveNavigateUrl, // S4 extension
    getMode: function () {
      return mode;
    },
  };

  console.debug('[jig] loupe ready');
})();
