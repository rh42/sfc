/* ─────────────────────────────────────────────────────────────
   SFC — Beat 1 — main.js
   Vanilla JS + D3 v7 + Scrollama
   ───────────────────────────────────────────────────────────── */

/* ────────────── 1. DATA ──────────────
   Nodes laid out by hand on a 800x600 viewBox in a loose brain arc.
   Two clusters: unimodal (top-left, warmer grey)
                 transmodal (bottom-right, cooler grey).
   Edit positions freely — everything downstream reads from here. */

const NODES = [
  // ── Unimodal cluster ─────────────────────────────────
  { id: "V1",    label: "V1",    x: 175, y: 198, cluster: "unimodal",
    desc: "Primary visual cortex.",        meta: "Unimodal · high SFC" },
  { id: "V2",    label: "V2",    x: 244, y: 138, cluster: "unimodal",
    desc: "Secondary visual cortex.",      meta: "Unimodal · high SFC" },
  { id: "A1",    label: "A1",    x: 138, y: 290, cluster: "unimodal",
    desc: "Primary auditory cortex.",      meta: "Unimodal · high SFC" },
  { id: "S1",    label: "S1",    x: 285, y: 248, cluster: "unimodal",
    desc: "Primary somatosensory cortex.", meta: "Unimodal · high SFC" },
  { id: "M1",    label: "M1",    x: 215, y: 360, cluster: "unimodal",
    desc: "Primary motor cortex.",         meta: "Unimodal · high SFC" },

  // ── Transmodal cluster ───────────────────────────────
  { id: "IPL",   label: "IPL",   x: 430, y: 405, cluster: "transmodal",
    desc: "Inferior parietal lobule.",     meta: "Transmodal · low SFC" },
  { id: "Ins",   label: "Ins",   x: 408, y: 258, cluster: "transmodal",
    desc: "Insular cortex.",               meta: "Transmodal · low SFC" },
  { id: "ACC",   label: "ACC",   x: 540, y: 348, cluster: "transmodal",
    desc: "Anterior cingulate cortex.",    meta: "Transmodal · low SFC" },
  { id: "PCC",   label: "PCC",   x: 510, y: 220, cluster: "transmodal",
    desc: "Posterior cingulate cortex.",   meta: "Transmodal · low SFC · DMN hub" },
  { id: "dlPFC", label: "dlPFC", x: 590, y: 135, cluster: "transmodal",
    desc: "Dorsolateral prefrontal ctx.",  meta: "Transmodal · low SFC" },
  { id: "mPFC",  label: "mPFC",  x: 660, y: 232, cluster: "transmodal",
    desc: "Medial prefrontal cortex.",     meta: "Transmodal · low SFC · DMN hub" }
];

// SC edges — corrected schematic set. Edit only this list to change wiring.
const SC_EDGES = [
  { source: "V1",   target: "V2",    weight: 0.9 },
  { source: "V1",   target: "S1",    weight: 0.5 },
  { source: "A1",   target: "S1",    weight: 0.4 },
  { source: "S1",   target: "M1",    weight: 0.9 },
  { source: "S1",   target: "IPL",   weight: 0.8 },
  { source: "Ins",  target: "S1",    weight: 0.5 },
  { source: "Ins",  target: "ACC",   weight: 0.6 },
  { source: "PCC",  target: "mPFC",  weight: 0.9 },
  { source: "PCC",  target: "IPL",   weight: 0.8 },
  { source: "PCC",  target: "dlPFC", weight: 0.5 },
  { source: "mPFC", target: "dlPFC", weight: 0.6 }
];

// The pair the eye should land on in Step 2: NO direct SC, visible FC.
// Indirect route: A1 → S1 → IPL → PCC → dlPFC (all hops now back SC-edged).
const PULSE_PAIR    = { a: "A1", b: "dlPFC" };
const INDIRECT_PATH = ["A1", "S1", "IPL", "PCC", "dlPFC"];

/* ────────────── 2. DERIVED ──────────────  */

// Lookup map
const NODE_BY_ID = new Map(NODES.map(n => [n.id, n]));

// Degree from SC
const DEGREE = new Map(NODES.map(n => [n.id, 0]));
SC_EDGES.forEach(e => {
  DEGREE.set(e.source, DEGREE.get(e.source) + 1);
  DEGREE.set(e.target, DEGREE.get(e.target) + 1);
});

// FC edges = ALL pairs (dense). Weight is synthetic but plausible:
//   higher within-cluster, plus boost if SC edge exists, plus
//   a tuned amount for the pulse pair so it reads as "real" FC.
const SC_SET = new Set(SC_EDGES.map(e => `${e.source}|${e.target}`).concat(
                       SC_EDGES.map(e => `${e.target}|${e.source}`)));
function scExists(a, b) { return SC_SET.has(`${a}|${b}`); }

const FC_EDGES = [];
for (let i = 0; i < NODES.length; i++) {
  for (let j = i + 1; j < NODES.length; j++) {
    const a = NODES[i], b = NODES[j];
    let w = 0.20;                                  // baseline FC for any pair
    if (a.cluster === b.cluster)            w += 0.18;
    if (scExists(a.id, b.id))                w += 0.30;
    // Long-range DMN-ish couplings get a boost
    if ((a.cluster === "transmodal" && b.cluster === "transmodal")) w += 0.06;
    FC_EDGES.push({ source: a.id, target: b.id, weight: Math.min(w, 0.95) });
  }
}

// Mark the pulse pair so we can find it
FC_EDGES.forEach(e => {
  if ((e.source === PULSE_PAIR.a && e.target === PULSE_PAIR.b) ||
      (e.source === PULSE_PAIR.b && e.target === PULSE_PAIR.a)) {
    e.isPulse = true;
    e.weight = 0.55;            // visible-but-not-overwhelming FC weight
  }
});

// Adjacency map of SC for hover-lookups
const SC_ADJ = new Map(NODES.map(n => [n.id, new Set()]));
SC_EDGES.forEach(e => {
  SC_ADJ.get(e.source).add(e.target);
  SC_ADJ.get(e.target).add(e.source);
});

/* ────────────── 3. SVG SCAFFOLD ──────────────  */

const svg = d3.select("#graph");

// Layered groups (back-to-front)
const gHulls    = svg.append("g").attr("class", "layer-hulls");
const gFcEdges  = svg.append("g").attr("class", "layer-fc");
const gScEdges  = svg.append("g").attr("class", "layer-sc");
const gBeams    = svg.append("g").attr("class", "layer-beam");
const gNodes    = svg.append("g").attr("class", "layer-nodes");
const gLabels   = svg.append("g").attr("class", "layer-labels");
const gCta      = svg.append("g").attr("class", "layer-cta");

// ── Helpers
function nodeRadius(d) {
  // Hubs (mPFC, PCC, S1, IPL — higher degree) read visibly larger.
  const deg = DEGREE.get(d.id);
  return 11 + deg * 2.2;
}

function edgeCoords(e) {
  const s = NODE_BY_ID.get(e.source);
  const t = NODE_BY_ID.get(e.target);
  return { x1: s.x, y1: s.y, x2: t.x, y2: t.y };
}

// ── Cluster hulls (subtle background blobs to imply grouping)
const HULL_PAD = 36;
function clusterHull(cluster) {
  const pts = NODES.filter(n => n.cluster === cluster).map(n => [n.x, n.y]);
  // simple bounding-circle-ish hull via convex hull + padding
  const hull = d3.polygonHull(pts);
  if (!hull) return "";
  // expand outward from centroid
  const cx = d3.mean(hull, d => d[0]);
  const cy = d3.mean(hull, d => d[1]);
  const expanded = hull.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * HULL_PAD, y + (dy / len) * HULL_PAD];
  });
  return "M" + expanded.map(p => p.join(",")).join("L") + "Z";
}

gHulls.append("path")
  .attr("class", "cluster-hull")
  .attr("d", clusterHull("unimodal"));
gHulls.append("path")
  .attr("class", "cluster-hull")
  .attr("d", clusterHull("transmodal"));

// ── FC edges (one <line> per pair)
const fcSel = gFcEdges.selectAll("line.fc-edge")
  .data(FC_EDGES, d => `${d.source}|${d.target}`)
  .join("line")
  .attr("class", d => "fc-edge" + (d.isPulse ? " js-pulse" : ""))
  .attr("data-source", d => d.source)
  .attr("data-target", d => d.target)
  .attr("x1", d => NODE_BY_ID.get(d.source).x)
  .attr("y1", d => NODE_BY_ID.get(d.source).y)
  .attr("x2", d => NODE_BY_ID.get(d.target).x)
  .attr("y2", d => NODE_BY_ID.get(d.target).y);

// ── SC edges
const scSel = gScEdges.selectAll("line.sc-edge")
  .data(SC_EDGES, d => `${d.source}|${d.target}`)
  .join("line")
  .attr("class", "sc-edge")
  .attr("data-source", d => d.source)
  .attr("data-target", d => d.target)
  .attr("x1", d => NODE_BY_ID.get(d.source).x)
  .attr("y1", d => NODE_BY_ID.get(d.source).y)
  .attr("x2", d => NODE_BY_ID.get(d.target).x)
  .attr("y2", d => NODE_BY_ID.get(d.target).y)
  .attr("stroke-width", d => 1.6 + d.weight * 1.6);

// ── Node groups
const nodeSel = gNodes.selectAll("g.node")
  .data(NODES, d => d.id)
  .join("g")
  .attr("class", "node")
  .attr("transform", d => `translate(${d.x},${d.y})`);

