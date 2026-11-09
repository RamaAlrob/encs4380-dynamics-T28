"use strict";

function roots(halfDamping, discriminant, frequencySquared) {
  if (discriminant < 0) {
    const imaginary = Math.sqrt(-discriminant);
    return [[-halfDamping, imaginary], [-halfDamping, -imaginary]];
  }

  const fast = -halfDamping - Math.sqrt(discriminant);
  return [[frequencySquared / fast, 0], [fast, 0]];
}

function makeModel(m, b, k) {
  const omega = Math.sqrt(k / m);
  const zeta = b / (2 * Math.sqrt(k * m));
  const regime = Math.abs(zeta - 1) < 1e-12 ? "critical" : zeta < 1 ? "under" : "over";
  const halfDamping = b / (2 * m);
  const discriminant = regime === "critical" ? 0 : halfDamping ** 2 - omega ** 2;
  const poles = roots(halfDamping, discriminant, omega ** 2);
  const A = [[0, 1], [-k / m, -b / m]];
  const B = [0, 1 / m];
  const halfTrace = (A[0][0] + A[1][1]) / 2;
  const determinant = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const eigenDiscriminant = halfTrace ** 2 - determinant;
  const eigenvalues = roots(-halfTrace, regime === "critical" ? 0 : eigenDiscriminant, determinant);
  return { omega, zeta, regime, poles, eigenvalues, A, B };
}

// Closed-form displacement and velocity for a force step F = k, from rest.
function stepState(model, t) {
  const { omega, zeta, regime, poles } = model;
  const decay = zeta * omega;
  if (regime === "critical") {
    const envelope = Math.exp(-omega * t);
    return [1 - envelope * (1 + omega * t), omega ** 2 * t * envelope];
  }
  if (regime === "under") {
    const dampedOmega = poles[0][1];
    const envelope = Math.exp(-decay * t);
    const sine = Math.sin(dampedOmega * t) / dampedOmega;
    return [1 - envelope * (Math.cos(dampedOmega * t) + decay * sine),
      omega ** 2 * envelope * sine];
  }

  const slow = poles[0][0];
  const fast = poles[1][0];
  const slowEnvelope = Math.exp(slow * t);
  const fastEnvelope = Math.exp(fast * t);
  return [
    1 - (slow * fastEnvelope - fast * slowEnvelope) / (slow - fast),
    omega ** 2 * (slowEnvelope - fastEnvelope) / (slow - fast)
  ];
}

function response(model) {
  const peak = model.regime === "under" ? Math.PI / model.poles[0][1] : null;
  const end = Math.max(-8 / model.poles[0][0], peak ?? 0);
  const intervals = Math.max(1600, Math.ceil(end * model.poles[0][1] * 12));
  const times = Array.from({ length: intervals + 1 }, (_, i) => i * end / intervals);
  if (peak !== null) {
    // Include every extremum so a brief excursion outside the band is still detected.
    for (let t = peak; t < end; t += peak) times.push(t);
    times.sort((a, b) => a - b);
  }
  const states = times.map(t => stepState(model, t));
  const displacement = states.map(state => state[0]);
  const velocity = states.map(state => state[1]);

  function crossing(level, left, right) {
    const fraction = (level - displacement[left]) / (displacement[right] - displacement[left]);
    return times[left] + fraction * (times[right] - times[left]);
  }

  const first10 = displacement.findIndex(x => x >= 0.1);
  const first90 = displacement.findIndex(x => x >= 0.9);
  const riseStart = crossing(0.1, first10 - 1, first10);
  const riseEnd = crossing(0.9, first90 - 1, first90);
  let outside = displacement.length - 1;
  while (Math.abs(displacement[outside] - 1) <= 0.02) outside--;
  const edge = displacement[outside] > 1 ? 1.02 : 0.98;
  const settling = crossing(edge, outside, outside + 1);
  const peakHeight = peak === null ? 1 : stepState(model, peak)[0];

  return { times, displacement, velocity, riseStart, riseEnd, peak, peakHeight, settling, edge,
    overshoot: 100 * Math.max(0, Math.max(...displacement) - 1) };
}

const byId = id => document.getElementById(id);
const format = value => Number(value.toPrecision(5)).toString();
const seconds = value => format(value) + " s";
const pair = values => {
  const [[real, imaginary], [secondReal]] = values;
  if (imaginary) return format(real) + " ± j" + format(imaginary);
  if (real === secondReal) return format(real) + " (double)";
  return values.map(value => format(value[0])).join(", ");
};

function plot(id, traces, xTitle, yTitle, extras = {}) {
  Plotly.react(id, traces, {
    margin: { l: 65, r: 16, t: 16, b: 58 },
    xaxis: { title: xTitle, automargin: true },
    yaxis: { title: yTitle, automargin: true },
    showlegend: false,
    ...extras
  }, { responsive: true, displayModeBar: false });
}

function line(x, y) {
  return { x, y, type: "scatter", mode: "lines", line: { color: "#2d6cdf", width: 3 } };
}

function markers(x, y, labels) {
  return { x, y, text: labels, type: "scatter", mode: "markers",
    marker: { color: "#6d4fd6", size: 9 },
    hovertemplate: "%{text}<br>%{x:.4g}, %{y:.4g}<extra></extra>" };
}

