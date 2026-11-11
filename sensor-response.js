"use strict";

function firstOrderStep(t, tau, gain, amplitude) {
  return gain * amplitude * (1 - Math.exp(-t / tau));
}

function firstOrderFrequency(tau, omega) {
  return {
    ratio: 1 / Math.sqrt(1 + (omega * tau) ** 2),
    phase: -Math.atan(omega * tau)
  };
}

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