nodeSel.append("circle")
  .attr("class", d => `node-ring is-${d.cluster}`)
  .attr("r", nodeRadius)
  .attr("data-id", d => d.id);

// ── Labels (offset to avoid overlap; small adjustments per node)
const LABEL_OFFSET = {
  V1:    { dx: -2,  dy: -22 },
  V2:    { dx:  0,  dy: -22 },
  A1:    { dx: -22, dy:   4 },
  S1:    { dx:  22, dy:   4 },
  M1:    { dx:  0,  dy:  28 },
  IPL:   { dx:  0,  dy:  28 },
  Ins:   { dx: -22, dy:   4 },
  ACC:   { dx:  0,  dy:  28 },
  PCC:   { dx:  0,  dy: -22 },
  dlPFC: { dx:  0,  dy: -22 },
  mPFC:  { dx:  24, dy:   4 }
};

const labelSel = gLabels.selectAll("text.node-label")
  .data(NODES, d => d.id)
  .join("text")
  .attr("class", "node-label")
  .attr("x", d => d.x + LABEL_OFFSET[d.id].dx)
  .attr("y", d => d.y + LABEL_OFFSET[d.id].dy)
  .attr("text-anchor", d => {
    const dx = LABEL_OFFSET[d.id].dx;
    if (dx <= -10) return "end";
    if (dx >=  10) return "start";
    return "middle";
  })
  .attr("dominant-baseline", "middle")
  .attr("data-id", d => d.id)
  .text(d => d.label);

/* ────────────── 4. TOOLTIP ──────────────  */

// ── Floating CTA pill at pulse-pair midpoint — the "click me" affordance.
// Sits in its own SVG layer so we can show/hide it without juggling edges.
const PULSE_MID = {
  x: (NODE_BY_ID.get(PULSE_PAIR.a).x + NODE_BY_ID.get(PULSE_PAIR.b).x) / 2,
  y: (NODE_BY_ID.get(PULSE_PAIR.a).y + NODE_BY_ID.get(PULSE_PAIR.b).y) / 2 - 4
};

const ctaG = gCta.append("g")
  .attr("class", "pulse-cta")
  .attr("transform", `translate(${PULSE_MID.x},${PULSE_MID.y})`);

ctaG.append("rect")
  .attr("class", "pulse-cta__bg")
  .attr("x", -52).attr("y", -15)
  .attr("width", 104).attr("height", 30)
  .attr("rx", 15).attr("ry", 15);

ctaG.append("circle")
  .attr("class", "pulse-cta__dot")
  .attr("cx", -36).attr("cy", 0).attr("r", 4);

ctaG.append("text")
  .attr("class", "pulse-cta__text")
  .attr("x", 8).attr("y", 1)
  .attr("text-anchor", "middle")
  .text("CLICK ME");

ctaG.on("click", function(evt) { playIndirectPath(evt); })
    .on("mouseenter", function(evt) {
      const a = NODE_BY_ID.get(PULSE_PAIR.a);
      const b = NODE_BY_ID.get(PULSE_PAIR.b);
      showCustomTooltip(
        `${a.label} ↔ ${b.label}`,
        "Functionally correlated. No direct white-matter tract.",
        "Click to reveal the indirect structural route.",
        evt,
        { pulse: true }
      );
    })
    .on("mouseleave", hideTooltip);

const tooltipEl   = document.getElementById("tooltip");
const tlLabel     = document.getElementById("tooltip-label");
const tlDesc      = document.getElementById("tooltip-desc");
const tlMeta      = document.getElementById("tooltip-meta");
const frameEl     = document.querySelector(".graphic-frame");
const svgEl       = document.getElementById("graph");

function showTooltip(node, evt) {
  tlLabel.textContent = node.label;
  tlDesc.textContent  = node.desc;
  tlMeta.textContent  = `${node.meta} · degree ${DEGREE.get(node.id)}`;
  positionTooltip(evt);
  tooltipEl.classList.remove("is-pulse");
  document.getElementById("tooltip-cta").hidden = true;
  tooltipEl.classList.add("is-visible");
  tooltipEl.setAttribute("aria-hidden", "false");
}
function showCustomTooltip(label, desc, meta, evt, opts) {
  tlLabel.textContent = label;
  tlDesc.textContent  = desc;
  tlMeta.textContent  = meta;
  positionTooltip(evt);
  const isPulse = !!(opts && opts.pulse);
  tooltipEl.classList.toggle("is-pulse", isPulse);
  document.getElementById("tooltip-cta").hidden = !isPulse;
  tooltipEl.classList.add("is-visible");
  tooltipEl.setAttribute("aria-hidden", "false");
}
function hideTooltip() {
  tooltipEl.classList.remove("is-visible");
  tooltipEl.setAttribute("aria-hidden", "true");
}
function positionTooltip(_evt) {
  // Tooltip is now pinned to a fixed slot (top-right under the legend).
  // Cursor position is intentionally ignored \u2014 it was covering the node
  // being inspected and felt visually heavy.
}

/* ────────────── 5. STATE / INTERACTION ──────────────  */

let currentStep   = 1;
let hoverLocked   = false;   // true while path animation is running
let pathPlayed    = false;   // user has clicked the pulsing pair at least once

function setStep(step) {
  currentStep = step;

  // Disclaimer only visible on step 1 (per the new spec)
  const b1Frame = document.querySelector("#scrolly-beat-1 .scrolly__graphic");
  if (b1Frame) b1Frame.classList.toggle("is-disclaimer-on", step === 1);

  // Clear any hover-only highlights when stepping
  clearHover();

  if (step === 1) {
    document.getElementById("readout-state").textContent = "SC ONLY";
    document.getElementById("readout-edges").textContent = SC_EDGES.length + " STRUCTURAL";
    fcSel.classed("is-shown", false).classed("is-pulse", false);
    gHulls.selectAll(".cluster-hull").classed("is-shown", true);
    ctaG.classed("is-visible", false);
    hideReplayHint();
    resetPathState();
  }
  else if (step === 2) {
    document.getElementById("readout-state").textContent = "SC + FC";
    document.getElementById("readout-edges").textContent =
      SC_EDGES.length + " SC · " + FC_EDGES.length + " FC";
    fcSel.classed("is-shown", true)
         .classed("is-pulse", d => !!d.isPulse);
    gHulls.selectAll(".cluster-hull").classed("is-shown", true);
    ctaG.classed("is-visible", false);
    hideReplayHint();
    resetPathState();
  }
  else if (step === 3) {
    document.getElementById("readout-state").textContent = "INSPECT · ROUTE";
    document.getElementById("readout-edges").textContent =
      "HOVER NODE · CLICK PULSE PAIR";
    fcSel.classed("is-shown", true)
         .classed("is-pulse", d => !!d.isPulse && !pathPlayed);
    gHulls.selectAll(".cluster-hull").classed("is-shown", false);
    ctaG.classed("is-visible", !pathPlayed);
    if (pathPlayed) showReplayHint();
  }
}

function clearHover() {
  if (hoverLocked) return;
  nodeSel.select(".node-ring")
    .classed("is-active", false)
    .classed("is-dim", false);
  labelSel.classed("is-active", false).classed("is-dim", false);
  scSel.classed("is-active", false).classed("is-dim", false);
  fcSel.classed("is-active", false);
}

function hoverNode(node, evt) {
  if (hoverLocked) return;

  // Highlight rings/labels
  nodeSel.select(".node-ring")
    .classed("is-active", d => d.id === node.id)
    .classed("is-dim",    d => d.id !== node.id && !SC_ADJ.get(node.id).has(d.id));
  labelSel
    .classed("is-active", d => d.id === node.id)
    .classed("is-dim",    d => d.id !== node.id && !SC_ADJ.get(node.id).has(d.id));

  // SC edges touching this node go bright; others dim.
  scSel
    .classed("is-active", d => d.source === node.id || d.target === node.id)
    .classed("is-dim",    d => d.source !== node.id && d.target !== node.id);

  // FC edges touching this node become medium-opacity.
  // Keep other FC edges at base 'is-shown' state.
  fcSel.classed("is-active", d => d.source === node.id || d.target === node.id);

  showTooltip(node, evt);
}

// Bind node interactions on the actual painted/hit-tested element (the ring),
// not the wrapping <g> — the <g> has no geometry, so depending on layout
// engines the hover handler can effectively never fire.
const nodeRingSel = nodeSel.select(".node-ring");

nodeRingSel
  .on("mouseenter", function(evt, d) { hoverNode(d, evt); })
  .on("mousemove",  function(evt, d) { if (!hoverLocked) positionTooltip(evt); })
  .on("mouseleave", function() {
    if (hoverLocked) return;
    clearHover();
    hideTooltip();
  })
  .on("focus", function(evt, d) { hoverNode(d, evt || { clientX: NODE_BY_ID.get(d.id).x, clientY: d.y }); })
  .on("blur",  function() { if (!hoverLocked) { clearHover(); hideTooltip(); } });

// ── Pulse-pair click → play indirect-path animation
fcSel.filter(d => d.isPulse)
  .on("mouseenter", function(evt, d) {
    const a = NODE_BY_ID.get(d.source);
    const b = NODE_BY_ID.get(d.target);
    showCustomTooltip(
      `${a.label} ↔ ${b.label}`,
      "Functionally correlated. No direct white-matter tract.",
      "Click to reveal the indirect structural route.",
      evt,
      { pulse: true }
    );
  })
  .on("mousemove",  function(evt) { positionTooltip(evt); })
  .on("mouseleave", hideTooltip)
  .on("click",      function(evt) {
    playIndirectPath(evt);
  });

