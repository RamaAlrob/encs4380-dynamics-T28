"use strict";

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
