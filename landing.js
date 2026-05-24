(() => {
  const landingEl = document.getElementById('landing');
  const canvas = document.getElementById('landing-canvas');
  const ctx = canvas.getContext('2d');
  const copyEl = document.querySelector('.landing-copy');

  let width, height, dpr, scale, ox, oy;
  let nodes = [], edges = [], particles = [];
  let triggerNode = null;
  
  // Expanded timeline states
  let phase = 'idle'; // 'idle', 'sparks', 'hold', 'dawn', 'completed'
  let dawnProgress = 0;
  let dawnStartTime = 0;

  const NODE_COUNT = 400;
  const MAX_EDGES_PER_NODE = 3;
  const MAX_EDGE_RADIUS = 120;
  
  const DARK_RGB = [14, 14, 15];
  const PAPER_RGB = [250, 250, 250];
  const ORANGE = '#F97316';

  // 1. Tell the browser NOT to restore scroll position on refresh
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  // 2. Force the page to the absolute top before drawing anything
  window.scrollTo(0, 0);

  // 3. Bulletproof scroll lock (requires both HTML and BODY)
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    scale = Math.max(width / 800, height / 800) * 1.1; 
    ox = (width - 800 * scale) / 2;
    oy = (height - 800 * scale) / 2;
  }

  function generateNodesAndEdges() {
    nodes = [];
    edges = [];
    
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({ 
        id: i, 
        x: Math.random() * 800, 
        y: Math.random() * 800, 
        lit: false, 
        neighbors: [],
        distances: [] 
      });
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        nodes[i].distances.push({ id: j, d });
        nodes[j].distances.push({ id: i, d });
      }
    }

    const connectedEdges = new Set();
    nodes.forEach(n => {
      n.distances.sort((a, b) => a.d - b.d);
      let edgeCount = 0;
      
      for (let k = 0; k < n.distances.length; k++) {
        if (edgeCount >= MAX_EDGES_PER_NODE) break;
        const target = n.distances[k];
        
        if (target.d < MAX_EDGE_RADIUS) {
          const key = n.id < target.id ? `${n.id}-${target.id}` : `${target.id}-${n.id}`;
          if (!connectedEdges.has(key)) {
            connectedEdges.add(key);
            edges.push({ a: n, b: nodes[target.id] });
            n.neighbors.push(target.id);
            nodes[target.id].neighbors.push(n.id);
          }
          edgeCount++;
        }
      }
    });
  }

  function pickTrigger() {
    let minDist = Infinity;
    const tx = 260, ty = 280; 
    nodes.forEach(n => {
      const d = Math.hypot(n.x - tx, n.y - ty);
      if (d < minDist) {
        minDist = d;
        triggerNode = n;
      }
    });
  }

  let animationIds = [];
  let pulsePhase = 0;

  function draw() {
    // Hardware-agnostic linear fade calculation
    if (phase === 'dawn' || phase === 'completed') {
      if (phase === 'dawn' && dawnStartTime === 0) {
        dawnStartTime = performance.now();
      }
      if (dawnStartTime > 0) {
        const elapsed = performance.now() - dawnStartTime;
        dawnProgress = Math.min(1, elapsed / 2000); // Strict 2000ms duration
      }
      if (phase === 'completed') {
        dawnProgress = 1;
      }
    }

    const currR = Math.round(DARK_RGB[0] + dawnProgress * (PAPER_RGB[0] - DARK_RGB[0]));
    const currG = Math.round(DARK_RGB[1] + dawnProgress * (PAPER_RGB[1] - DARK_RGB[1]));
    const currB = Math.round(DARK_RGB[2] + dawnProgress * (PAPER_RGB[2] - DARK_RGB[2]));
    
    ctx.fillStyle = `rgb(${currR},${currG},${currB})`;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // Edges
    ctx.lineWidth = 1;
    edges.forEach(e => {
      const isLit = e.a.lit && e.b.lit;
      const globalFade = 1 - dawnProgress;
      
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      
      if (isLit) {
        ctx.strokeStyle = `rgba(0, 0, 0, ${ (0.05 + dawnProgress * 0.1) * globalFade })`;
      } else {
        ctx.strokeStyle = `rgba(255, 255, 255, ${ 0.05 * globalFade })`;
      }
      ctx.stroke();
    });

    // Nodes
    const minRadius = Math.max(1.2, 1.2 / scale);
    nodes.forEach(n => {
      const globalFade = 1 - dawnProgress;
      ctx.beginPath();
      ctx.arc(n.x, n.y, minRadius, 0, Math.PI * 2);
      
      if (n.lit) {
        const r = Math.round(255 - (dawnProgress * 230));
        const g = Math.round(255 - (dawnProgress * 230));
        const b = Math.round(255 - (dawnProgress * 230));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.8 * globalFade})`;
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.12 * globalFade})`;
      }
      ctx.fill();
    });

    // Trigger pulse (State 0)
    if (phase === 'idle' && triggerNode) {
      pulsePhase += 0.015; 
      const r = 2 + Math.sin(pulsePhase) * 1.5;
      
      ctx.beginPath();
      ctx.arc(triggerNode.x, triggerNode.y, r, 0, Math.PI * 2);
      ctx.fillStyle = ORANGE;
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(triggerNode.x, triggerNode.y, r * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(249, 115, 22, ${0.5 - Math.sin(pulsePhase) * 0.5})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Particles
    const pRadius = Math.max(1.5, 1.5 / scale);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += p.speed;
      if (p.t >= 1) {
        particles.splice(i, 1);
        continue;
      }
      const x = p.startX + (p.endX - p.startX) * p.t;
      const y = p.startY + (p.endY - p.startY) * p.t;
      
      ctx.beginPath();
      ctx.arc(x, y, pRadius, 0, Math.PI * 2);
      ctx.fillStyle = ORANGE;
      ctx.fill();
    }

    ctx.restore();

    if (phase === 'completed' && dawnProgress >= 1 && particles.length === 0) {
      return; 
    }
    
    requestAnimationFrame(draw);
  }

  function startPropagation() {
    phase = 'sparks';
    triggerNode.lit = true;

    const queue = [{ id: triggerNode.id, parent: null }];
    const visited = new Set([triggerNode.id]);
    const schedule = [];
    const distances = new Map();
    let maxDist = 0;

    // Pass 1: Map the network BFS depth to establish timeline bounds
    while(queue.length > 0) {
      const { id, parent } = queue.shift();
      const node = nodes[id];

      const distFromTrigger = Math.hypot(node.x - triggerNode.x, node.y - triggerNode.y);
      if (distFromTrigger > maxDist) maxDist = distFromTrigger;
      
      distances.set(id, { parent, distFromTrigger });

      node.neighbors.forEach(nb => {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push({ id: nb, parent: id });
        }
      });
    }

    // Pass 2: Schedule sparks normalized to a 3.6-second window
    distances.forEach(({ parent, distFromTrigger }, id) => {
      // Normalizing delays based on max distance ensures we fill the timeframe
      const baseTime = (distFromTrigger / maxDist) * 3600; 
      const jitter = (Math.random() - 0.5) * 300; // Organic +/- variance
      const delay = Math.max(0, baseTime + jitter);
      
      schedule.push({ id, parent, time: delay });
    });

    // Execute schedules
    schedule.forEach(task => {
      if (task.id === triggerNode.id) return;

      const tid = setTimeout(() => {
        // Only run if we haven't skipped/completed
        if (phase !== 'sparks' && phase !== 'hold') return; 
        
        const n = nodes[task.id];
        n.lit = true;
        
        if (task.parent !== null) {
          const p = nodes[task.parent];
          const dist = Math.hypot(n.x - p.x, n.y - p.y);
          particles.push({
            startX: p.x, startY: p.y,
            endX: n.x, endY: n.y,
            t: 0,
            speed: 2.0 / dist // Slower, more elegant travel speed
          });
        }
      }, task.time);
      
      animationIds.push(tid);
    });

    // --- STRICT TIMELINE CHOREOGRAPHY ---

    // 1. Enter Hold Phase (Network fully lit in the dark)
    animationIds.push(setTimeout(() => {
      if (phase === 'sparks') phase = 'hold';
    }, 4000));

    // 2. Enter Dawn Phase (Linear fade to paper background)
    animationIds.push(setTimeout(() => {
      if (phase === 'hold') phase = 'dawn';
    }, 4000)); // 4000ms + 1500ms hold

    // 3. Complete & Typography (Fade finishes, text triggers)
    animationIds.push(setTimeout(() => {
      onComplete();
    }, 6000)); // 5500ms + 2000ms dawn fade
  }

  let completed = false;
  function onComplete() {
    if (completed) return;
    completed = true;
    phase = 'completed';
    
    nodes.forEach(n => n.lit = 1);
    copyEl.classList.add('is-visible');

    // Release the bulletproof scroll lock
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    
    // Force Scrollama to recalculate its math now that the page is unlocked
    window.dispatchEvent(new Event('resize')); 
  }

  function skipAnimation() {
    if (phase === 'idle' || phase === 'completed') return;
    animationIds.forEach(clearTimeout);
    dawnProgress = 1;
    particles = [];
    onComplete();
  }

  // Interactions
  canvas.addEventListener('click', () => {
    if (phase === 'idle') startPropagation();
    else skipAnimation(); // Allow skipping during hold/dawn
  });
  
  document.addEventListener('keydown', () => {
     if (phase !== 'idle') skipAnimation();
  });

  // Init
  resize();
  window.addEventListener('resize', () => {
    resize();
    // If the loop stopped, force a single repaint to restore the canvas buffer
    if (phase === 'completed') {
      draw();
    }
  });
  generateNodesAndEdges();
  pickTrigger();
  requestAnimationFrame(draw);
})();