/* ────────────── 6. INDIRECT PATH ANIMATION ──────────────  */
/*
   On click of the pulsing FC pair (V1 ↔ mPFC):
   - Dim everything except the path edges & nodes.
   - Light up each node sequentially (ring fills amber).
   - Travel a beam dot along each segment in sequence.
*/

function resetPathState() {
  hoverLocked = false;
  scSel.classed("is-path", false);
  nodeSel.select(".node-ring").classed("is-lit", false).classed("is-pulse-target", false);
  gBeams.selectAll(".beam").remove();
}

function playIndirectPath(evt) {
  if (hoverLocked) return;
  hoverLocked = true;

  // Hide the CLICK ME affordance once the action is taken.
  ctaG.classed("is-visible", false);

  // Highlight pulse pair endpoints
  const pulseIds = new Set([PULSE_PAIR.a, PULSE_PAIR.b]);

  // Dim non-path stuff
  const pathSet = new Set(INDIRECT_PATH);
  const pathEdgeSet = new Set();
  for (let i = 0; i < INDIRECT_PATH.length - 1; i++) {
    const a = INDIRECT_PATH[i], b = INDIRECT_PATH[i + 1];
    pathEdgeSet.add(`${a}|${b}`);
    pathEdgeSet.add(`${b}|${a}`);
  }

  scSel
    .classed("is-path", d => pathEdgeSet.has(`${d.source}|${d.target}`))
    .classed("is-dim",  d => !pathEdgeSet.has(`${d.source}|${d.target}`))
    .classed("is-active", false);

  fcSel
    .classed("is-active", d => pulseIds.has(d.source) && pulseIds.has(d.target))
    .classed("is-pulse", false);

  nodeSel.select(".node-ring")
    .classed("is-dim", d => !pathSet.has(d.id))
    .classed("is-active", d => pulseIds.has(d.id))
    .classed("is-lit", false);

  labelSel
    .classed("is-dim",    d => !pathSet.has(d.id))
    .classed("is-active", d => pathSet.has(d.id));

  // No tooltip during the animation — the route is conveyed by the
  // sequential light-up itself; a floating card would just block the view.
  hideTooltip();

  // Sequentially light nodes & run beams
  const STEP_MS = (window.__sfcTweaks && window.__sfcTweaks.pathSpeed) || 520;
  // light the first node immediately
  d3.select(`.node-ring[data-id="${INDIRECT_PATH[0]}"]`).classed("is-lit", true);

  for (let i = 0; i < INDIRECT_PATH.length - 1; i++) {
    const a = INDIRECT_PATH[i];
    const b = INDIRECT_PATH[i + 1];
    setTimeout(() => runBeam(a, b, STEP_MS), i * STEP_MS);
    setTimeout(() => {
      d3.select(`.node-ring[data-id="${b}"]`).classed("is-lit", true);
    }, (i + 1) * STEP_MS - 30);
  }

  // After full path: hide the now-stale tooltip, show "replay" affordance,
  // and unlock hover so the user can keep exploring.
  const totalMs = (INDIRECT_PATH.length - 1) * STEP_MS + 400;
  setTimeout(() => {
    hoverLocked = false;
    pathPlayed = true;
    hideTooltip();
    showReplayHint();
  }, totalMs);
}

function runBeam(aId, bId, durationMs) {
  const a = NODE_BY_ID.get(aId);
  const b = NODE_BY_ID.get(bId);
  const beam = gBeams.append("circle")
    .attr("class", "beam is-running")
    .attr("r", 5)
    .attr("cx", a.x)
    .attr("cy", a.y);

  beam.transition()
    .duration(durationMs)
    .ease(d3.easeCubicInOut)
    .attr("cx", b.x)
    .attr("cy", b.y)
    .on("end", function() {
      // Quick fade then remove so trails don't accumulate
      d3.select(this)
        .transition().duration(220).attr("r", 1).style("opacity", 0)
        .remove();
    });
}

/* ────────────── 7. REPLAY HINT ──────────────  */

const replayHint = document.createElement("button");
replayHint.className = "replay-hint";
replayHint.type = "button";
replayHint.textContent = "Reset";
frameEl.appendChild(replayHint);

replayHint.addEventListener("click", () => {
  // Reset to the step-3 starting state so the user can click CLICK ME again.
  resetPathState();
  fcSel.classed("is-pulse", d => !!d.isPulse).classed("is-active", false);
  nodeSel.select(".node-ring").classed("is-dim", false).classed("is-active", false).classed("is-lit", false);
  labelSel.classed("is-dim", false).classed("is-active", false);
  scSel.classed("is-dim", false).classed("is-path", false).classed("is-active", false);
  pathPlayed = false;
  ctaG.classed("is-visible", true);
  hideReplayHint();
  hideTooltip();
});

function showReplayHint() { replayHint.classList.add("is-visible"); }
function hideReplayHint() { replayHint.classList.remove("is-visible"); }

/* ────────────── 8. SCROLLAMA ──────────────  */

const scroller = scrollama();

scroller
  .setup({
    step: "#scrolly-beat-1 .step",
    offset: 0.55,
    debug: false
  })
  .onStepEnter(({ element }) => {
    // 1. Fade the text in (Reading Lens ON)
    element.classList.add('is-active');
    
    // Your existing logic
    const step = +element.dataset.step;
    setStep(step);
  })
  .onStepExit(({ element }) => {
    // 2. Fade the text back out (Reading Lens OFF)
    element.classList.remove('is-active');
  });

// Recompute on resize
window.addEventListener("resize", () => scroller.resize());

// Init in step 1
setStep(1);

/* ═════════════════════════════════════════════════════════════
   ─────────────────────────────────────────────────────────────
   BEAT 2 — Graph theory + communication models
   Steps 4–7. Reuses NODES / SC_EDGES / DEGREE / SC_ADJ / NODE_BY_ID.
   Renders an independent SVG (#graph2) so Beat 1 stays untouched.
   ─────────────────────────────────────────────────────────────
   ═════════════════════════════════════════════════════════════ */

/* ────────────── B2.1 Constants ────────────── */

const B2_SOURCE = "PCC";
const B2_TARGET = "A1";

// Path enumeration for communicability (precomputed simple paths PCC→A1, len≤6)
// All routes must end with X → S1 → A1 (only A1 SC neighbor is S1).
const B2_COMM_PATHS = [
  ["PCC", "IPL",   "S1", "A1"],                            // L=3 — primary
  ["PCC", "IPL",   "S1", "V1", "S1", "A1"],                // L=5 — detour via V1
  ["PCC", "mPFC",  "dlPFC", "PCC", "IPL", "S1", "A1"],     // L=6 — loop out front
  ["PCC", "dlPFC", "mPFC", "PCC", "IPL", "S1", "A1"],      // L=6 — alt loop
  ["PCC", "IPL",   "S1", "M1", "S1", "A1"],                // L=5 — detour via M1
  ["PCC", "IPL",   "S1", "Ins", "S1", "A1"]                // L=5 — detour via Ins
];

const B2_SHORTEST = B2_COMM_PATHS[0]; // PCC → IPL → S1 → A1

// Matrix axis order (group unimodal then transmodal — reads cleanly)
const B2_MATRIX_ORDER = ["V1", "V2", "A1", "S1", "M1", "Ins", "IPL", "ACC", "PCC", "dlPFC", "mPFC"];

// SC lookup → weight (undefined if no edge)
const SC_WEIGHT = new Map();
SC_EDGES.forEach(e => {
  SC_WEIGHT.set(`${e.source}|${e.target}`, e.weight);
  SC_WEIGHT.set(`${e.target}|${e.source}`, e.weight);
});
function scWeightBetween(a, b) { return SC_WEIGHT.get(`${a}|${b}`); }

// Edge key normaliser (canonical: alphabetically sorted endpoints)
function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

/* ────────────── B2.2 Render graph 2 ────────────── */

const svg2 = d3.select("#graph2");
const g2Hulls   = svg2.append("g").attr("class", "layer-hulls");
const g2Sc      = svg2.append("g").attr("class", "layer-sc");
const g2ScHit   = svg2.append("g").attr("class", "layer-sc-hit");
const g2Beams   = svg2.append("g").attr("class", "layer-beam");
const g2Halos   = svg2.append("g").attr("class", "layer-beam");
const g2Nodes   = svg2.append("g").attr("class", "layer-nodes");
const g2Labels  = svg2.append("g").attr("class", "layer-labels");

// Hulls
g2Hulls.append("path").attr("class", "cluster-hull").attr("d", clusterHull("unimodal"));
g2Hulls.append("path").attr("class", "cluster-hull").attr("d", clusterHull("transmodal"));

// SC edges (visual)
const sc2Sel = g2Sc.selectAll("line.sc-edge")
  .data(SC_EDGES, d => edgeKey(d.source, d.target))
  .join("line")
  .attr("class", "sc-edge")
  .attr("data-edge", d => edgeKey(d.source, d.target))
  .attr("x1", d => NODE_BY_ID.get(d.source).x)
  .attr("y1", d => NODE_BY_ID.get(d.source).y)
  .attr("x2", d => NODE_BY_ID.get(d.target).x)
  .attr("y2", d => NODE_BY_ID.get(d.target).y)
  .attr("stroke-width", d => 1.6 + d.weight * 1.6);

