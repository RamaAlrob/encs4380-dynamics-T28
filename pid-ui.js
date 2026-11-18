"use strict";

const el = (id) => document.getElementById(id);
const base = {
  k: 1,
  tau: 1,
  second: false,
  omega: 3,
  zeta: 0.4,
  kp: 9,
  ki: 0,
  kd: 0,
  ref: 1,
  low: -10,
  high: 10,
  sensor: 0,
  sample: 0,
  aw: true,
};
const modes = {
  p1: [
    "PID playground",
    "Start with proportional control. Add integral action to close the remaining gap, then try derivative action on an underdamped plant.",
    "What fraction of a unit step will the output reach with Kp = 9 and Ki = 0?",
  ],
  p2: [
    "A slow sensor in the loop",
    "Increase the sensor lag. The controller acts on the reported value while the true output can already be above target.",
    "As sensor lag increases, which trace peaks first and what happens to overshoot?",
  ],
  p3: [
    "Digital PID",
    "Increase the sampling interval to see how long the actuator holds each command. Try a high integral gain with anti-windup on and off.",
    "How will a longer interval between measurements change the command and settling time?",
  ],
  p4: [
    "Tuning challenge",
    "Tune a hidden plant to ≤10% overshoot, settling within 4 s and ≤0.5% steady-state error. Each condition earns one point.",
    "Which gain will you change first to meet the failed condition?",
  ],
  motor: [
    "My system · Micromouse drive motor",
    "Target 40% of full-speed RPM with damping ratio 0.70 to limit wheel-speed overshoot during acceleration. Use forward PWM from 0 to 100%.",
    "Will the designed motor loop reach its speed target without saturating the PWM?",
  ],
};
let measurement;
try {
  measurement = JSON.parse(localStorage.getItem("pid.motor.fit"));
} catch {}
let challenge, mode, p, measuredProfile, result;
const states = {};
function design() {
  const k = measurement ? measurement.rpm / measurement.pwm : 1;
  const tau = measurement ? measurement.tau : 1;
  return {
    k,
    tau,
    kp: 1 / k,
    ki: 1 / (0.49 * tau * k),
    kd: 0,
    ref: 40 * k,
    low: 0,
    high: 100,
    sample: Math.min(0.02, tau / 20),
    duration: 10 * tau,
  };
}
function newChallenge() {
  // HW1 Module 4's hidden first-order step family.
  challenge = randomFirstOrderPlant();
  states.p4 = undefined;
}
function defaults() {
  if (mode === "motor") return { ...base, ...design() };
  if (mode === "p4") return { ...base, ...challenge, kp: 1 };
  if (mode === "p2") return { ...base, kp: 2, ki: 6, sensor: 0.02 };
  if (mode === "p3") return { ...base, kp: 3, ki: 3, sample: 0.02 };
  return { ...base };
}
function range(key, label, min, max, step) {
  const row = document.createElement("label"),
    out = document.createElement("output");
  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = p[key];
  out.value = Number(p[key].toPrecision(4));
  row.append(label, out, input);
  input.oninput = () => {
    p[key] = +input.value;
    out.value = Number(p[key].toPrecision(4));
    update();
  };
  el("controls").append(row);
}
function button(label, action) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.onclick = action;
  el("controls").append(btn);
}
function renderControls() {
  el("controls").replaceChildren();
  const motor = mode === "motor" || measuredProfile;
  if (["p1", "p2", "p3"].includes(mode)) {
    button(motor ? "Use reference plant" : "Use drive motor", () => {
      measuredProfile = !measuredProfile;
      if (measuredProfile) {
        p = {
          ...defaults(),
          ...design(),
          sample: mode === "p3" ? design().sample : 0,
        };
      } else p = defaults();
      renderControls();
      update();
    });
  }
  if (motor) {
    const description = document.createElement("p");
    description.textContent =
      (measurement ? "Encoder fit" : "Illustrative motor") +
      " · K = " +
      fmt(p.k) +
      " RPM/% · τ = " +
      fmt(p.tau) +
      " s";
    el("controls").append(description);
  }
  if (mode === "p1" && !motor) {
    button(
      p.second ? "Plant · second order ⇄" : "Plant · first order ⇄",
      () => {
        p.second = !p.second;
        renderControls();
        update();
      },
    );
    range("k", "Plant gain K", 0.2, 3, 0.1);
    if (p.second) {
      range("omega", "Natural frequency (rad/s)", 0.5, 6, 0.1);
      range("zeta", "Damping ratio", 0.1, 1.5, 0.05);
    } else range("tau", "Plant τ (s)", 0.2, 3, 0.1);
  }
  const scale = motor ? 1 / p.k : 1,
    time = motor ? p.tau : 1;
  range("kp", "Proportional Kp", 0, 15 * scale, 0.01 * scale);
  range("ki", "Integral Ki", 0, (15 * scale) / time, (0.01 * scale) / time);
  range("kd", "Derivative Kd", 0, 3 * scale * time, 0.005 * scale * time);
  if (mode !== "p4")
    range(
      "ref",
      motor ? "Setpoint (RPM)" : "Setpoint step",
      motor ? p.k : 0.1,
      motor ? 100 * p.k : 3,
      motor ? p.k : 0.1,
    );
  if (mode === "p2") range("sensor", "Sensor τ (s)", 0, 3, 0.02);
  if (mode === "p3" || mode === "motor") {
    range(
      "sample",
      "Sampling interval (s)",
      Math.min(0.005, time / 20),
      time,
      Math.min(0.005, time / 20),
    );
    const label = document.createElement("label"),
      box = document.createElement("input");
    box.type = "checkbox";
    box.checked = p.aw;
    box.onchange = () => {
      p.aw = box.checked;
      update();
    };
    label.append(box, " Conditional anti-windup");
    el("controls").append(label);
  }
  if (mode === "p4")
    button("Draw new plant", () => {
      newChallenge();
      p = null;
      enter();
    });
}
function enter() {
  if (mode && p) states[mode] = { p, measuredProfile };
  const hash = location.hash.slice(1);
  mode = Object.hasOwn(modes, hash) ? hash : "p1";
  if (mode === "p4" && !challenge) newChallenge();
  p = states[mode]?.p || defaults();
  measuredProfile = states[mode]?.measuredProfile || false;
  const [title, intro, question] = modes[mode];
  el("title").textContent = title;
  el("intro").textContent = intro;
  el("question").textContent = question;
  el("prediction").value = "";
  el("feedback").textContent = "";
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.hash === "#" + mode) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  el("calibration").hidden = mode !== "motor";
  el("validation").hidden = mode !== "p1";
  el("firmware").hidden = !["p3", "motor"].includes(mode);
  el("sensorLegend").hidden = mode !== "p2";
  el("source").textContent = measurement
    ? "Measurement source · " + measurement.source
    : "Illustrative design until an encoder measurement is entered. Applied measurements are saved in this browser.";
  renderControls();
  update();
}
const fmt = (n) => (n == null ? "—" : Number(n.toPrecision(4)).toString());
function draw(id, t, series, unit) {
  const c = el(id),
    w = c.clientWidth,
    h = c.clientHeight,
    dpr = window.devicePixelRatio || 1;
  if (!w) return;
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  let min = 0,
    max = 0;
  for (const s of series)
    for (const y of Array.isArray(s.data) ? s.data : [s.data]) {
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
  const pad = (max - min || 1) * 0.08;
  min -= pad;
  max += pad;
  const left = 60,
    right = w - 12,
    top = 13,
    bottom = h - 36;
  const x = (v) => left + (v / t[t.length - 1]) * (right - left),
    y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);
  ctx.font = "11px system-ui";
  ctx.fillStyle = "#455b53";
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    ctx.strokeStyle = "#dce5df";
    ctx.beginPath();
    ctx.moveTo(left, y(v));
    ctx.lineTo(right, y(v));
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(fmt(v), left - 5, y(v) + 3);
  }
  ctx.textAlign = "center";
  for (let i = 0; i <= 4; i++) {
    const v = (t[t.length - 1] * i) / 4;
    ctx.fillText(fmt(v), x(v), bottom + 15);
  }
  ctx.fillText("Time (s)", (left + right) / 2, h - 2);
  ctx.save();
  ctx.translate(11, (bottom + top) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(unit, 0, 0);
  ctx.restore();
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(s.dash ? [5, 4] : []);
    ctx.beginPath();
    if (Array.isArray(s.data)) {
      ctx.moveTo(x(t[0]), y(s.data[0]));
      for (let i = 1; i < t.length; i++) {
        if (s.stairs) ctx.lineTo(x(t[i]), y(s.data[i - 1]));
        ctx.lineTo(x(t[i]), y(s.data[i]));
      }
    } else {
      ctx.moveTo(left, y(s.data));
      ctx.lineTo(right, y(s.data));
    }
    ctx.stroke();
  }
}
function charts() {
  const a = result.trace,
    motor = mode === "motor" || measuredProfile;
  const limits = (data) => ({ data, color: "#716d80", dash: true });
  const series = [{ data: a.y, color: "#16604e" }, limits(p.ref)];
  if (mode === "p2") series.push({ data: a.measured, color: "#b35115" });
  draw("response", a.t, series, motor ? "RPM" : "Output");
  draw(
    "effort",
    a.t,
    [
      limits(p.low),
      limits(p.high),
      { data: a.u, color: "#16604e", stairs: !!p.sample },
    ],
    motor ? "PWM (%)" : "Command",
  );
}
function update() {
  result = simulatePID(p);
  const r = result;
  el("diagram").textContent =
    "Setpoint → Σ (r − measurement) → PID → limiter → plant → output · feedback through " +
    (mode === "p2" ? "sensor 1 / (τₛs + 1)" : "unity sensor");
  const entries = [
    ["Rise time", r.rise === null ? "Unreached" : fmt(r.rise) + " s"],
    ["Overshoot", fmt(r.overshoot) + "%"],
    [
      "Settling time",
      r.settling === null ? "Unsettled" : fmt(r.settling) + " s",
    ],
    ["Steady-state error", r.stableTail ? fmt(r.error) + "%" : "Unsettled"],
  ];
  el("metrics").replaceChildren(
    ...entries.map(([label, value]) => {
      const d = document.createElement("div"),
        v = document.createElement("strong");
      v.textContent = value;
      d.append(label, v);
      return d;
    }),
  );
  el("definition").textContent =
    "Rise uses 10–90% of the target. Settling uses a ±2% band with at least 5% of the run remaining. Error is estimated from the endpoint when the last 10% varies by ≤0.1% of target. Command range observed: " +
    fmt(r.minU) +
    " to " +
    fmt(r.maxU) +
    ".";
  el("score").textContent = "";
  if (
    mode === "p1" &&
    r.stableTail &&
    r.trace.y.at(-1) > 0 &&
    Math.abs(r.error) > 2
  ) {
    const final = r.trace.y.at(-1);
    const crossing = (fraction) =>
      r.trace.t[r.trace.y.findIndex((v) => v >= fraction * final)];
    el("score").textContent =
      "Relative to its own final output of " +
      fmt(final) +
      ", the response rises from 10% to 90% in " +
      fmt(crossing(0.9) - crossing(0.1)) +
      " s. The target-based metrics above also show the tracking offset.";
  }
  if (mode === "motor") {
    const nominal = (1 + p.k * p.kp) / (2 * Math.sqrt(p.tau * p.k * p.ki));
    el("score").textContent =
      "Nominal PI damping ratio: " +
      (p.ki > 0 && p.kd === 0
        ? fmt(nominal)
        : "applies with Ki > 0 and Kd = 0") +
      ". Design target 0.60–0.80. The plot includes sampling and PWM saturation.";
  }
  if (mode === "p4") {
    const checks = [
      ["Overshoot", r.overshoot <= 10],
      ["Settling", r.settling !== null && r.settling <= 4],
      ["Error", r.stableTail && Math.abs(r.error) <= 0.5],
    ];
    el("score").textContent =
      checks.map(([s, ok]) => s + " " + (ok ? "PASS" : "FAIL")).join(" · ") +
      " · Score " +
      checks.filter((c) => c[1]).length +
      "/3";
  }
  if (!el("firmware").hidden) el("code").textContent = arduino(p);
  el("feedback").textContent = "";
  el("copy").textContent = "Copy code";
  charts();
}
function arduino(s) {
  return `// Uno speed control. Set this to the measured count for your gearbox.
const float countsPerRev = 360.0; // example, rising edges on encoder A
const byte encA = 2, encB = 4, dirPin = 7, pwmPin = 9;
const float kp = ${s.kp}, ki = ${s.ki}, kd = ${s.kd};
const float targetRPM = ${s.ref}, low = ${s.low}, high = ${s.high};
const bool antiWindup = ${s.aw};
const unsigned long sampleUs = ${Math.round(s.sample * 1e6)}UL;
volatile long ticks = 0;
unsigned long previousUs;
float integral = 0, previousError = 0;

void encoderEdge() { ticks += digitalRead(encB) ? 1 : -1; }
void setup() {
  pinMode(encA, INPUT_PULLUP); pinMode(encB, INPUT_PULLUP);
  pinMode(dirPin, OUTPUT); pinMode(pwmPin, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(encA), encoderEdge, RISING);
  previousUs = micros();
}

void loop() {
  unsigned long now = micros(), elapsed = now - previousUs;
  if (elapsed < sampleUs) return;
  previousUs = now;
  noInterrupts();
  long count = ticks;
  ticks = 0;
  interrupts();
  float dt = elapsed * 1e-6;
  float rpm = 60.0 * count / (countsPerRev * dt);
  float error = targetRPM - rpm;
  float pd = kp * error + kd * (error - previousError) / dt;
  float nextI = integral + ki * dt * error;
  float trial = pd + nextI;
  if (!antiWindup || !((trial > high && error > 0) || (trial < low && error < 0)))
    integral = nextI;
  float u = constrain(pd + integral, low, high);
  digitalWrite(dirPin, u >= 0 ? HIGH : LOW);
  analogWrite(pwmPin, round(255.0 * abs(u) / 100.0));
  previousError = error;
}`;
}
function validate() {
  const onlyP = simulatePID(base),
    pi = simulatePID({ ...base, kp: 1, ki: 1 });
  const crossing =
    onlyP.trace.t[
      onlyP.trace.y.findIndex((y) => y >= 0.9 * (1 - Math.exp(-1)))
    ];
  const mismatch = Math.max(
    ...pi.trace.y.map((y, i) => Math.abs(y - (1 - Math.exp(-pi.trace.t[i])))),
  );
  const errors = [0.5, 1, 2].map(
    (ki) => simulatePID({ ...base, kp: 1, ki, duration: 45 }).error,
  );
  const cases = [
    [
      Math.abs(crossing - 0.1) < 0.01 && Math.abs(onlyP.error - 10) < 0.01,
      "P only · measured τ = " +
        fmt(crossing) +
        " s and final error = " +
        fmt(onlyP.error) +
        "% (expected 0.1 s and 10%).",
    ],
    [
      mismatch < 0.003,
      "PI with Kp = Ki = 1 · denominator s² + 2s + 1 gives ωₙ = 1 rad/s and ζ = 1. Peak deviation from 1 − exp(−t) = " +
        fmt(mismatch) +
        ".",
    ],
    [
      errors.every((v) => Math.abs(v) < 0.01),
      "Stable PI with a reachable step · Ki = 0.5, 1 and 2 each tested for 45 s. Largest final error = " +
        fmt(Math.max(...errors.map(Math.abs))) +
        "%. At equilibrium the integrator stops changing only when e = 0.",
    ],
  ];
  el("checks").replaceChildren(
    ...cases.map(([ok, label]) => {
      const row = document.createElement("p");
      row.textContent = (ok ? "PASS · " : "FAIL · ") + label;
      return row;
    }),
  );
}
el("fit").onsubmit = (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  measurement = {
    pwm: +form.get("pwm"),
    rpm: +form.get("rpm"),
    tau: +form.get("tau"),
    source: form.get("source").trim(),
  };
  try {
    localStorage.setItem("pid.motor.fit", JSON.stringify(measurement));
  } catch {}
  for (const name of Object.keys(states))
    if (states[name].measuredProfile || name === "motor") delete states[name];
  p = null;
  enter();
};
el("check").onclick = () => {
  if (!el("prediction").value.trim()) {
    el("feedback").textContent = "Enter your prediction first.";
    return;
  }
  const r = result;
  el("feedback").textContent =
    "Compare your prediction with this run: peak output " +
    fmt(Math.max(...r.trace.y)) +
    ", overshoot " +
    fmt(r.overshoot) +
    "%, endpoint error " +
    fmt(r.error) +
    "%." +
    (mode === "p2"
      ? " Sensor peak " + fmt(Math.max(...r.trace.measured)) + "."
      : "") +
    (mode === "p3"
      ? " The command was held for " + fmt(p.sample) + " s between updates."
      : "");
};
el("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(el("code").textContent);
    el("copy").textContent = "Copied";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(el("code"));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    el("copy").textContent = document.execCommand("copy")
      ? "Copied"
      : "Code selected · copy manually";
  }
};
window.addEventListener("hashchange", () => {
  if (location.hash.slice(1) !== mode) enter();
});
window.addEventListener("resize", () => {
  if (result) charts();
});
validate();
enter();
