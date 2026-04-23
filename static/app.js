const sourceInput = document.getElementById("source");
const targetInput = document.getElementById("target");
const buildBtn = document.getElementById("buildBtn");
const runBtn = document.getElementById("runBtn");
const stepBtn = document.getElementById("stepBtn");
const resetBtn = document.getElementById("resetBtn");
const statusText = document.getElementById("statusText");
const stepsBody = document.getElementById("stepsBody");
const svg = d3.select("#graph");
const width = +svg.attr("width");
const height = +svg.attr("height");
svg
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

let graphData = null;
let lcsSteps = [];
let stepCursor = -1;
let renderedGraph = null;

async function postJSON(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "Ошибка запроса");
  }
  return payload;
}

function renderGraph(graph, activeState = null) {
  svg.selectAll("*").remove();
  const nodeRadius = 22;
  const markerInset = 6;
  const boundaryPadding = 12;
  const minX = nodeRadius + boundaryPadding;
  const maxX = width - nodeRadius - boundaryPadding;
  const minY = nodeRadius + boundaryPadding;
  const maxY = height - nodeRadius - boundaryPadding;

  const nodes = graph.nodes.map((n) => ({ ...n }));
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const edges = graph.edges.map((e) => ({
    ...e,
    source: e.from,
    target: e.to,
  }));
  const suffixLinks = graph.suffixLinks.map((e) => ({ ...e }));

  const defs = svg.append("defs");

  defs
    .append("marker")
    .attr("id", "arrow-edge")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 10)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#64748b");

  defs
    .append("marker")
    .attr("id", "arrow-purple")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 10)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#c084fc");

  const simulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id((d) => d.id).distance(120))
    .force("charge", d3.forceManyBody().strength(-400))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = svg
    .append("g")
    .selectAll("line")
    .data(edges)
    .join("line")
    .attr("class", "edge")
    .attr("marker-end", "url(#arrow-edge)");

  const suffix = svg
    .append("g")
    .selectAll("line")
    .data(suffixLinks)
    .join("line")
    .attr("class", "suffix-link")
    .attr("marker-end", "url(#arrow-purple)");

  const edgeLabel = svg
    .append("g")
    .selectAll("text")
    .data(edges)
    .join("text")
    .text((d) => d.char)
    .attr("font-size", 12)
    .attr("fill", "#0f172a");

  const node = svg
    .append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", nodeRadius)
    .attr("class", (d) => {
      const classes = ["node"];
      if (d.isTerminal) classes.push("terminal");
      if (activeState !== null && d.id === activeState) classes.push("active");
      return classes.join(" ");
    })
    .call(
      d3
        .drag()
        .on("start", (_event, d) => {
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.x = Math.max(minX, Math.min(maxX, event.x));
          d.y = Math.max(minY, Math.min(maxY, event.y));
          d.fx = d.x;
          d.fy = d.y;
          updatePositions();
        })
        .on("end", (_event, d) => {
          d.fx = null;
          d.fy = null;
        })
    );

  const nodeLabel = svg
    .append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .text((d) => `q${d.id}\nlen=${d.length}`)
    .attr("font-size", 11)
    .attr("text-anchor", "middle")
    .attr("dy", 4)
    .attr("pointer-events", "none");

  const shiftedEnds = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      return { sx: x1, sy: y1, tx: x2, ty: y2 };
    }
    const ux = dx / len;
    const uy = dy / len;
    return {
      sx: x1 + ux * nodeRadius,
      sy: y1 + uy * nodeRadius,
      tx: x2 - ux * (nodeRadius + markerInset),
      ty: y2 - uy * (nodeRadius + markerInset),
    };
  };

  simulation.on("tick", () => {
    updatePositions();
  });

  const suffixEnds = (d) => {
    const fromNode = nodesById.get(d.from);
    const toNode = nodesById.get(d.to);
    if (!fromNode || !toNode) {
      return { sx: width / 2, sy: height / 2, tx: width / 2, ty: height / 2 };
    }
    return shiftedEnds(fromNode.x, fromNode.y, toNode.x, toNode.y);
  };

  const updatePositions = () => {
    nodes.forEach((d) => {
      d.x = Math.max(minX, Math.min(maxX, d.x));
      d.y = Math.max(minY, Math.min(maxY, d.y));
    });

    link
      .attr("x1", (d) => shiftedEnds(d.source.x, d.source.y, d.target.x, d.target.y).sx)
      .attr("y1", (d) => shiftedEnds(d.source.x, d.source.y, d.target.x, d.target.y).sy)
      .attr("x2", (d) => shiftedEnds(d.source.x, d.source.y, d.target.x, d.target.y).tx)
      .attr("y2", (d) => shiftedEnds(d.source.x, d.source.y, d.target.x, d.target.y).ty);

    suffix
      .attr("x1", (d) => suffixEnds(d).sx)
      .attr("y1", (d) => suffixEnds(d).sy)
      .attr("x2", (d) => suffixEnds(d).tx)
      .attr("y2", (d) => suffixEnds(d).ty);

    edgeLabel
      .attr("x", (d) => (d.source.x + d.target.x) / 2)
      .attr("y", (d) => (d.source.y + d.target.y) / 2 - 4);

    node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);

    nodeLabel.attr("x", (d) => d.x).attr("y", (d) => d.y);
  };

  simulation.stop();
  for (let i = 0; i < 250; i += 1) {
    simulation.tick();
  }
  updatePositions();

  renderedGraph = { node };
}