// Invisible-wider hit lines for hover linking (matrix ↔ edge)
const sc2HitSel = g2ScHit.selectAll("line.sc-hit")
  .data(SC_EDGES, d => edgeKey(d.source, d.target))
  .join("line")
  .attr("class", "sc-hit")
  .attr("data-edge", d => edgeKey(d.source, d.target))
  .attr("x1", d => NODE_BY_ID.get(d.source).x)
  .attr("y1", d => NODE_BY_ID.get(d.source).y)
  .attr("x2", d => NODE_BY_ID.get(d.target).x)
  .attr("y2", d => NODE_BY_ID.get(d.target).y);

// Nodes
const node2Sel = g2Nodes.selectAll("g.node")
  .data(NODES, d => d.id)
  .join("g")
  .attr("class", "node")
  .attr("transform", d => `translate(${d.x},${d.y})`);

node2Sel.append("circle")
  .attr("class", d => `node-ring is-${d.cluster}`)
  .attr("r", nodeRadius)
  .attr("data-id", d => d.id);

// Labels
const label2Sel = g2Labels.selectAll("text.node-label")
  .data(NODES, d => d.id)
  .join("text")
  .attr("class", "node-label")
  .attr("x", d => d.x + LABEL_OFFSET[d.id].dx)
  .attr("y", d => d.y + LABEL_OFFSET[d.id].dy)
  .attr("text-anchor", d => {
    const dx = LABEL_OFFSET[d.id].dx;
    if (dx <= -10) return "end";
    if (dx >=  10) return "start";
    return "middle";
  })
  .attr("dominant-baseline", "middle")
  .attr("data-id", d => d.id)
  .text(d => d.label);

/* ────────────── B2.3 (naming pills removed — step dropped) ────────────── */

/* ────────────── B2.4 Matrices (single A + dual A→B) ────────────── */

const M_PAD_L = 44;
const M_PAD_T = 44;
const M_SIZE  = 320;
const N_M     = B2_MATRIX_ORDER.length;
const M_CELL  = (M_SIZE - M_PAD_L - 10) / N_M;

const matColor = d3.scaleLinear()
  .domain([0, 0.4, 1])
  .range(["#F4F2EE", "#9C9A95", "#1A1A1C"])
  .clamp(true);

// ── Numeric adjacency matrix (in B2_MATRIX_ORDER order)
function buildAdjMatrix() {
  const A = Array.from({length: N_M}, () => new Array(N_M).fill(0));
  for (let i = 0; i < N_M; i++) for (let j = 0; j < N_M; j++) {
    if (i === j) continue;
    const w = scWeightBetween(B2_MATRIX_ORDER[i], B2_MATRIX_ORDER[j]);
    if (w != null) A[i][j] = w;
  }
  return A;
}
const A_MAT = buildAdjMatrix();

// ── Tiny linear-algebra helpers (N=11 — perf is not a concern)
const matIdent = n => Array.from({length: n}, (_, i) =>
  Array.from({length: n}, (_, j) => i === j ? 1 : 0));
function matMul(X, Y) {
  const n = X.length;
  const Z = Array.from({length: n}, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    const xik = X[i][k]; if (!xik) continue;
    for (let j = 0; j < n; j++) Z[i][j] += xik * Y[k][j];
  }
  return Z;
}
const matAdd   = (X, Y) => X.map((r, i) => r.map((v, j) => v + Y[i][j]));
const matScale = (X, s) => X.map(r => r.map(v => v * s));
const matZeroDiag = X => X.map((r, i) => r.map((v, j) => i === j ? 0 : v));
function normalizeMatrix(M) {
  let max = 0;
  for (const row of M) for (const v of row) if (v > max) max = v;
  if (!max) return M;
  return M.map(r => r.map(v => v / max));
}

// ── Predictions: turn sparse A into a full B for each model

// SPL — 1 / shortest-path-hops (BFS, ignores weights)
function predictSPL() {
  const B = Array.from({length: N_M}, () => new Array(N_M).fill(0));
  for (let i = 0; i < N_M; i++) {
    const start = B2_MATRIX_ORDER[i];
    const dist = new Map(B2_MATRIX_ORDER.map(id => [id, Infinity]));
    dist.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of SC_ADJ.get(cur)) {
        if (dist.get(nb) === Infinity) {
          dist.set(nb, dist.get(cur) + 1);
          queue.push(nb);
        }
      }
    }
    for (let j = 0; j < N_M; j++) {
      if (i === j) continue;
      const d = dist.get(B2_MATRIX_ORDER[j]);
      if (d !== Infinity && d > 0) B[i][j] = 1 / d;
    }
  }
  return normalizeMatrix(B);
}

// MFPT — illustrative: Dijkstra with cost = 1/weight; FC = 1/total-cost
function predictMFPT() {
  const B = Array.from({length: N_M}, () => new Array(N_M).fill(0));
  for (let i = 0; i < N_M; i++) {
    const start = B2_MATRIX_ORDER[i];
    const dist = new Map(B2_MATRIX_ORDER.map(id => [id, Infinity]));
    dist.set(start, 0);
    const visited = new Set();
    while (visited.size < N_M) {
      let cur = null, minD = Infinity;
      for (const [id, d] of dist) {
        if (!visited.has(id) && d < minD) { cur = id; minD = d; }
      }
      if (cur === null || minD === Infinity) break;
      visited.add(cur);
      for (const nb of SC_ADJ.get(cur)) {
        const w = scWeightBetween(cur, nb) || 0.1;
        const cost = 1 / w;
        if (dist.get(cur) + cost < dist.get(nb)) {
          dist.set(nb, dist.get(cur) + cost);
        }
      }
    }
    for (let j = 0; j < N_M; j++) {
      if (i === j) continue;
      const d = dist.get(B2_MATRIX_ORDER[j]);
      if (d !== Infinity && d > 0) B[i][j] = 1 / d;
    }
  }
  return normalizeMatrix(B);
}

// COMM — e^A (Taylor truncated at k=8 — converges fast for ||A|| < 1)
function predictCOMM() {
  let result = matIdent(N_M);
  let term   = matIdent(N_M);
  for (let k = 1; k <= 8; k++) {
    term = matScale(matMul(term, A_MAT), 1 / k);
    result = matAdd(result, term);
  }
  return normalizeMatrix(matZeroDiag(result));
}

const PRED = {
  shortest: predictSPL(),
  random:   predictMFPT(),
  comm:     predictCOMM()
};

const MODEL_SHORT = { shortest: "SPL", random: "MFPT", comm: "COMM" };

// ── Reusable matrix renderer
function renderMatrixInto(svgSel, weightForFn) {
  // Top axis labels
  svgSel.append("g").attr("class", "m-top-labels")
    .selectAll("text").data(B2_MATRIX_ORDER).join("text")
    .attr("class", "m-label")
    .attr("data-id", d => d)
    .attr("x", (_, i) => M_PAD_L + i * M_CELL + M_CELL / 2)
    .attr("y", M_PAD_T - 8)
    .attr("text-anchor", "middle")
    .text(d => d);
  // Left axis labels
  svgSel.append("g").attr("class", "m-left-labels")
    .selectAll("text").data(B2_MATRIX_ORDER).join("text")
    .attr("class", "m-label")
    .attr("data-id", d => d)
    .attr("x", M_PAD_L - 6)
    .attr("y", (_, i) => M_PAD_T + i * M_CELL + M_CELL / 2)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .text(d => d);
  // Axis titles
  svgSel.append("text").attr("class", "m-axis-title")
    .attr("x", M_PAD_L + (M_CELL * N_M) / 2)
    .attr("y", M_PAD_T - 26)
    .attr("text-anchor", "middle")
    .text("j  region →");
  svgSel.append("text").attr("class", "m-axis-title")
    .attr("x", 10)
    .attr("y", M_PAD_T + (M_CELL * N_M) / 2)
    .attr("text-anchor", "start")
    .attr("transform", `rotate(-90, 10, ${M_PAD_T + (M_CELL * N_M) / 2})`)
    .text("i  region ↓");

  // Cells
  const cells = [];
  for (let i = 0; i < N_M; i++) for (let j = 0; j < N_M; j++) {
    const r = B2_MATRIX_ORDER[i];
    const c = B2_MATRIX_ORDER[j];
    const w = (i === j) ? null : weightForFn(i, j, r, c);
    cells.push({ i, j, r, c, w, key: edgeKey(r, c), diag: (i === j) });
  }
  const cellSel = svgSel.append("g").attr("class", "m-cells")
    .selectAll("rect.m-cell")
    .data(cells)
    .join("rect")
    .attr("class", d => "m-cell" +
      (d.diag ? " is-diag" : "") +
      (d.w != null && d.w > 0 ? " has-edge" : ""))
    .attr("data-edge", d => d.diag ? "" : d.key)
    .attr("data-i", d => d.i)
    .attr("data-j", d => d.j)
    .attr("x", d => M_PAD_L + d.j * M_CELL)
    .attr("y", d => M_PAD_T + d.i * M_CELL)
    .attr("width",  M_CELL - 1)
    .attr("height", M_CELL - 1)
    .attr("fill", d => d.diag ? "transparent" : matColor(d.w || 0));

  function update(weightFn) {
    cells.forEach(c => {
      if (c.diag) return;
      c.w = weightFn(c.i, c.j, c.r, c.c);
    });
    cellSel
      .attr("class", d => "m-cell" +
        (d.diag ? " is-diag" : "") +
        (d.w != null && d.w > 0 ? " has-edge" : ""))
      .transition().duration(420).ease(d3.easeCubicInOut)
      .attr("fill", d => d.diag ? "transparent" : matColor(d.w || 0));
  }

  return { svgSel, cellSel, cells, update };
}

