"use strict";

(() => {
  const byId = id => document.getElementById(id);
  const storageKey = "toolkit.module4.score";
  const score = { points: 0, attempts: 0 };
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved && Number.isSafeInteger(saved.points) && Number.isSafeInteger(saved.attempts)
      && saved.points >= 0 && saved.points <= saved.attempts) {
      Object.assign(score, saved);
    }
  } catch {
    // The score still works in memory if session storage is unavailable.
  }

  const parameters = {
    tau: { label: "τ", unit: " s" },
    zeta: { label: "ζ", unit: "" },
    omega: { label: "ωₙ", unit: " rad/s" }
  };
  const hints = {
    step: "Find the final level, then read the time where the response reaches 63.2% of it.",
    sine: "Measure the time lag Δt between matching input and output peaks. Use τ = tan(ω·Δt) / ω.",
    second: "Measure the fractional overshoot Mₚ above the final level and the first peak time tₚ. Use ζ = −ln(Mₚ) / √(π² + ln²(Mₚ)), then ωₙ = π / (tₚ√(1 − ζ²))."
  };
  let round;
  let roundNumber = 0;
  let revealed = false;

  const randomBetween = (min, max) => min + (max - min) * Math.random();

  function newRound() {
    if (Math.random() < 0.5) {
      const tau = randomBetween(0.6, 1.8);
      const gain = randomBetween(0.8, 1.6);
      if (Math.random() < 1 / 3) {
        const inputOmega = 1;
        const { ratio, phase } = firstOrderFrequency(tau, inputOmega);
        return {
          kind: "sine", actual: { tau }, gain, end: 4 * Math.PI / inputOmega,
          inputOmega, input: t => Math.sin(inputOmega * t), noise: 0.007 * gain * ratio,
          evaluate: t => gain * ratio * Math.sin(inputOmega * t + phase)
        };
      }
      return {
        kind: "step", actual: { tau }, gain, end: 12, noise: 0.007 * gain,
        evaluate: t => firstOrderStep(t, tau, gain, 1)
      };
    }

    // Keep overshoot and the first peak easy to read in the presence of noise.
    const zeta = randomBetween(0.22, 0.48);
    const omega = randomBetween(2.5, 5);
    const model = makeModel(1, 2 * zeta * omega, omega ** 2);
    return {
      kind: "second", actual: { zeta, omega }, end: 12, noise: 0.004,
      evaluate: t => stepState(model, t)[0]
    };
  }

  function drawResponse() {
    const { times, measured, clean, input } = round;
    const measuredTrace = { ...line(times, measured), name: "Measured" };
    if (revealed) measuredTrace.opacity = 0.55;
    const traces = [measuredTrace];
    if (input) {
      traces.unshift({
        ...line(times, input), name: "Input",
        line: { color: "#68748d", width: 2, dash: "dot" }
      });
    }
    if (revealed) {
      traces.push({
        ...line(times, clean), name: "True response",
        line: { color: "#6d4fd6", width: 2, dash: "dash" }
      });
    }
    plot("response-plot", traces, "Time (s)", "Response", {
      margin: { l: 58, r: 14, t: 12, b: 58 },
      showlegend: true,
      legend: { orientation: "h", x: 0, y: -0.26 },
      hoverlabel: { namelength: -1 },
      uirevision: roundNumber
    });
  }

  function showHint(show) {
    byId("hint").hidden = !show;
    byId("show-hint").setAttribute("aria-expanded", String(show));
    byId("show-hint").textContent = show ? "Hide hint" : "Show hint";
  }

  function startRound() {
    round = newRound();
    round.times = Array.from({ length: 481 }, (_, i) => i * round.end / 480);
    round.clean = round.times.map(round.evaluate);
    round.measured = round.clean.map(y => y + randomBetween(-round.noise, round.noise));
    if (round.input) round.input = round.times.map(round.input);
    revealed = false;
    roundNumber++;

    byId("round-title").textContent = round.kind === "second"
      ? "Second-order step response"
      : round.kind === "sine" ? "First-order sine response" : "First-order step response";
    byId("input-description").textContent = round.kind === "sine"
      ? `Steady-state response to a unit sine at ω = ${round.inputOmega} rad/s.`
      : "Response to a unit step from rest.";
    byId("guess").reset();
    for (const id of Object.keys(parameters)) {
      const active = Object.hasOwn(round.actual, id);
      byId(id + "-field").hidden = !active;
      byId(id).disabled = !active;
    }
    byId("check-guess").disabled = false;
    byId("result").replaceChildren();
    byId("hint").textContent = hints[round.kind];
    showHint(false);
    drawResponse();
  }

  function updateScore() {
    byId("score").textContent = `Session score: ${score.points} / ${score.attempts}`;
  }

  function checkGuess(event) {
    event.preventDefault();
    if (revealed) return;

    const details = document.createElement("ul");
    let fullMarks = true;
    for (const [id, actual] of Object.entries(round.actual)) {
      const estimate = byId(id).valueAsNumber;
      const error = Math.abs(estimate / actual - 1);
      // Allow for floating-point rounding at exactly 10%.
      fullMarks &&= error <= 0.1 + Number.EPSILON;
      const { label, unit } = parameters[id];
      const row = document.createElement("li");
      row.textContent = `${label} = ${actual.toFixed(4)}${unit} · Your error: ${(100 * error).toFixed(2)}%`;
      details.append(row);
      byId(id).disabled = true;
    }
    if (round.gain !== undefined) {
      const row = document.createElement("li");
      row.textContent = `Gain K = ${round.gain.toFixed(4)}`;
      details.append(row);
    }

    revealed = true;
    score.attempts++;
    if (fullMarks) score.points++;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(score));
    } catch {
      // Continue with the in-memory score.
    }
    updateScore();
    byId("check-guess").disabled = true;
    const summary = document.createElement("strong");
    summary.textContent = fullMarks ? "Full marks · 1 / 1" : "Round score · 0 / 1";
    byId("result").replaceChildren(summary, details);
    drawResponse();
  }

  byId("new-sensor").addEventListener("click", startRound);
  byId("show-hint").addEventListener("click", () => showHint(byId("hint").hidden));
  byId("guess").addEventListener("submit", checkGuess);
  updateScore();
  startRound();
})();