function setActiveState(activeState = null) {
  if (!renderedGraph) return;
  renderedGraph.node.classed(
    "active",
    (d) => activeState !== null && d.id === activeState
  );
}

function resetSteps() {
  lcsSteps = [];
  stepCursor = -1;
  stepsBody.innerHTML = "";
  stepBtn.disabled = true;
  resetBtn.disabled = true;
}

function renderRows(upTo) {
  stepsBody.innerHTML = "";
  lcsSteps.forEach((step, idx) => {
    const tr = document.createElement("tr");
    if (idx === upTo) tr.classList.add("active");
    tr.innerHTML = `
      <td>${step.index}</td>
      <td>${step.char}</td>
      <td>q${step.state}</td>
      <td>${step.currentLength}</td>
      <td>${step.currentSubstring}</td>
      <td>${step.bestLength}</td>
      <td>${step.bestSubstring}</td>
    `;
    stepsBody.appendChild(tr);
  });
}

buildBtn.addEventListener("click", async () => {
  try {
    const data = await postJSON("/api/build", { source: sourceInput.value });
    graphData = data.graph;
    renderGraph(graphData);
    resetSteps();
    statusText.textContent = `Автомат построен для строки A: "${data.source}". Состояний: ${graphData.nodes.length}.`;
  } catch (err) {
    statusText.textContent = err.message;
  }
});

runBtn.addEventListener("click", async () => {
  try {
    const data = await postJSON("/api/lcs", {
      source: sourceInput.value,
      target: targetInput.value,
    });
    graphData = data.graph;
    lcsSteps = data.steps;
    stepCursor = -1;
    renderRows(stepCursor);
    renderGraph(graphData);
    stepBtn.disabled = false;
    resetBtn.disabled = false;
    statusText.textContent = `LCS = "${data.lcs}" (длина ${data.length}). Нажимайте "Следующий шаг".`;
  } catch (err) {
    statusText.textContent = err.message;
  }
});

stepBtn.addEventListener("click", () => {
  if (stepCursor >= lcsSteps.length - 1) {
    statusText.textContent = "Все шаги уже показаны.";
    return;
  }
  stepCursor += 1;
  const step = lcsSteps[stepCursor];
  renderRows(stepCursor);
  setActiveState(step.state);
  statusText.textContent = `Шаг ${stepCursor + 1}/${lcsSteps.length}: символ '${step.char}', состояние q${step.state}, текущий поиск "${step.currentSubstring}" (длина ${step.currentLength}), лучший ответ "${step.bestSubstring}".`;
});

resetBtn.addEventListener("click", () => {
  stepCursor = -1;
  renderRows(stepCursor);
  setActiveState(null);
  statusText.textContent = "Пошаговый просмотр сброшен.";
});