// ── Single matrix (step 2.2) — SC weights
const matSvg     = d3.select("#matrix");
const mat        = renderMatrixInto(matSvg, (i, j, r, c) => scWeightBetween(r, c) || 0);
const matCellSel = mat.cellSel;

// ── Dual matrices (step 2.1)
let b2ModelInit = "shortest";   // mirrors b2Model declared below
const matA = renderMatrixInto(d3.select("#matrix-a"),
  (i, j, r, c) => scWeightBetween(r, c) || 0);
const matB = renderMatrixInto(d3.select("#matrix-b"),
  (i, j) => PRED[b2ModelInit][i][j]);

/* ── Single-matrix hover linking (step 2.2): cell ↔ graph edge ── */
const matTipEl  = document.getElementById("b2-matrix-tip");
const matTipVal = document.getElementById("b2-matrix-tip-val");

function highlightEdge(key, on) {
  matCellSel.classed("is-active", c => on && !c.diag && c.key === key);
  sc2Sel.classed("is-active", e => on && edgeKey(e.source, e.target) === key);
  if (key) {
    const [a, b] = key.split("|");
    matSvg.selectAll(".m-label").classed("is-active", function() {
      const id = this.getAttribute("data-id");
      return on && (id === a || id === b);
    });
    label2Sel.classed("is-active", d => on && (d.id === a || d.id === b));
  } else {
    matSvg.selectAll(".m-label").classed("is-active", false);
    label2Sel.classed("is-active", false);
  }
}

matCellSel
  .on("mouseenter", function(_evt, d) {
    if (b2Step !== 5 || d.diag || !d.w) return;
    highlightEdge(d.key, true);
    matTipVal.textContent = d.w.toFixed(2);
    matTipEl.classList.add("is-visible");
  })
  .on("mouseleave", function(_evt, d) {
    if (b2Step !== 5) return;
    highlightEdge(d.key, false);
    matTipEl.classList.remove("is-visible");
  });

sc2HitSel
  .on("mouseenter", function(_evt, d) {
    if (b2Step !== 5) return;
    const key = edgeKey(d.source, d.target);
    highlightEdge(key, true);
    matTipVal.textContent = d.weight.toFixed(2);
    matTipEl.classList.add("is-visible");
  })
  .on("mouseleave", function(_evt, d) {
    if (b2Step !== 5) return;
    highlightEdge(edgeKey(d.source, d.target), false);
    matTipEl.classList.remove("is-visible");
  });

/* ── Dual-matrix cross-hover linking (step 2.1) ── */
const dualTipEl   = document.getElementById("b2-dual-tip");
const dualTipPair = document.getElementById("b2-dual-tip-pair");
const dualTipA    = document.getElementById("b2-dual-tip-a");
const dualTipB    = document.getElementById("b2-dual-tip-b");

function highlightDual(i, j, on) {
  matA.cellSel.classed("is-active", c => on && !c.diag && c.i === i && c.j === j);
  matB.cellSel.classed("is-active", c => on && !c.diag && c.i === i && c.j === j);
  const r = B2_MATRIX_ORDER[i];
  const c = B2_MATRIX_ORDER[j];
  [matA.svgSel, matB.svgSel].forEach(svgSel => {
    svgSel.selectAll(".m-label").classed("is-active", function() {
      const id = this.getAttribute("data-id");
      return on && (id === r || id === c);
    });
  });
}

function showDualTip(i, j) {
  const r = B2_MATRIX_ORDER[i];
  const c = B2_MATRIX_ORDER[j];
  const aVal = scWeightBetween(r, c) || 0;
  const bVal = PRED[b2Model][i][j];
  dualTipPair.textContent = `${r}  →  ${c}`;
  dualTipA.textContent = aVal.toFixed(2);
  dualTipB.textContent = bVal.toFixed(2);
  dualTipEl.classList.add("is-visible");
}

function hideDualTip() {
  dualTipEl.classList.remove("is-visible");
}

[matA, matB].forEach(m => {
  m.cellSel
    .on("mouseenter", function(_evt, d) {
      if (b2Step !== 7 || d.diag) return;
      highlightDual(d.i, d.j, true);
      showDualTip(d.i, d.j);
    })
    .on("mouseleave", function(_evt, d) {
      if (b2Step !== 7) return;
      highlightDual(d.i, d.j, false);
      hideDualTip();
    });
});

/* ────────────── B2.5 Model animations ────────────── */
//
// All three start at PCC, target A1.  Each clears the previous run's
// transient state before starting.

let b2Step      = 4;
let b2Model     = "shortest";
let b2Running   = false;
let b2Timeouts  = [];

function b2ClearTimers() {
  b2Timeouts.forEach(t => clearTimeout(t));
  b2Timeouts = [];
}

function b2ResetGraphState({ keepEndpoints = true } = {}) {
  b2ClearTimers();
  b2Running = false;
  sc2Sel.classed("is-dim", false).classed("is-path", false)
        .classed("is-active", false).classed("is-soft", false)
        .attr("stroke-opacity", null)
        .interrupt();
  node2Sel.select(".node-ring")
    .classed("is-dim", false).classed("is-active", false)
    .classed("is-lit", false)
    .classed("is-source", keepEndpoints && b2Step === 6 && true ? true : false)
    .classed("is-target", false)
    .interrupt();
  // Always apply source/target marks fresh below
  node2Sel.select(".node-ring")
    .classed("is-source", d => keepEndpoints && b2Step === 6 && d.id === B2_SOURCE)
    .classed("is-target", d => keepEndpoints && b2Step === 6 && d.id === B2_TARGET);
  label2Sel.classed("is-dim", false).classed("is-active", false).interrupt();
  g2Beams.selectAll(".beam").interrupt().remove();
  g2Halos.selectAll(".arrival-halo").interrupt().remove();
}

function runBeam2(aId, bId, durationMs, opts = {}) {
  const a = NODE_BY_ID.get(aId);
  const b = NODE_BY_ID.get(bId);
  const beam = g2Beams.append("circle")
    .attr("class", "beam is-running")
    .attr("r", opts.r || 5)
    .attr("cx", a.x).attr("cy", a.y)
    .style("opacity", opts.opacity != null ? opts.opacity : 1);

  return beam.transition()
    .duration(durationMs)
    .ease(d3.easeCubicInOut)
    .attr("cx", b.x).attr("cy", b.y)
    .end()
    .then(() => beam)
    .catch(() => beam);
}

// Light a path edge (amber stroke) for the duration of one hop
function tempLightEdge(aId, bId, durationMs) {
  const key = edgeKey(aId, bId);
  const sel = sc2Sel.filter(e => edgeKey(e.source, e.target) === key);
  sel.classed("is-path", true);
  const t = setTimeout(() => sel.classed("is-path", false), durationMs);
  b2Timeouts.push(t);
}

function dimAllExceptPath(pathSet, edgeSet) {
  sc2Sel
    .classed("is-dim", e => !edgeSet.has(edgeKey(e.source, e.target)))
    .classed("is-active", false);
  node2Sel.select(".node-ring")
    .classed("is-dim", d => !pathSet.has(d.id))
    .classed("is-source", d => d.id === B2_SOURCE && pathSet.has(d.id))
    .classed("is-target", d => d.id === B2_TARGET && pathSet.has(d.id));
  label2Sel
    .classed("is-dim", d => !pathSet.has(d.id))
    .classed("is-active", d => pathSet.has(d.id));
}

// ── (a) Shortest path
function playShortestPath() {
  b2ResetGraphState();
  b2Running = true;

  const path = B2_SHORTEST;
  const HOP = 300; // ms

  // Build sets
  const pathSet = new Set(path);
  const edgeSet = new Set();
  for (let i = 0; i < path.length - 1; i++) edgeSet.add(edgeKey(path[i], path[i + 1]));

  dimAllExceptPath(pathSet, edgeSet);
  d3.select(`#graph2 .node-ring[data-id="${path[0]}"]`).classed("is-lit", true);

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const t1 = setTimeout(() => {
      tempLightEdge(a, b, HOP + 80);
      runBeam2(a, b, HOP).then(beam => beam && beam.transition()
        .duration(180).attr("r", 1).style("opacity", 0).remove());
    }, i * HOP);
    const t2 = setTimeout(() => {
      d3.select(`#graph2 .node-ring[data-id="${b}"]`).classed("is-lit", true);
    }, (i + 1) * HOP - 30);
    b2Timeouts.push(t1, t2);
  }

  const totalMs = (path.length - 1) * HOP + 200;
  b2Timeouts.push(setTimeout(() => {
    showModelDesc("One route. Optimal — but brittle: if any hop breaks, communication fails.");
    b2Running = false;
  }, totalMs));
}

// ── (b) Random walk
function generateRandomWalk() {
  const MAX = 28;
  const path = [B2_SOURCE];
  let cur = B2_SOURCE;
  // Hidden bias toward A1 isn't needed; the schematic is small enough
  // that random walks reach A1 within ~10-15 hops most of the time.
  for (let i = 0; i < MAX; i++) {
    const neighbors = Array.from(SC_ADJ.get(cur));
    if (!neighbors.length) break;
    // Sample weighted by SC weights
    const weights = neighbors.map(n => scWeightBetween(cur, n) || 0.1);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pick = neighbors[0];
    for (let k = 0; k < neighbors.length; k++) {
      r -= weights[k];
      if (r <= 0) { pick = neighbors[k]; break; }
    }
    path.push(pick);
    cur = pick;
    if (cur === B2_TARGET) break;
  }
  // If walk didn't reach target, force final two hops (S1 → A1) to land it
  if (cur !== B2_TARGET) {
    if (cur !== "S1") path.push("S1");
    path.push("A1");
  }
  return path;
}

