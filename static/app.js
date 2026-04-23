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

  const nodes = graph.nodes.map((n) => ({ ...n }));
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
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
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

  simulation.on("tick", () => {
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

    link
      .attr("x1", (d) => shiftedEnds(d.source.x, d.source.y, d.target.x, d.target.y).sx)
      .attr("y1", (d) => shiftedEnds(d.source.x, d.source.y, d.target.x, d.target.y).sy)
      .attr("x2", (d) => shiftedEnds(d.source.x, d.source.y, d.target.x, d.target.y).tx)
      .attr("y2", (d) => shiftedEnds(d.source.x, d.source.y, d.target.x, d.target.y).ty);

    suffix
      .attr("x1", (d) => shiftedEnds(nodes[d.from].x, nodes[d.from].y, nodes[d.to].x, nodes[d.to].y).sx)
      .attr("y1", (d) => shiftedEnds(nodes[d.from].x, nodes[d.from].y, nodes[d.to].x, nodes[d.to].y).sy)
      .attr("x2", (d) => shiftedEnds(nodes[d.from].x, nodes[d.from].y, nodes[d.to].x, nodes[d.to].y).tx)
      .attr("y2", (d) => shiftedEnds(nodes[d.from].x, nodes[d.from].y, nodes[d.to].x, nodes[d.to].y).ty);

    edgeLabel
      .attr("x", (d) => (d.source.x + d.target.x) / 2)
      .attr("y", (d) => (d.source.y + d.target.y) / 2 - 4);

    node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);

    nodeLabel.attr("x", (d) => d.x).attr("y", (d) => d.y);
  });

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