function render() {
  const controls = ["mass", "damping", "stiffness"];
  const [m, b, k] = controls.map(id => {
    const value = Number(byId(id).value);
    byId(id + "-value").textContent = value;
    return value;
  });
  const model = makeModel(m, b, k);
  const data = response(model);
  const names = { under: "Underdamped", critical: "Critically damped", over: "Overdamped" };
  byId("regime").textContent = names[model.regime] + " · ζ = " + format(model.zeta)
    + " · ωₙ = " + format(model.omega) + " rad/s";
  byId("rise").textContent = seconds(data.riseEnd - data.riseStart);
  byId("peak").textContent = data.peak === null ? "No peak" : seconds(data.peak);
  byId("overshoot").textContent = data.overshoot.toFixed(2) + "%";
  byId("settling").textContent = seconds(data.settling);
  byId("matrix-a").textContent = "A = [ 0  1 ]\n    [ " + model.A[1].map(format).join("  ") + " ]";
  byId("matrix-b").textContent = "B = [ 0 ]\n    [ " + format(model.B[1]) + " ]";
  byId("eigenvalues").textContent = "Transfer-function poles (" + pair(model.poles)
    + ") match the eigenvalues of A (" + pair(model.eigenvalues) + ").";

  const markTimes = [data.riseStart, data.riseEnd, data.settling];
  const markValues = [0.1, 0.9, data.edge];
  const labels = ["10% crossing", "90% crossing", "Settling"];
  if (data.peak !== null) {
    markTimes.push(data.peak);
    markValues.push(data.peakHeight);
    labels.push("First peak");
  }
  plot("step-plot", [
    line(data.times, data.displacement),
    markers(markTimes, markValues, labels)
  ], "Time (s)", "Displacement (m)", {
    shapes: [
      { type: "rect", xref: "paper", x0: 0, x1: 1, y0: 0.98, y1: 1.02,
        fillcolor: "#eaf1ff", line: { width: 0 }, layer: "below" },
      { type: "line", xref: "paper", x0: 0, x1: 1, y0: 1, y1: 1,
        line: { color: "#5b6785", dash: "dash" } }
    ]
  });
  const poleTrace = markers(
    model.poles.map(pole => pole[0]), model.poles.map(pole => pole[1]),
    model.regime === "critical" ? ["Double pole", "Double pole"] : ["Pole 1", "Pole 2"]
  );
  poleTrace.marker.symbol = "x";
  const poleExtent = Math.max(model.omega, -model.poles[1][0]);
  plot("pole-plot", [poleTrace], "Real part (1/s)", "Imaginary part (1/s)", {
    xaxis: { title: "Real part (1/s)", range: [-1.2 * poleExtent, 0.2 * poleExtent] },
    yaxis: { title: "Imaginary part (1/s)", range: [-1.15 * model.omega, 1.15 * model.omega] }
  });
  plot("phase-plot", [
    line(data.displacement, data.velocity),
    markers([0, 1], [0, 0], ["Start", "Equilibrium"])
  ], "Displacement x₁ (m)", "Velocity x₂ (m/s)");
}

function preset(damping) {
  byId("mass").value = 1;
  byId("stiffness").value = 4;
  byId("damping").value = damping;
  render();
}

function renderValidation() {
  const model = makeModel(1, 2, 4);
  const under = response(model).overshoot;
  const critical = response(makeModel(1, 4, 4)).overshoot;
  const eigenvaluesPass = model.eigenvalues.every(([real, imaginary], i) =>
    Math.abs(real + 1) < 0.001 && Math.abs(imaginary - (i === 0 ? 1.732 : -1.732)) < 0.001
    && Math.abs(real - model.poles[i][0]) < 1e-9 && Math.abs(imaginary - model.poles[i][1]) < 1e-9
  );
  const checks = [
    ["4. Overshoot at ζ = 0.5", "16.3%", under.toFixed(1) + "%", Math.abs(under - 16.3) < 0.05],
    ["5. Overshoot at ζ = 1", "0%", critical.toFixed(0) + "%", critical === 0],
    ["6. Eigenvalues match poles", "−1 ± j1.732", pair(model.eigenvalues), eigenvaluesPass]
  ];
  for (const [name, expected, computed, pass] of checks) {
    const row = byId("validation").insertRow();
    for (const value of [name, expected, computed, pass ? "PASS" : "FAIL"]) {
      row.insertCell().textContent = value;
    }
  }
}

for (const id of ["mass", "damping", "stiffness"]) {
  byId(id).addEventListener("input", render);
}
for (const button of document.querySelectorAll("[data-damping]")) {
  button.addEventListener("click", () => preset(button.dataset.damping));
}
byId("prediction").addEventListener("submit", event => {
  event.preventDefault();
  const correct = new FormData(event.currentTarget).get("answer") === "zero";
  byId("prediction-result").textContent = (correct ? "Correct. " : "Overshoot drops to zero. ")
    + "At b = 4 N·s/m, ζ reaches 1 and the response approaches equilibrium without overshooting.";
  preset(4);
});

renderValidation();
render();