function playRandomWalk() {
  b2ResetGraphState();
  b2Running = true;

  const path = generateRandomWalk();
  const HOP = 400;

  // Visited nodes & edges accumulate over time
  const visited = new Set([path[0]]);
  const edgesUsed = new Set();

  // Initial state: all dim, source lit
  sc2Sel.classed("is-dim", true).classed("is-active", false);
  node2Sel.select(".node-ring").classed("is-dim", true);
  label2Sel.classed("is-dim", true);
  node2Sel.select(".node-ring")
    .classed("is-source", d => d.id === B2_SOURCE)
    .classed("is-target", d => d.id === B2_TARGET);
  d3.select(`#graph2 .node-ring[data-id="${B2_SOURCE}"]`)
    .classed("is-dim", false).classed("is-lit", true);
  d3.select(`#graph2 .node-label[data-id="${B2_SOURCE}"]`).classed("is-dim", false);
  d3.select(`#graph2 .node-label[data-id="${B2_TARGET}"]`).classed("is-dim", false);

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const t = setTimeout(() => {
      visited.add(b);
      edgesUsed.add(edgeKey(a, b));
      // Light the traversed edge softly (persisting trail)
      const key = edgeKey(a, b);
      sc2Sel.filter(e => edgeKey(e.source, e.target) === key)
        .classed("is-dim", false).classed("is-soft", true);
      // Undim visited nodes
      d3.select(`#graph2 .node-ring[data-id="${b}"]`).classed("is-dim", false);
      d3.select(`#graph2 .node-label[data-id="${b}"]`).classed("is-dim", false);
      // Run the particle
      tempLightEdge(a, b, HOP + 40);
      runBeam2(a, b, HOP).then(beam => beam && beam.transition()
        .duration(160).attr("r", 1).style("opacity", 0).remove());
    }, i * HOP);
    b2Timeouts.push(t);
  }

  // Arrival glow
  const totalMs = (path.length - 1) * HOP;
  b2Timeouts.push(setTimeout(() => {
    const a1 = NODE_BY_ID.get(B2_TARGET);
    g2Halos.append("circle")
      .attr("class", "arrival-halo")
      .attr("cx", a1.x).attr("cy", a1.y).attr("r", 8)
      .style("opacity", 0.6)
      .transition().duration(700).attr("r", 32).style("opacity", 0).remove();
    d3.select(`#graph2 .node-ring[data-id="${B2_TARGET}"]`).classed("is-lit", true);
    showModelDesc(`No map needed. The signal drifts along weights until it arrives — slower (${path.length - 1} hops here), but reaches everywhere.`);
    b2Running = false;
  }, totalMs + 150));
}

// ── (c) Communicability — simultaneous waves on multiple paths
function playCommunicability() {
  b2ResetGraphState();
  b2Running = true;

  // Initial: dim everything, mark endpoints
  sc2Sel.classed("is-dim", true);
  node2Sel.select(".node-ring").classed("is-dim", true);
  label2Sel.classed("is-dim", true);
  node2Sel.select(".node-ring")
    .classed("is-source", d => d.id === B2_SOURCE)
    .classed("is-target", d => d.id === B2_TARGET);
  d3.select(`#graph2 .node-ring[data-id="${B2_SOURCE}"]`).classed("is-dim", false).classed("is-lit", true);
  d3.select(`#graph2 .node-ring[data-id="${B2_TARGET}"]`).classed("is-dim", false);
  d3.select(`#graph2 .node-label[data-id="${B2_SOURCE}"]`).classed("is-dim", false);
  d3.select(`#graph2 .node-label[data-id="${B2_TARGET}"]`).classed("is-dim", false);

  const HOP = 320;

  // Soft-light every edge used in any path so the structure stays legible
  const allEdges = new Set();
  B2_COMM_PATHS.forEach(p => {
    for (let i = 0; i < p.length - 1; i++) allEdges.add(edgeKey(p[i], p[i + 1]));
  });
  sc2Sel.filter(e => allEdges.has(edgeKey(e.source, e.target)))
    .classed("is-dim", false).classed("is-soft", true);
  // Undim intermediate-path nodes & labels
  const allNodes = new Set();
  B2_COMM_PATHS.forEach(p => p.forEach(n => allNodes.add(n)));
  allNodes.forEach(id => {
    d3.select(`#graph2 .node-ring[data-id="${id}"]`).classed("is-dim", false);
    d3.select(`#graph2 .node-label[data-id="${id}"]`).classed("is-dim", false);
  });

  // For each path, fire a wave: opacity = factorial-ish weighting → 1 / (L-2)!
  // Cap L so we don't run forever.
  let arrivalsLogged = 0;
  B2_COMM_PATHS.forEach((path, idx) => {
    const L = path.length - 1;
    // Brightness: short paths brightest
    const opacity = Math.min(1, 1 / Math.max(1, Math.pow(L - 2, 1.3)));
    const radius = 6 - Math.min(3, L - 3);
    const hopDur = HOP; // same per hop; total path time = HOP * L

    for (let i = 0; i < L; i++) {
      const a = path[i], b = path[i + 1];
      const t = setTimeout(() => {
        // Soft-light the edge briefly during traversal
        tempLightEdge(a, b, hopDur + 30);
        runBeam2(a, b, hopDur, { r: Math.max(2.5, radius), opacity })
          .then(beam => beam && beam.transition()
            .duration(160).attr("r", 1).style("opacity", 0).remove());
      }, i * hopDur + idx * 60); // stagger paths a tad so they don't perfectly stack
      b2Timeouts.push(t);
    }

    // Arrival pulse at A1
    const arriveAt = L * hopDur + idx * 60;
    b2Timeouts.push(setTimeout(() => {
      const target = NODE_BY_ID.get(B2_TARGET);
      g2Halos.append("circle")
        .attr("class", "arrival-halo")
        .attr("cx", target.x).attr("cy", target.y)
        .attr("r", 6)
        .style("opacity", opacity * 0.7)
        .transition().duration(900).attr("r", 22 + L * 4).style("opacity", 0).remove();
      arrivalsLogged++;
      if (arrivalsLogged === 1) {
        d3.select(`#graph2 .node-ring[data-id="${B2_TARGET}"]`).classed("is-lit", true);
      }
    }, arriveAt));
  });

  // Total time = longest path
  const maxLen = Math.max(...B2_COMM_PATHS.map(p => p.length - 1));
  const totalMs = maxLen * HOP + (B2_COMM_PATHS.length - 1) * 60 + 400;
  b2Timeouts.push(setTimeout(() => {
    showModelDesc("Every path at once. The total volume of signal arriving at the destination reflects all possible routes, not just one.");
    b2Running = false;
  }, totalMs));
}

const MODEL_FNS = {
  shortest: playShortestPath,
  random:   playRandomWalk,
  comm:     playCommunicability
};

const MODEL_LABELS = {
  shortest: "SHORTEST PATH",
  random:   "RANDOM WALK",
  comm:     "COMMUNICABILITY"
};

function showModelDesc(text) {
  const el = document.getElementById("b2-model-desc");
  el.textContent = text;
  el.classList.add("is-visible");
}
function hideModelDesc() {
  const el = document.getElementById("b2-model-desc");
  el.classList.remove("is-visible");
  el.textContent = "";
}

function setModel(name) {
  // State setter only — sync both toggle UIs + readout. No side-effects.
  b2Model = name;
  b2ModelInit = name; // keep cached default in sync
  document.querySelectorAll(".b2-model-btn").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.model === name);
  });
  document.querySelectorAll(".b2-mini-btn").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.model === name);
  });
  document.getElementById("readout2-model").textContent = MODEL_SHORT[name];
}

// User-triggered model change. Side-effect depends on step.
function changeModel(name) {
  if (b2Running) return;
  setModel(name);
  if (b2Step === 7) {
    matB.update((i, j) => PRED[name][i][j]);
    // If a cell is being hovered, refresh its B value in the tooltip
    if (dualTipEl.classList.contains("is-visible") && dualHoverIJ) {
      showDualTip(dualHoverIJ.i, dualHoverIJ.j);
    }
  } else if (b2Step === 6) {
    hideModelDesc();
    (MODEL_FNS[name] || playShortestPath)();
  }
}

// Wire BOTH toggle UIs to changeModel
document.querySelectorAll(".b2-model-btn, .b2-mini-btn").forEach(btn => {
  btn.addEventListener("click", () => changeModel(btn.dataset.model));
});

// Track which cell is hovered in dual matrix, for tooltip refresh on model swap
let dualHoverIJ = null;
[matA, matB].forEach(m => {
  m.cellSel
    .on("mouseenter.tip", function(_evt, d) {
      if (d.diag) return;
      dualHoverIJ = { i: d.i, j: d.j };
    })
    .on("mouseleave.tip", function() {
      dualHoverIJ = null;
    });
});

document.getElementById("b2-replay").addEventListener("click", () => {
  if (b2Step !== 6) return;
  hideModelDesc();
  (MODEL_FNS[b2Model] || playShortestPath)();
});

/* ────────────── B2.6 Step controller ────────────── */

