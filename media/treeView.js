(function () {
  const vscode = acquireVsCodeApi();

  // ── DOM refs ───────────────────────────────────────────────

  const wrapper = document.getElementById("wrapper");
  const viewport = document.getElementById("viewport");
  const edgesSvg = document.getElementById("edges");
  const emptyEl = document.getElementById("empty");
  const tooltip = document.getElementById("tooltip");
  const searchInput = document.getElementById("search");

  // ── State ──────────────────────────────────────────────────

  let graph = null;
  let positions = new Map();
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  let panSX = 0;
  let panSY = 0;
  let collapsed = new Set();
  let vertical = true;
  let highlighted = null;
  let searchQ = "";

  // ── Layout constants ───────────────────────────────────────

  const NODE_W = 280;
  const NODE_GAP = 40;
  const LAYER_GAP = 100;
  const HDR_H = 38;
  const LINE_H = 24;
  const PAD = 18;
  const SEC_GAP = 8;

  // ── Messages ───────────────────────────────────────────────

  window.addEventListener("message", function (e) {
    var msg = e.data;
    if (msg.type === "updateGraph") {
      graph = msg.data;
      render();
      setTimeout(fitToView, 30);
    }
    if (msg.type === "highlightLine") {
      highlightByLine(msg.line);
    }
  });

  vscode.postMessage({ type: "ready" });

  // ── Layout ─────────────────────────────────────────────────

  function nodeHeight(conv) {
    if (collapsed.has(conv.id)) return HDR_H;
    var h = HDR_H + PAD;
    if (conv.lines.length) h += conv.lines.length * LINE_H + SEC_GAP;
    if (conv.choices.length) h += conv.choices.length * LINE_H + SEC_GAP;
    return Math.max(h, 56);
  }

  function computeLayout() {
    if (!graph || !graph.conversations.length) return;

    var adj = new Map();
    for (var i = 0; i < graph.edges.length; i++) {
      var e = graph.edges[i];
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push(e.to);
    }

    var layers = new Map();
    var first = graph.conversations[0];
    layers.set(first.id, 0);
    var queue = [first.id];

    while (queue.length) {
      var cur = queue.shift();
      var cl = layers.get(cur);
      var targets = adj.get(cur) || [];
      for (var t = 0; t < targets.length; t++) {
        if (!layers.has(targets[t])) {
          layers.set(targets[t], cl + 1);
          queue.push(targets[t]);
        }
      }
    }

    var maxL = 0;
    layers.forEach(function (v) { if (v > maxL) maxL = v; });
    for (var c = 0; c < graph.conversations.length; c++) {
      if (!layers.has(graph.conversations[c].id)) {
        layers.set(graph.conversations[c].id, maxL + 1);
      }
    }

    var groups = new Map();
    for (var c = 0; c < graph.conversations.length; c++) {
      var conv = graph.conversations[c];
      var l = layers.get(conv.id);
      if (!groups.has(l)) groups.set(l, []);
      groups.get(l).push(conv);
    }
    groups.forEach(function (cs) {
      cs.sort(function (a, b) { return a.startLine - b.startLine; });
    });

    positions = new Map();
    var sortedLayers = Array.from(groups.keys()).sort(function (a, b) { return a - b; });

    if (vertical) {
      var y = 0;
      for (var li = 0; li < sortedLayers.length; li++) {
        var cs = groups.get(sortedLayers[li]);
        var heights = cs.map(nodeHeight);
        var totalW = cs.length * NODE_W + (cs.length - 1) * NODE_GAP;
        var x = -totalW / 2;
        for (var ci = 0; ci < cs.length; ci++) {
          positions.set(cs[ci].id, { x: x, y: y, w: NODE_W, h: heights[ci] });
          x += NODE_W + NODE_GAP;
        }
        y += Math.max.apply(null, heights) + LAYER_GAP;
      }
    } else {
      var x = 0;
      for (var li = 0; li < sortedLayers.length; li++) {
        var cs = groups.get(sortedLayers[li]);
        var heights = cs.map(nodeHeight);
        var totalH = heights.reduce(function (a, b) { return a + b; }, 0) + (cs.length - 1) * NODE_GAP;
        var y = -totalH / 2;
        for (var ci = 0; ci < cs.length; ci++) {
          positions.set(cs[ci].id, { x: x, y: y, w: NODE_W, h: heights[ci] });
          y += heights[ci] + NODE_GAP;
        }
        x += NODE_W + LAYER_GAP;
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────

  function render() {
    if (!graph) { emptyEl.style.display = "flex"; return; }
    emptyEl.style.display = "none";
    computeLayout();
    renderNodes();
    renderEdges();
    if (highlighted) setHighlight(highlighted);
  }

  // ── Nodes ──────────────────────────────────────────────────

  function renderNodes() {
    var old = viewport.querySelectorAll(".node");
    for (var i = 0; i < old.length; i++) old[i].remove();
    if (!graph) return;

    for (var ci = 0; ci < graph.conversations.length; ci++) {
      var conv = graph.conversations[ci];
      var pos = positions.get(conv.id);
      if (!pos) continue;

      var el = document.createElement("div");
      el.className = "node";
      if (ci === 0 || conv.isDefault) el.classList.add("entry");
      else if (conv.isOrphan) el.classList.add("orphan", "dimmed");
      else if (conv.hasJumpOut) el.classList.add("jump-out");
      else el.classList.add("normal");
      if (searchQ && conv.name.toLowerCase().indexOf(searchQ) !== -1) {
        el.classList.add("search-match");
      }
      el.setAttribute("data-id", conv.id);
      el.style.left = pos.x + "px";
      el.style.top = pos.y + "px";
      el.style.width = pos.w + "px";

      el.appendChild(buildHeader(conv));
      if (!collapsed.has(conv.id)) {
        el.appendChild(buildBody(conv));
      }

      viewport.appendChild(el);
    }
  }

  function buildHeader(conv) {
    var hdr = document.createElement("div");
    hdr.className = "node-hdr";

    var name = document.createElement("span");
    name.className = "node-name";
    name.textContent = conv.name;
    hdr.appendChild(name);

    var badge = document.createElement("span");
    badge.className = "node-badge";
    badge.textContent = conv.lines.length + " lines, " + conv.choices.length + " choices";
    hdr.appendChild(badge);

    var toggle = document.createElement("button");
    toggle.className = "node-toggle";
    toggle.textContent = collapsed.has(conv.id) ? "\u25B8" : "\u25BE";
    toggle.addEventListener("click", function (ev) {
      ev.stopPropagation();
      toggleCollapse(conv.id);
    });
    hdr.appendChild(toggle);

    hdr.addEventListener("click", function () {
      nav(conv.startLine);
    });

    return hdr;
  }

  function buildBody(conv) {
    var body = document.createElement("div");
    body.className = "node-body";

    if (conv.lines.length) {
      var section = document.createElement("div");
      section.className = "node-lines";
      for (var i = 0; i < conv.lines.length; i++) {
        section.appendChild(buildLineRow(conv.lines[i]));
      }
      body.appendChild(section);
    }

    if (conv.choices.length) {
      var section = document.createElement("div");
      section.className = "node-choices";
      for (var i = 0; i < conv.choices.length; i++) {
        section.appendChild(buildChoiceRow(conv.choices[i]));
      }
      body.appendChild(section);
    }

    return body;
  }

  function buildLineRow(line) {
    var row = document.createElement("div");
    row.className = "node-line";

    var speaker = document.createElement("span");
    speaker.className = "line-speaker";
    speaker.textContent = line.speaker + ":";
    row.appendChild(speaker);

    var text = document.createElement("span");
    text.className = "line-text";
    text.textContent = line.textPreview || "\u2026";
    row.appendChild(text);

    if (line.hasImage) {
      var tag = document.createElement("span");
      tag.className = "line-tag";
      tag.title = "Has image";
      tag.textContent = "img";
      row.appendChild(tag);
    }

    if (line.hasJump) {
      var tag = document.createElement("span");
      tag.className = "line-tag";
      tag.title = "Jumps to " + (line.jumpTarget || "?");
      tag.textContent = "jump";
      row.appendChild(tag);
    }

    row.addEventListener("click", function (ev) {
      ev.stopPropagation();
      nav(line.line);
    });

    return row;
  }

  function buildChoiceRow(choice) {
    var row = document.createElement("div");
    row.className = "node-choice";

    var bullet = document.createElement("span");
    bullet.className = "choice-bullet";
    bullet.textContent = ">";
    row.appendChild(bullet);

    var text = document.createElement("span");
    text.className = "choice-text";
    text.textContent = choice.text;
    row.appendChild(text);

    if (choice.target) {
      var arrow = document.createElement("span");
      arrow.className = "choice-arrow";
      arrow.textContent = "\u2192";
      row.appendChild(arrow);

      var target = document.createElement("span");
      target.className = "choice-target";
      target.textContent = choice.target;
      row.appendChild(target);
    }

    row.addEventListener("click", function (ev) {
      ev.stopPropagation();
      nav(choice.line);
    });

    return row;
  }

  // ── Edges ──────────────────────────────────────────────────

  function renderEdges() {
    while (edgesSvg.firstChild) edgesSvg.removeChild(edgesSvg.firstChild);
    if (!graph) return;

    var bounds = graphBounds();
    if (!bounds) return;

    var pad = 80;
    var svgW = bounds.maxX - bounds.minX + pad * 2;
    var svgH = bounds.maxY - bounds.minY + pad * 2;
    edgesSvg.setAttribute("width", String(svgW));
    edgesSvg.setAttribute("height", String(svgH));
    edgesSvg.style.left = (bounds.minX - pad) + "px";
    edgesSvg.style.top = (bounds.minY - pad) + "px";
    var ox = -(bounds.minX - pad);
    var oy = -(bounds.minY - pad);

    var ns = "http://www.w3.org/2000/svg";

    var defs = document.createElementNS(ns, "defs");
    var marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "arrowhead");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto");
    var markerPath = document.createElementNS(ns, "path");
    markerPath.setAttribute("d", "M0 0L10 5L0 10z");
    markerPath.setAttribute("fill", "var(--vscode-textLink-foreground)");
    marker.appendChild(markerPath);
    defs.appendChild(marker);
    edgesSvg.appendChild(defs);

    for (var i = 0; i < graph.edges.length; i++) {
      var edge = graph.edges[i];
      var sp = positions.get(edge.from);
      var tp = positions.get(edge.to);
      if (!sp || !tp) continue;

      var sx, sy, tx, ty;
      if (vertical) {
        sx = sp.x + sp.w / 2 + ox;
        sy = sp.y + sp.h + oy;
        tx = tp.x + tp.w / 2 + ox;
        ty = tp.y + oy;
      } else {
        sx = sp.x + sp.w + ox;
        sy = sp.y + sp.h / 2 + oy;
        tx = tp.x + ox;
        ty = tp.y + tp.h / 2 + oy;
      }

      var dist = vertical ? Math.abs(ty - sy) : Math.abs(tx - sx);
      var cp = Math.max(40, dist * 0.4);
      var d;
      if (vertical) {
        d = "M" + sx + " " + sy + " C" + sx + " " + (sy + cp) + "," + tx + " " + (ty - cp) + "," + tx + " " + ty;
      } else {
        d = "M" + sx + " " + sy + " C" + (sx + cp) + " " + sy + "," + (tx - cp) + " " + ty + "," + tx + " " + ty;
      }

      // Hit area for hover tooltip
      var hit = document.createElementNS(ns, "path");
      hit.setAttribute("d", d);
      hit.setAttribute("class", "edge-hit");
      (function (edge) {
        hit.addEventListener("mouseenter", function (ev) {
          tooltip.textContent = edge.label || edge.type;
          tooltip.style.display = "block";
          tooltip.style.left = ev.clientX + 12 + "px";
          tooltip.style.top = ev.clientY + 12 + "px";
        });
        hit.addEventListener("mousemove", function (ev) {
          tooltip.style.left = ev.clientX + 12 + "px";
          tooltip.style.top = ev.clientY + 12 + "px";
        });
        hit.addEventListener("mouseleave", function () {
          tooltip.style.display = "none";
        });
      })(edge);
      edgesSvg.appendChild(hit);

      // Visible path
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "edge" + (edge.type === "jump" ? " jump" : ""));
      path.setAttribute("marker-end", "url(#arrowhead)");
      edgesSvg.appendChild(path);

      // Label
      if (edge.label) {
        var mx = (sx + tx) / 2;
        var my = (sy + ty) / 2;
        var label = edge.label.length > 24 ? edge.label.substring(0, 24) + "\u2026" : edge.label;

        var bg = document.createElementNS(ns, "rect");
        bg.setAttribute("x", String(mx - label.length * 3));
        bg.setAttribute("y", String(my - 14));
        bg.setAttribute("width", String(label.length * 6 + 8));
        bg.setAttribute("height", "16");
        bg.setAttribute("rx", "3");
        bg.setAttribute("class", "edge-label-bg");
        edgesSvg.appendChild(bg);

        var txt = document.createElementNS(ns, "text");
        txt.setAttribute("x", String(mx));
        txt.setAttribute("y", String(my - 3));
        txt.setAttribute("class", "edge-label");
        txt.textContent = label;
        edgesSvg.appendChild(txt);
      }
    }
  }

  // ── Highlight ──────────────────────────────────────────────

  function setHighlight(name) {
    highlighted = name;
    var nodes = viewport.querySelectorAll(".node");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("highlighted", nodes[i].getAttribute("data-id") === name);
    }
  }

  function highlightByLine(line) {
    if (!graph) return;
    var match = null;
    for (var i = 0; i < graph.conversations.length; i++) {
      var c = graph.conversations[i];
      if (line >= c.startLine && line <= c.endLine) match = c.id;
    }
    setHighlight(match);
  }

  // ── Zoom / Pan ─────────────────────────────────────────────

  function applyTransform() {
    viewport.style.transform = "translate(" + panX + "px," + panY + "px) scale(" + zoom + ")";
  }

  wrapper.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = wrapper.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var oldZ = zoom;
    zoom *= e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoom = Math.max(0.1, Math.min(5, zoom));
    panX = mx - (mx - panX) * (zoom / oldZ);
    panY = my - (my - panY) * (zoom / oldZ);
    applyTransform();
  }, { passive: false });

  wrapper.addEventListener("mousedown", function (e) {
    if (e.target !== wrapper && e.target !== edgesSvg && !e.target.classList.contains("edge-hit")) return;
    dragging = true;
    dragX = e.clientX;
    dragY = e.clientY;
    panSX = panX;
    panSY = panY;
    wrapper.classList.add("dragging");
  });

  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    panX = panSX + (e.clientX - dragX);
    panY = panSY + (e.clientY - dragY);
    applyTransform();
  });

  window.addEventListener("mouseup", function () {
    dragging = false;
    wrapper.classList.remove("dragging");
  });

  // ── Toolbar ────────────────────────────────────────────────

  function fitToView() {
    if (!graph || !graph.conversations.length) return;
    var b = graphBounds();
    if (!b) return;
    var gw = b.maxX - b.minX;
    var gh = b.maxY - b.minY;
    var rect = wrapper.getBoundingClientRect();
    var p = 50;
    if (gw === 0 || gh === 0) { zoom = 1; } else {
      var sx = (rect.width - p * 2) / gw;
      var sy = (rect.height - p * 2) / gh;
      zoom = Math.min(sx, sy, 1.5);
      zoom = Math.max(0.1, zoom);
    }
    panX = rect.width / 2 - ((b.minX + b.maxX) / 2) * zoom;
    panY = rect.height / 2 - ((b.minY + b.maxY) / 2) * zoom;
    applyTransform();
  }

  function toggleCollapse(id) {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    render();
  }

  document.getElementById("fit").addEventListener("click", fitToView);
  document.getElementById("zoomIn").addEventListener("click", function () { zoom = Math.min(5, zoom * 1.25); applyTransform(); });
  document.getElementById("zoomOut").addEventListener("click", function () { zoom = Math.max(0.1, zoom / 1.25); applyTransform(); });

  document.getElementById("toggleDir").addEventListener("click", function () {
    vertical = !vertical;
    document.getElementById("toggleDir").textContent = vertical ? "Vertical" : "Horizontal";
    render();
    setTimeout(fitToView, 20);
  });

  document.getElementById("collapseAll").addEventListener("click", function () {
    if (!graph) return;
    for (var i = 0; i < graph.conversations.length; i++) collapsed.add(graph.conversations[i].id);
    render();
  });

  document.getElementById("expandAll").addEventListener("click", function () {
    collapsed.clear();
    render();
  });

  document.getElementById("refresh").addEventListener("click", function () {
    vscode.postMessage({ type: "ready" });
  });

  document.getElementById("exportSvg").addEventListener("click", function () {
    var nodes = viewport.querySelectorAll(".node");
    var parts = ['<svg xmlns="http://www.w3.org/2000/svg">'];
    parts.push(edgesSvg.innerHTML);
    nodes.forEach(function (n) {
      parts.push('<foreignObject x="' + n.style.left.replace("px", "") + '" y="' + n.style.top.replace("px", "") + '" width="' + n.style.width.replace("px", "") + '" height="' + n.offsetHeight + '">');
      parts.push(n.outerHTML);
      parts.push("</foreignObject>");
    });
    parts.push("</svg>");
    vscode.postMessage({ type: "export", svg: parts.join("") });
  });

  searchInput.addEventListener("input", function () {
    searchQ = searchInput.value.toLowerCase();
    var nodes = viewport.querySelectorAll(".node");
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute("data-id") || "";
      nodes[i].classList.toggle("search-match", searchQ.length > 0 && id.toLowerCase().indexOf(searchQ) !== -1);
    }
  });

  // ── Helpers ────────────────────────────────────────────────

  function nav(line) {
    vscode.postMessage({ type: "navigateTo", line: line, column: 0 });
  }

  function graphBounds() {
    if (positions.size === 0) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    positions.forEach(function (p) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x + p.w > maxX) maxX = p.x + p.w;
      if (p.y + p.h > maxY) maxY = p.y + p.h;
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }
})();
