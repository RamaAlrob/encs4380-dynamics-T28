"use strict";

// Euler integration. Digital control updates only on the sample clock.
function simulatePID(p) {
  const digital = p.sample > 0;
  const fast = p.second ? 1 / p.omega : p.tau;
  const duration = p.duration || Math.max(12, 10 * fast);
  const maxStep = Math.min(
    duration / 8000,
    fast / 80,
    p.sensor ? p.sensor / 60 : Infinity,
    digital ? Infinity : fast / (12 * (1 + p.k * p.kp)),
  );
  const step = digital ? p.sample / Math.ceil(p.sample / maxStep) : maxStep;
  const period = digital ? Math.round(p.sample / step) : 1;
  const steps = Math.ceil(duration / step);
  const stride = Math.max(1, Math.floor(steps / 1800));
  const trace = { t: [], y: [], measured: [], u: [] };
  let y = 0,
    velocity = 0,
    measured = 0,
    integral = 0,
    previousError = 0,
    u = 0;
  let peak = 0,
    first10,
    first90,
    lastOutside = -1,
    minU = Infinity,
    maxU = -Infinity;
  let tailMin = Infinity,
    tailMax = -Infinity;
  const clamp = (value) => Math.max(p.low, Math.min(p.high, value));
  for (let i = 0; i <= steps; i++) {
    const t = i * step;
    if (!p.sensor) measured = y;
    const error = p.ref - measured;
    if (i % period === 0) {
      const dt = digital ? p.sample : step;
      let base = p.kp * error;
      if (digital) base += (p.kd * (error - previousError)) / dt;
      else if (p.sensor) base -= (p.kd * (y - measured)) / p.sensor;
      else if (p.second) base -= p.kd * velocity;
      // For a first-order plant, solve u = P + I - Kd*(K*u-y)/tau.
      const implicit = !digital && !p.sensor && !p.second;
      const command = (acc) =>
        implicit
          ? (base + acc + (p.kd * y) / p.tau) / (1 + (p.kd * p.k) / p.tau)
          : base + acc;
      const candidate = integral + p.ki * error * dt;
      const trial = command(candidate);
      if (
        !p.aw ||
        !((trial > p.high && error > 0) || (trial < p.low && error < 0))
      )
        integral = candidate;
      u = clamp(command(integral));
      previousError = error;
    }
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    peak = Math.max(peak, y);
    if (first10 === undefined && y >= 0.1 * p.ref) first10 = t;
    if (first90 === undefined && y >= 0.9 * p.ref) first90 = t;
    if (Math.abs(p.ref - y) > 0.02 * p.ref) lastOutside = i;
    if (t >= 0.9 * duration) {
      tailMin = Math.min(y, tailMin);
      tailMax = Math.max(y, tailMax);
    }
    if (i % stride === 0 || i === steps || (digital && i % period === 0)) {
      trace.t.push(t);
      trace.y.push(y);
      trace.measured.push(measured);
      trace.u.push(u);
    }
    if (i === steps) break;
    if (p.sensor) measured += (step * (y - measured)) / p.sensor;
    if (p.second) {
      const acceleration =
        p.omega ** 2 * (p.k * u - y) - 2 * p.zeta * p.omega * velocity;
      y += step * velocity;
      velocity += step * acceleration;
    } else y += (step * (p.k * u - y)) / p.tau;
  }
  return {
    trace,
    rise: first90 === undefined ? null : first90 - first10,
    overshoot: 100 * (peak / p.ref - 1 > 0 ? peak / p.ref - 1 : 0),
    settling: lastOutside < 0.95 * steps ? (lastOutside + 1) * step : null,
    error: (100 * (p.ref - y)) / p.ref,
    stableTail: tailMax - tailMin <= 0.001 * p.ref,
    minU,
    maxU,
  };
}