function setStep2(step) {
  b2Step = step;

  // Always: clear transient anim state, hide tooltips
  b2ClearTimers();
  b2Running = false;
  g2Beams.selectAll(".beam").interrupt().remove();
  g2Halos.selectAll(".arrival-halo").interrupt().remove();
  sc2Sel.classed("is-dim", false).classed("is-path", false)
        .classed("is-active", false).classed("is-soft", false);
  node2Sel.select(".node-ring")
    .classed("is-dim", false).classed("is-active", false)
    .classed("is-lit", false).classed("is-source", false).classed("is-target", false);
  label2Sel.classed("is-dim", false).classed("is-active", false);
  matTipEl.classList.remove("is-visible");
  matCellSel.classed("is-active", false);
  matSvg.selectAll(".m-label").classed("is-active", false);
  hideDualTip();
  matA.cellSel.classed("is-active", false);
  matB.cellSel.classed("is-active", false);
  matA.svgSel.selectAll(".m-label").classed("is-active", false);
  matB.svgSel.selectAll(".m-label").classed("is-active", false);

  const dual         = document.getElementById("b2-dual");
  const stage        = document.getElementById("b2-stage");
  const matrixWrap   = document.getElementById("b2-matrix-wrap");
  const models       = document.getElementById("b2-models");
  const replay       = document.getElementById("b2-replay");
  const readoutState = document.getElementById("readout2-state");
  const frame        = document.getElementById("frame-beat-2");

  // Hulls: visible on 2.1 (matrix+graph step)
  g2Hulls.selectAll(".cluster-hull").classed("is-shown", step === 5);

  // Default visibility flags
  dual.classList.remove("is-visible");
  dual.setAttribute("aria-hidden", "true");
  stage.classList.remove("is-active", "is-split", "is-static");
  stage.setAttribute("aria-hidden", "true");
  matrixWrap.classList.remove("is-visible");
  matrixWrap.setAttribute("aria-hidden", "true");
  models.classList.remove("is-visible");
  models.setAttribute("aria-hidden", "true");
  replay.classList.remove("is-visible");
  frame.classList.remove("is-disclaimer-on");
  hideModelDesc();

  if (step === 5) {
    // 2.2 — Single matrix + graph with hover linking
    readoutState.textContent = "MATRIX · A";
    stage.classList.add("is-active", "is-split");
    stage.setAttribute("aria-hidden", "false");
    matrixWrap.classList.add("is-visible");
    matrixWrap.setAttribute("aria-hidden", "false");
    frame.classList.add("is-disclaimer-on");
  }
  else if (step === 6) {
    // 2.3 — Graph + model animation
    readoutState.textContent = "MODELS";
    stage.classList.add("is-active");
    stage.setAttribute("aria-hidden", "false");
    models.classList.add("is-visible");
    models.setAttribute("aria-hidden", "false");
    replay.classList.add("is-visible");
    b2Timeouts.push(setTimeout(() => {
      (MODEL_FNS[b2Model] || playShortestPath)();
    }, 320));
  }
  else if (step === 7) {
    // 2.4 — Dual matrix A → B
    readoutState.textContent = "A → B";
    dual.classList.add("is-visible");
    dual.setAttribute("aria-hidden", "false");
    matB.update((i, j) => PRED[b2Model][i][j]);
  }
}

/* ────────────── B2.7 Scrollama for beat 2 ────────────── */
const scroller2 = scrollama();
scroller2
  .setup({
    step: "#scrolly-beat-2 .step",
    offset: 0.55,
    debug: false
  })
  .onStepEnter(({ element }) => {
    element.classList.add('is-active'); // ADD THIS
    const step = +element.dataset.step;
    setStep2(step);
  })
  .onStepExit(({ element }) => {
    element.classList.remove('is-active'); // ADD THIS
  });

window.addEventListener("resize", () => scroller2.resize());

// Init beat 2 in step 5 (first actual step after dropping 2.1)
setStep2(5);

/* ═════════════════════════════════════════════════════════════
   BEAT 3 — What SFC Measures  (steps 8–10)
   ═════════════════════════════════════════════════════════════ */

/* ── B3.1 Data ── */

// Synthetic actual FC: MFPT-predicted + systematic transmodal boost + cross-cluster dip.
// Indices 0-4 = unimodal (V1,V2,A1,S1,M1), 5-10 = transmodal (Ins,IPL,ACC,PCC,dlPFC,mPFC).
function buildActualFC() {
  const fc = PRED["random"].map(row => [...row]);
  for (let i = 0; i < N_M; i++) {
    for (let j = 0; j < N_M; j++) {
      if (i === j) continue;
      if (i >= 5 && j >= 5)        fc[i][j] = Math.min(0.98, fc[i][j] + 0.22); // trans-trans: FC > pred
      else if ((i < 5) !== (j < 5)) fc[i][j] = Math.max(0.02, fc[i][j] - 0.08); // cross: FC < pred
    }
  }
  return fc; // not renormalised — preserves comparability with PRED["random"]
}
const FC_ACTUAL = buildActualFC();

const SFC_DATA = {
  V1:    { score: 0.22, level: "High SFC",   desc: "Visual cortex — anatomy built for its job." },
  V2:    { score: 0.20, level: "High SFC",   desc: "Secondary visual area, tightly constrained." },
  A1:    { score: 0.18, level: "High SFC",   desc: "Auditory cortex, structurally tethered." },
  S1:    { score: 0.21, level: "High SFC",   desc: "Somatosensory cortex — strongest structural constraint." },
  M1:    { score: 0.19, level: "High SFC",   desc: "Motor cortex — structure drives function." },
  Ins:   { score: 0.11, level: "Medium SFC", desc: "Insula — bridging sensation and cognition." },
  IPL:   { score: 0.09, level: "Medium SFC", desc: "Inferior parietal — association area." },
  ACC:   { score: 0.06, level: "Low SFC",    desc: "Anterior cingulate — flexible and integrative." },
  PCC:   { score: 0.04, level: "Low SFC",    desc: "DMN hub — function decoupled from anatomy." },
  dlPFC: { score: 0.05, level: "Low SFC",    desc: "Prefrontal cortex — structurally flexible." },
  mPFC:  { score: 0.03, level: "Low SFC",    desc: "Medial PFC — lowest structural constraint." }
};

// function pearson(a, b) {
//   const n = a.length;
//   const ma = a.reduce((s, v) => s + v, 0) / n;
//   const mb = b.reduce((s, v) => s + v, 0) / n;
//   let num = 0, da2 = 0, db2 = 0;
//   for (let k = 0; k < n; k++) {
//     num += (a[k] - ma) * (b[k] - mb);
//     da2 += (a[k] - ma) ** 2;
//     db2 += (b[k] - mb) ** 2;
//   }
//   return (da2 && db2) ? num / Math.sqrt(da2 * db2) : 0;
// }

// function computeSfcScore(regionId) {
//   const idx = B2_MATRIX_ORDER.indexOf(regionId);
//   const predRow   = PRED["random"][idx].filter((_, j) => j !== idx);
//   const actualRow = FC_ACTUAL[idx].filter((_, j) => j !== idx);
//   return Math.max(0, pearson(predRow, actualRow));
// }

/* ── B3.2 Matrices ── */

const b3MatPred   = renderMatrixInto(d3.select("#b3-matrix-pred"),   (i, j) => PRED["random"][i][j]);
const b3MatActual = renderMatrixInto(d3.select("#b3-matrix-actual"), (i, j) => FC_ACTUAL[i][j]);

// Precompute gap cell set (|actual - pred| > threshold)
const B3_GAP_THRESH = 0.10;
const b3GapSet = new Set();
b3MatPred.cells.forEach(c => {
  if (c.diag) return;
  if (Math.abs(FC_ACTUAL[c.i][c.j] - PRED["random"][c.i][c.j]) > B3_GAP_THRESH)
    b3GapSet.add(`${c.i}|${c.j}`);
});

function applyGapGlow() {
  [b3MatPred, b3MatActual].forEach(m =>
    m.cellSel.classed("is-gap", c => !c.diag && b3GapSet.has(`${c.i}|${c.j}`))
  );
}
function clearGapGlow() {
  [b3MatPred, b3MatActual].forEach(m => m.cellSel.classed("is-gap", false));
}

// Cross-hover linking
const b3TipEl     = document.getElementById("b3-tip");
const b3TipPair   = document.getElementById("b3-tip-pair");
const b3TipPred   = document.getElementById("b3-tip-pred");
const b3TipActual = document.getElementById("b3-tip-actual");

function highlightB3Pair(i, j, on) {
  [b3MatPred, b3MatActual].forEach(m => {
    m.cellSel.classed("is-active", c => on && !c.diag && c.i === i && c.j === j);
    m.svgSel.selectAll(".m-label").classed("is-active", function() {
      if (!on) return false;
      const id = this.getAttribute("data-id");
      return id === B2_MATRIX_ORDER[i] || id === B2_MATRIX_ORDER[j];
    });
  });
}

[b3MatPred, b3MatActual].forEach(m => {
  m.cellSel
    .on("mouseenter", function(_evt, d) {
      if (b3Step > 9 || d.diag) return;
      highlightB3Pair(d.i, d.j, true);
      b3TipPair.textContent   = `${B2_MATRIX_ORDER[d.i]} → ${B2_MATRIX_ORDER[d.j]}`;
      b3TipPred.textContent   = PRED["random"][d.i][d.j].toFixed(2);
      b3TipActual.textContent = FC_ACTUAL[d.i][d.j].toFixed(2);
      b3TipEl.classList.add("is-visible");
      b3TipEl.setAttribute("aria-hidden", "false");
    })
    .on("mouseleave", function(_evt, d) {
      if (b3Step > 9) return;
      highlightB3Pair(d.i, d.j, false);
      b3TipEl.classList.remove("is-visible");
      b3TipEl.setAttribute("aria-hidden", "true");
    });
});

/* ── B3.3 Region row highlight (step 3.2) ── */

let b3ActiveRegion = "S1";

function highlightRegionRow(regionId) {
  b3ActiveRegion = regionId;
  const idx = B2_MATRIX_ORDER.indexOf(regionId);
  
  [b3MatPred, b3MatActual].forEach(m =>
    m.cellSel.classed("is-row-sel", c => !c.diag && (c.i === idx || c.j === idx))
  );
  
  // Pull the realistic score from our dictionary
  const r = SFC_DATA[regionId].score;
  
  // Normalize the bar width relative to a realistic maximum (e.g., 0.25)
  const maxRealisticScore = 0.25; 
  const pct = Math.min(100, Math.round((r / maxRealisticScore) * 100));
  
  document.getElementById("b3-score-fill").style.width = pct + "%";
  document.getElementById("b3-score-val").textContent  = r.toFixed(2);
  
  document.querySelectorAll(".b3-region-btn").forEach(btn =>
    btn.classList.toggle("is-active", btn.dataset.region === regionId)
  );
}

document.querySelectorAll(".b3-region-btn").forEach(btn =>
  btn.addEventListener("click", () => highlightRegionRow(btn.dataset.region))
);

/* ── B3.4 Gradient graph (#graph3) ── */

const svg3      = d3.select("#graph3");
const g3Hulls   = svg3.append("g").attr("class", "layer-hulls");
const g3Sc      = svg3.append("g").attr("class", "layer-sc");
const g3Nodes   = svg3.append("g").attr("class", "layer-nodes");
const g3Labels  = svg3.append("g").attr("class", "layer-labels");

g3Hulls.append("path").attr("class", "cluster-hull").attr("d", clusterHull("unimodal"));
g3Hulls.append("path").attr("class", "cluster-hull").attr("d", clusterHull("transmodal"));

g3Sc.selectAll("line.sc-edge")
  .data(SC_EDGES)
  .join("line")
  .attr("class", "sc-edge")
  .attr("x1", d => NODE_BY_ID.get(d.source).x)
  .attr("y1", d => NODE_BY_ID.get(d.source).y)
  .attr("x2", d => NODE_BY_ID.get(d.target).x)
  .attr("y2", d => NODE_BY_ID.get(d.target).y)
  .attr("stroke-width", d => 1.4 + d.weight * 1.2);

const node3Sel = g3Nodes.selectAll("g.node")
  .data(NODES, d => d.id)
  .join("g")
  .attr("class", "node")
  .attr("transform", d => `translate(${d.x},${d.y})`);

node3Sel.append("circle")
  .attr("class", "node-ring")
  .attr("r", nodeRadius)
  .attr("data-id", d => d.id);

const label3Sel = g3Labels.selectAll("text.node-label")
  .data(NODES, d => d.id)
  .join("text")
  .attr("class", "node-label")
  .attr("x", d => d.x + LABEL_OFFSET[d.id].dx)
  .attr("y", d => d.y + LABEL_OFFSET[d.id].dy)
  .attr("text-anchor", d => {
    const dx = LABEL_OFFSET[d.id].dx;
    return dx <= -10 ? "end" : dx >= 10 ? "start" : "middle";
  })
  .attr("dominant-baseline", "middle")
  .attr("data-id", d => d.id)
  .text(d => d.label);

const sfcColor = d3.scaleLinear()
  // CHANGED: Domain clamped to realistic Low -> Medium -> High scores
  .domain([0.03, 0.11, 0.22]) 
  .range(["#6B9FD4", "#9C9A95", "#F97316"])
  .clamp(true);

function applyGradientColors() {
  node3Sel.select(".node-ring")
    .transition().duration(750).ease(d3.easeCubicInOut)
    .style("fill",   d => sfcColor(SFC_DATA[d.id].score))
    .attr("stroke",  d => sfcColor(SFC_DATA[d.id].score))
    .classed("is-coloured", true);
}

function resetGradientColors() {
  node3Sel.select(".node-ring")
    .interrupt()
    .style("fill", null)
    .attr("stroke", null)
    .classed("is-coloured", false)
    .classed("is-active", false)
    .classed("is-dim", false);
}

// Gradient hover
const gtipEl   = document.getElementById("b3-gradient-tip");
const gtLabel  = document.getElementById("b3-gt-label");
const gtSfc    = document.getElementById("b3-gt-sfc");
const gtDesc   = document.getElementById("b3-gt-desc");

node3Sel.select(".node-ring")
  .on("mouseenter", function(_evt, d) {
    if (b3Step !== 10) return;
    const data = SFC_DATA[d.id];
    gtLabel.textContent = d.label;
    gtSfc.textContent   = `${data.level} · ${data.score.toFixed(2)}`;
    gtDesc.textContent  = data.desc;
    gtipEl.style.borderLeftColor = sfcColor(data.score);
    gtSfc.style.color            = sfcColor(data.score);
    gtipEl.classList.add("is-visible");
    gtipEl.setAttribute("aria-hidden", "false");
    node3Sel.select(".node-ring").classed("is-dim", n => n.id !== d.id);
    label3Sel.classed("is-dim", n => n.id !== d.id).classed("is-active", n => n.id === d.id);
  })
  .on("mouseleave", function() {
    if (b3Step !== 10) return;
    gtipEl.classList.remove("is-visible");
    gtipEl.setAttribute("aria-hidden", "true");
    node3Sel.select(".node-ring").classed("is-dim", false);
    label3Sel.classed("is-dim", false).classed("is-active", false);
  });

/* ── B3.5 Step controller ── */

let b3Step     = 8;
let b3Timeouts = [];
function b3ClearTimers() { b3Timeouts.forEach(clearTimeout); b3Timeouts = []; }

const compareEl   = document.getElementById("b3-compare");
const actualSvgEl = document.getElementById("b3-matrix-actual");
const regionSelEl = document.getElementById("b3-region-sel");
const scoreBarEl  = document.getElementById("b3-score-bar");
const gradWrapEl  = document.getElementById("b3-gradient-wrap");

function setStep3(step) {
  b3Step = step;
  b3ClearTimers();

  // Reset all panels
  compareEl.classList.remove("is-visible");
  compareEl.setAttribute("aria-hidden", "true");
  regionSelEl.classList.remove("is-visible");
  regionSelEl.setAttribute("aria-hidden", "true");
  scoreBarEl.classList.remove("is-visible");
  scoreBarEl.setAttribute("aria-hidden", "true");
  gradWrapEl.classList.remove("is-visible");
  gradWrapEl.setAttribute("aria-hidden", "true");
  gtipEl.classList.remove("is-visible");
  gtipEl.setAttribute("aria-hidden", "true");
  b3TipEl.classList.remove("is-visible");
  b3TipEl.setAttribute("aria-hidden", "true");
  clearGapGlow();
  [b3MatPred, b3MatActual].forEach(m =>
    m.cellSel.classed("is-row-sel", false).classed("is-active", false)
  );
  resetGradientColors();
  g3Hulls.selectAll(".cluster-hull").classed("is-shown", false);

  const readout = document.getElementById("readout3-state");

  if (step === 8) {
    readout.textContent = "COMPARE";
    compareEl.classList.add("is-visible");
    compareEl.setAttribute("aria-hidden", "false");
    actualSvgEl.classList.remove("is-hidden");
    b3Timeouts.push(setTimeout(() => applyGapGlow(), 400));
  }
  else if (step === 9) {
    readout.textContent = "REGION";
    compareEl.classList.add("is-visible");
    compareEl.setAttribute("aria-hidden", "false");
    actualSvgEl.classList.remove("is-hidden");
    // gap glow intentionally cleared — row highlights replace it in this step
    regionSelEl.classList.add("is-visible");
    regionSelEl.setAttribute("aria-hidden", "false");
    scoreBarEl.classList.add("is-visible");
    scoreBarEl.setAttribute("aria-hidden", "false");
    b3Timeouts.push(setTimeout(() => highlightRegionRow(b3ActiveRegion), 180));
  }
  else if (step === 10) {
    readout.textContent = "GRADIENT";
    gradWrapEl.classList.add("is-visible");
    gradWrapEl.setAttribute("aria-hidden", "false");
    g3Hulls.selectAll(".cluster-hull").classed("is-shown", true);
    b3Timeouts.push(setTimeout(applyGradientColors, 260));
  }
}

/* ── B3.6 Scrollama ── */
const scroller3 = scrollama();
scroller3
  .setup({ step: "#scrolly-beat-3 .step", offset: 0.55, debug: false })
  .onStepEnter(({ element }) => {
    element.classList.add('is-active'); // ADD THIS
    setStep3(+element.dataset.step);
  })
  .onStepExit(({ element }) => {
    element.classList.remove('is-active'); // ADD THIS
  });

window.addEventListener("resize", () => scroller3.resize());

/* =========================================
   REVEAL OBSERVER (Intros & Graphics)
   ========================================= */
const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-revealed');
      // Unobserve so it only fades in once
      observer.unobserve(entry.target);
    }
  });
}, {
  root: null,
  rootMargin: '0px',
  threshold: 0.15 // Triggers when 15% of the element enters the screen
});

// Attach it to Intros, Sticky Graphics
document
  .querySelectorAll('.intro, .figure-container')
  .forEach(el => {
    revealObserver.observe(el);
  });