/**
 * Fat Channel de-normalization formula tests.
 *
 * HIL Evidence: test/fixtures/32sc/fat-channel/fat-channel-calibration.json
 *   Device: StudioLive 32SC SD7E21010066 fw 3.4.0.111374 (2026-07-01)
 *   31 calibration anchor points across EQ gain, HPF, EQ freq, EQ Q, band type,
 *   comp threshold/gain/attack, gate threshold.
 *
 * TDD:
 *   RED  = old guessed formulas produce wrong values for the observed data
 *   GREEN = calibrated formulas match observed HIL data within tolerance
 *
 * Confidence levels used:
 *   observed          = formula matches observed data exactly (< 0.01 dB / < 0.1% Hz error)
 *   calibrated_inferred = formula fitted from HIL data, max error documented
 *   probe_required    = no calibration data — formula still guessed
 *
 * @implements REQ-F-FAT-001 — Fat Channel parameter extraction
 * Traces to: #4 StR-4 (Pre-show check), #5 StR-5 (Soundcheck)
 */
import { describe, it, expect } from 'vitest'
import {
  normalizedToEqGainDb,
  normalizedToEqFreqHz,
  normalizedToHpfFreqHz,
  normalizedToEqQ,
  normalizedToEqBandType,
  normalizedToCompThresholdDb,
  normalizedToCompMakeupDb,
  normalizedToGateThresholdDb,
  normalizedToAttackMs,
  eqGainDbToNormalized,
  eqFreqHzToNormalized,
  eqQToNormalized,
  hpfFreqHzToNormalized,
} from '../schemas/fat-channel.js'

// ---------------------------------------------------------------------------
// EQ gain — guided calibration (32R dense anchors 2026-07-03)
// ---------------------------------------------------------------------------

describe('normalizedToEqGainDb — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('raw=0.000 → -15.00 dB [guided anchor]', () => {
    expect(normalizedToEqGainDb(0.000)).toBeCloseTo(-15.00, 2)
  })
  it('raw=0.010 → -14.70 dB [guided anchor]', () => {
    expect(normalizedToEqGainDb(0.010)).toBeCloseTo(-14.70, 2)
  })
  it('raw=0.100 → -12.00 dB [guided anchor]', () => {
    expect(normalizedToEqGainDb(0.100)).toBeCloseTo(-12.00, 2)
  })
  it('raw=0.250 → -7.50 dB [guided anchor]', () => {
    expect(normalizedToEqGainDb(0.250)).toBeCloseTo(-7.50, 2)
  })
  it('raw=0.500 → 0.00 dB [guided anchor]', () => {
    expect(normalizedToEqGainDb(0.500)).toBeCloseTo(0.00, 2)
  })
  it('raw=0.750 → 7.50 dB [guided anchor]', () => {
    expect(normalizedToEqGainDb(0.750)).toBeCloseTo(7.50, 2)
  })
  it('raw=1.000 → 15.00 dB [guided anchor]', () => {
    expect(normalizedToEqGainDb(1.000)).toBeCloseTo(15.00, 2)
  })
  it('inverse: eqGainDbToNormalized rounds-trip', () => {
    const raws = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1.0]
    for (const raw of raws) {
      expect(eqGainDbToNormalized(normalizedToEqGainDb(raw))).toBeCloseTo(raw, 3)
    }
  })
})

// ---------------------------------------------------------------------------
// HPF frequency — calibrated_inferred (6 anchor points, max error < 0.5%)
// HIL: 24*42^raw confirmed on 32SC fw 3.4.0.111374 (2026-07-01)
// ---------------------------------------------------------------------------

describe('normalizedToHpfFreqHz — calibrated_inferred (32SC fw 3.4.0.111374)', () => {
  it('Ch11: raw=0.1233 → 38 Hz', () => {
    expect(normalizedToHpfFreqHz(0.1233)).toBeCloseTo(38, 0)
  })
  it('Ch5: raw=0.2467 → 60 Hz', () => {
    expect(normalizedToHpfFreqHz(0.2467)).toBeCloseTo(60, 0)
  })
  it('Ch8: raw=0.3533 → 90 Hz (±2 Hz)', () => {
    expect(normalizedToHpfFreqHz(0.3533)).toBeGreaterThan(87)
    expect(normalizedToHpfFreqHz(0.3533)).toBeLessThan(93)
  })
  it('Ch3: raw=0.3667 → 94 Hz (±2 Hz display rounding)', () => {
    expect(normalizedToHpfFreqHz(0.3667)).toBeGreaterThan(92)
    expect(normalizedToHpfFreqHz(0.3667)).toBeLessThan(97)
  })
  it('Ch22: raw=0.5033 → 157 Hz', () => {
    expect(normalizedToHpfFreqHz(0.5033)).toBeCloseTo(157, 0)
  })
  it('Ch4: raw=0.6200 → 242 Hz (±3 Hz display rounding)', () => {
    expect(normalizedToHpfFreqHz(0.6200)).toBeGreaterThan(239)
    expect(normalizedToHpfFreqHz(0.6200)).toBeLessThan(246)
  })
  it('range: raw=0 → ~24 Hz, raw=1 → ~1 kHz', () => {
    expect(normalizedToHpfFreqHz(0)).toBeCloseTo(24, 0)
    expect(normalizedToHpfFreqHz(1)).toBeGreaterThan(900)
    expect(normalizedToHpfFreqHz(1)).toBeLessThan(1100)
  })
  it('inverse: hpfFreqHzToNormalized round-trips within ±2%', () => {
    const raw = hpfFreqHzToNormalized(normalizedToHpfFreqHz(0.3667))
    expect(raw).toBeCloseTo(0.3667, 2)
  })
})

// ---------------------------------------------------------------------------
// EQ frequency — guided calibration (32R dense anchors 2026-07-03)
// ---------------------------------------------------------------------------

describe('normalizedToEqFreqHz — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('raw=0.000 → 36.00 Hz [guided anchor]', () => {
    expect(normalizedToEqFreqHz(0.000)).toBeCloseTo(36.00, 2)
  })
  it('raw=0.010 → 38.31 Hz [guided anchor]', () => {
    expect(normalizedToEqFreqHz(0.010)).toBeCloseTo(38.31, 2)
  })
  it('raw=0.100 → 67.02 Hz [guided anchor]', () => {
    expect(normalizedToEqFreqHz(0.100)).toBeCloseTo(67.02, 2)
  })
  it('raw=0.250 → 170.2 Hz [guided anchor]', () => {
    expect(normalizedToEqFreqHz(0.250)).toBeCloseTo(170.2, 1)
  })
  it('raw=0.500 → 805.0 Hz [guided anchor]', () => {
    expect(normalizedToEqFreqHz(0.500)).toBeCloseTo(805.0, 1)
  })
  it('raw=0.750 → 3.81 kHz [guided anchor]', () => {
    expect(normalizedToEqFreqHz(0.750)).toBeCloseTo(3810, -1)
  })
  it('raw=1.000 → 18.00 kHz [guided anchor]', () => {
    expect(normalizedToEqFreqHz(1.000)).toBeCloseTo(18000, 0)
  })
  it('inverse: eqFreqHzToNormalized round-trips within ±1%', () => {
    const raws = [0.01, 0.1, 0.25, 0.5, 0.75, 1.0]
    for (const raw of raws) {
      expect(eqFreqHzToNormalized(normalizedToEqFreqHz(raw))).toBeCloseTo(raw, 2)
    }
  })
})

// ---------------------------------------------------------------------------
// EQ Q factor — guided calibration (32R dense anchors 2026-07-03)
// ---------------------------------------------------------------------------

describe('normalizedToEqQ — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('raw=0.000 → 0.10 [guided anchor]', () => {
    expect(normalizedToEqQ(0.000)).toBeCloseTo(0.10, 2)
  })
  it('raw=0.010 → 0.10 [guided anchor]', () => {
    expect(normalizedToEqQ(0.010)).toBeCloseTo(0.10, 2)
  })
  it('raw=0.100 → 0.10 [guided anchor]', () => {
    expect(normalizedToEqQ(0.100)).toBeCloseTo(0.10, 2)
  })
  it('raw=0.250 → 0.13 [guided anchor]', () => {
    expect(normalizedToEqQ(0.250)).toBeCloseTo(0.13, 2)
  })
  it('raw=0.500 → 0.60 [guided anchor]', () => {
    expect(normalizedToEqQ(0.500)).toBeCloseTo(0.60, 1)
  })
  it('raw=0.750 → 2.97 [guided anchor]', () => {
    expect(normalizedToEqQ(0.750)).toBeCloseTo(2.97, 2)
  })
  it('raw=1.000 → 10.00 [guided anchor]', () => {
    expect(normalizedToEqQ(1.000)).toBeCloseTo(10.00, 2)
  })
  it('inverse: eqQToNormalized round-trips for representative interior values', () => {
    const qs = [0.13, 0.60, 2.97, 10.0]
    for (const q of qs) {
      expect(normalizedToEqQ(eqQToNormalized(q))).toBeCloseTo(q, 2)
    }
  })
})

// ---------------------------------------------------------------------------
// EQ band type — observed (2 types confirmed on 32SC fw 3.4.0.111374)
// raw=0.333 → LOW_SHELF, raw=1.0 → BELL (both confirmed from Ch1 UC Surface)
// ---------------------------------------------------------------------------

describe('normalizedToEqBandType — observed for BELL and LOW_SHELF', () => {
  it('raw=1.000 → BELL (confirmed Ch1 bands 2-4)', () => {
    expect(normalizedToEqBandType(1.0)).toBe('BELL')
  })
  it('raw=0.333 → LOW_SHELF (confirmed Ch1 band 1)', () => {
    expect(normalizedToEqBandType(0.333)).toBe('LOW_SHELF')
  })
})

// ---------------------------------------------------------------------------
// Comp threshold — guided calibration confirmed (32R dense anchors 2026-07-03)
// Formula: (raw-1)*56 dBFS.
// HIL Evidence: captures/cal-32r-guided/comp-threshold-dense/comp-threshold.json
// ---------------------------------------------------------------------------

describe('normalizedToCompThresholdDb — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('raw=0.000 → -56.00 dBFS [guided anchor]', () => {
    expect(normalizedToCompThresholdDb(0.000)).toBeCloseTo(-56.00, 2)
  })
  it('raw=0.010 → -55.44 dBFS [guided anchor]', () => {
    expect(normalizedToCompThresholdDb(0.010)).toBeCloseTo(-55.44, 2)
  })
  it('raw=0.100 → -50.40 dBFS [guided anchor]', () => {
    expect(normalizedToCompThresholdDb(0.100)).toBeCloseTo(-50.40, 2)
  })
  it('raw=0.250 → -42.00 dBFS [guided anchor]', () => {
    expect(normalizedToCompThresholdDb(0.250)).toBeCloseTo(-42.00, 2)
  })
  it('raw=0.500 → -28.00 dBFS [guided anchor]', () => {
    expect(normalizedToCompThresholdDb(0.500)).toBeCloseTo(-28.00, 2)
  })
  it('raw=0.750 → -14.00 dBFS [guided anchor]', () => {
    expect(normalizedToCompThresholdDb(0.750)).toBeCloseTo(-14.00, 2)
  })
  it('raw=1.000 → 0.00 dBFS [guided anchor]', () => {
    expect(normalizedToCompThresholdDb(1.000)).toBeCloseTo(0.00, 2)
  })
  it('legacy checkpoint raw=0.4930 → -28.39 dBFS', () => {
    expect(normalizedToCompThresholdDb(0.4930)).toBeCloseTo(-28.39, 1)
  })
  it('threshold is monotonically increasing across range', () => {
    const vals = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1.0].map(normalizedToCompThresholdDb)
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// Comp makeup gain — guided calibration confirmed (32R dense anchors 2026-07-03)
// Formula: raw*28.0 dB.
// HIL Evidence: captures/cal-32r-guided/comp-gain-dense/comp-gain.json
// ---------------------------------------------------------------------------

describe('normalizedToCompMakeupDb — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('raw=0.000 → 0.00 dB [guided anchor]', () => {
    expect(normalizedToCompMakeupDb(0.000)).toBeCloseTo(0.00, 2)
  })
  it('raw=0.010 → 0.28 dB [guided anchor]', () => {
    expect(normalizedToCompMakeupDb(0.010)).toBeCloseTo(0.28, 2)
  })
  it('raw=0.100 → 2.80 dB [guided anchor]', () => {
    expect(normalizedToCompMakeupDb(0.100)).toBeCloseTo(2.80, 2)
  })
  it('raw=0.250 → 7.00 dB [guided anchor]', () => {
    expect(normalizedToCompMakeupDb(0.250)).toBeCloseTo(7.00, 2)
  })
  it('raw=0.500 → 14.00 dB [guided anchor]', () => {
    expect(normalizedToCompMakeupDb(0.500)).toBeCloseTo(14.00, 2)
  })
  it('raw=0.750 → 21.00 dB [guided anchor]', () => {
    expect(normalizedToCompMakeupDb(0.750)).toBeCloseTo(21.00, 2)
  })
  it('raw=1.000 → 28.00 dB [guided anchor]', () => {
    expect(normalizedToCompMakeupDb(1.000)).toBeCloseTo(28.00, 2)
  })
  it('legacy checkpoint raw=0.315 → 8.82 dB', () => {
    expect(normalizedToCompMakeupDb(0.315)).toBeCloseTo(8.82, 1)
  })
  it('makeup gain is monotonically increasing across range', () => {
    const vals = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1.0].map(normalizedToCompMakeupDb)
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// Gate threshold — guided calibration confirmed (32R dense anchors 2026-07-03)
// Formula: (raw-1)*84 dBFS. Legacy 32SC checkpoints retained.
// HIL Evidence: captures/cal-32r-guided/gate-threshold-dense/gate-threshold.json
// ---------------------------------------------------------------------------

describe('normalizedToGateThresholdDb — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('raw=0.000 → -84.00 dBFS [guided anchor]', () => {
    expect(normalizedToGateThresholdDb(0.000)).toBeCloseTo(-84.00, 2)
  })
  it('raw=0.010 → -83.16 dBFS [guided anchor]', () => {
    expect(normalizedToGateThresholdDb(0.010)).toBeCloseTo(-83.16, 2)
  })
  it('raw=0.100 → -75.60 dBFS [guided anchor]', () => {
    expect(normalizedToGateThresholdDb(0.100)).toBeCloseTo(-75.60, 2)
  })
  it('raw=0.250 → -63.00 dBFS [guided anchor]', () => {
    expect(normalizedToGateThresholdDb(0.250)).toBeCloseTo(-63.00, 2)
  })
  it('raw=0.500 → -42.00 dBFS [guided anchor]', () => {
    expect(normalizedToGateThresholdDb(0.500)).toBeCloseTo(-42.00, 2)
  })
  it('raw=0.750 → -21.00 dBFS [guided anchor]', () => {
    expect(normalizedToGateThresholdDb(0.750)).toBeCloseTo(-21.00, 2)
  })
  it('raw=1.000 → 0.00 dBFS [guided anchor]', () => {
    expect(normalizedToGateThresholdDb(1.000)).toBeCloseTo(0.00, 2)
  })
  it('legacy checkpoint raw=0.7308 → -22.62 dBFS [32SC]', () => {
    expect(normalizedToGateThresholdDb(0.7308)).toBeCloseTo(-22.62, 1)
  })
  it('legacy checkpoint raw=0.6713 → -27.61 dBFS [32SC]', () => {
    expect(normalizedToGateThresholdDb(0.6713)).toBeCloseTo(-27.61, 1)
  })
  it('threshold is monotonically increasing across range', () => {
    const vals = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1.0].map(normalizedToGateThresholdDb)
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// Compressor attack — guided calibration (32R dense anchors 2026-07-03)
// Formula: 0.20 + 149.8*raw^2.922 ms
// HIL Evidence: captures/cal-32r-guided/comp-attack-dense/comp-attack.json
// ---------------------------------------------------------------------------

describe('normalizedToAttackMs — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('32R all-min: raw=0 → 0.20 ms [empirical anchor, exact clamp]', () => {
    expect(normalizedToAttackMs(0)).toBe(0.20)
  })
  it('raw=0.010 → 0.20 ms (±0.01 ms) [guided anchor]', () => {
    expect(normalizedToAttackMs(0.01)).toBeCloseTo(0.20, 2)
  })
  it('raw=0.100 → 0.38 ms (±0.01 ms) [guided anchor]', () => {
    expect(normalizedToAttackMs(0.10)).toBeCloseTo(0.38, 2)
  })
  it('raw=0.250 → 2.82 ms (±0.05 ms) [guided anchor]', () => {
    expect(normalizedToAttackMs(0.25)).toBeCloseTo(2.82, 1)
  })
  it('raw=0.500 → 20.0 ms (±0.05 ms) [guided anchor]', () => {
    expect(normalizedToAttackMs(0.50)).toBeCloseTo(20.0, 1)
  })
  it('raw=0.750 → 64.9 ms (±0.1 ms) [guided anchor]', () => {
    expect(normalizedToAttackMs(0.75)).toBeGreaterThan(64.8)
    expect(normalizedToAttackMs(0.75)).toBeLessThan(65.0)
  })
  it('legacy checkpoint raw=0.525 → ~23.0 ms (±0.5 ms) [2026-07-02 anchor]', () => {
    expect(normalizedToAttackMs(0.525)).toBeGreaterThan(22.5)
    expect(normalizedToAttackMs(0.525)).toBeLessThan(23.5)
  })
  it('32R all-max: raw=1.000 → 150 ms [empirical anchor, exact clamp]', () => {
    expect(normalizedToAttackMs(1.000)).toBe(150)
  })
  it('raw=0.190 → ~1.37 ms [Phase 1 measurement reconciled, formula-derived]', () => {
    expect(normalizedToAttackMs(0.190)).toBeGreaterThan(1.0)
    expect(normalizedToAttackMs(0.190)).toBeLessThan(2.0)
  })
  it('raw=0.363 → ~10 ms (±5 ms) [formula interpolation, unverified]', () => {
    expect(normalizedToAttackMs(0.363)).toBeGreaterThan(5)
    expect(normalizedToAttackMs(0.363)).toBeLessThan(20)
  })
  it('attack is monotonically increasing across range', () => {
    const vals = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0].map(normalizedToAttackMs)
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 2 — Opportunistic Calibration
// HIL Evidence: test/fixtures/32sc/fat-channel/fat-channel-phase2-calibration.json
//   Device: StudioLive 32SC SD7E21010066 fw 3.4.0.111374 (2026-07-02)
//   Endpoints guided-probed; intermediate points from session context (see fixture).
// ---------------------------------------------------------------------------
import {
  normalizedToCompRatioX,
  normalizedToGateAttackMs,
  normalizedToReleaseMs,
  normalizedToGateReleaseMs,
  normalizedToDelayMs,
  normalizedToGateRangeDb,
  normalizedToLimiterThresholdDb,
  delayMsToNormalized,
} from '../schemas/fat-channel.js'

// Comp ratio — FULL CALIBRATION from 10 confirmed 32R anchors (2026-07-02)
// Formula: 1 + exp(-0.0647 + 0.9332*x - 0.0481*x^2)  where x = ln(r/(1-r))
// Max error 3.1%, RMS 1.6% across all 9 interior confirmed anchors.
// Previous 2-param power law had max=12%, RMS=8%.
// HIL Evidence: test/fixtures/32r/fat-channel/guided/comp-ratio-*-anchor-2026-07-02.json

describe('normalizedToCompRatioX — quadratic-log calibrated 10-anchor (32R 2026-07-02)', () => {
  it('raw=0 → 1.0 (exact min)', () => {
    expect(normalizedToCompRatioX(0)).toBe(1.0)
  })
  it('raw=1 → Infinity (Limit mode)', () => {
    expect(normalizedToCompRatioX(1)).toBe(Infinity)
  })
  it('raw=0.175 → ~1.2:1 (±2%) [confirmed anchor]', () => {
    expect(normalizedToCompRatioX(0.1754)).toBeGreaterThan(1.17)
    expect(normalizedToCompRatioX(0.1754)).toBeLessThan(1.23)
  })
  it('raw=0.526 → ~2.0:1 (±3%) [confirmed anchor]', () => {
    expect(normalizedToCompRatioX(0.5263)).toBeGreaterThan(1.95)
    expect(normalizedToCompRatioX(0.5263)).toBeLessThan(2.07)
  })
  it('raw=0.632 → ~2.5:1 (±3%) [confirmed anchor]', () => {
    expect(normalizedToCompRatioX(0.6316)).toBeGreaterThan(2.43)
    expect(normalizedToCompRatioX(0.6316)).toBeLessThan(2.57)
  })
  it('raw=0.702 → ~3.0:1 (±3%) [confirmed anchor]', () => {
    expect(normalizedToCompRatioX(0.7018)).toBeGreaterThan(2.91)
    expect(normalizedToCompRatioX(0.7018)).toBeLessThan(3.09)
  })
  it('raw=0.819 → ~4.5:1 (±4%) [confirmed anchor]', () => {
    expect(normalizedToCompRatioX(0.8187)).toBeGreaterThan(4.32)
    expect(normalizedToCompRatioX(0.8187)).toBeLessThan(4.68)
  })
  it('raw=0.842 → ~5.0:1 (±3%) [confirmed anchor]', () => {
    expect(normalizedToCompRatioX(0.8421)).toBeGreaterThan(4.85)
    expect(normalizedToCompRatioX(0.8421)).toBeLessThan(5.15)
  })
  it('raw=0.877 → ~6.0:1 (±3%) [confirmed anchor]', () => {
    expect(normalizedToCompRatioX(0.8772)).toBeGreaterThan(5.82)
    expect(normalizedToCompRatioX(0.8772)).toBeLessThan(6.18)
  })
  it('raw=0.921 → ~8.0:1 (±3%) [confirmed anchor]', () => {
    expect(normalizedToCompRatioX(0.9211)).toBeGreaterThan(7.76)
    expect(normalizedToCompRatioX(0.9211)).toBeLessThan(8.24)
  })
  it('raw=0.947 → ~10.0:1 (±4%) [confirmed anchor]', () => {
    expect(normalizedToCompRatioX(0.9474)).toBeGreaterThan(9.6)
    expect(normalizedToCompRatioX(0.9474)).toBeLessThan(10.4)
  })
  it('ratio is monotonically increasing across range', () => {
    const vals = [0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95].map(normalizedToCompRatioX)
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1])
    }
  })
})

// Comp ratio — guided dense re-validation (32R 2026-07-03)
// Formula retained: 1 + exp(-0.0647 + 0.9332*x - 0.0481*x^2), x=ln(r/(1-r)).
// HIL Evidence: captures/cal-32r-guided/comp-ratio-dense/comp-ratio.json

describe('normalizedToCompRatioX — guided dense anchors (32R 2026-07-03)', () => {
  it('raw=0.000 → 1.0:1 [guided anchor]', () => {
    expect(normalizedToCompRatioX(0.000)).toBeCloseTo(1.0, 2)
  })
  it('raw=0.010 → 1.0:1 [guided anchor]', () => {
    expect(normalizedToCompRatioX(0.010)).toBeCloseTo(1.0, 1)
  })
  it('raw=0.100 → 1.1:1 [guided anchor]', () => {
    expect(normalizedToCompRatioX(0.100)).toBeCloseTo(1.1, 1)
  })
  it('raw=0.250 → 1.3:1 [guided anchor]', () => {
    expect(normalizedToCompRatioX(0.250)).toBeCloseTo(1.3, 1)
  })
  it('raw=0.500 → 1.9:1 [guided anchor]', () => {
    expect(normalizedToCompRatioX(0.500)).toBeCloseTo(1.9, 1)
  })
  it('raw=0.750 → 3.5:1 [guided anchor]', () => {
    expect(normalizedToCompRatioX(0.750)).toBeCloseTo(3.5, 1)
  })
  it('raw=1.000 → limit (20:1 in UI), mapped as Infinity', () => {
    expect(normalizedToCompRatioX(1.000)).toBe(Infinity)
  })
})

// ---------------------------------------------------------------------------
// Comp release (STANDARD) — guided calibration (32R dense anchors 2026-07-03)
// Formula: 2.5 + 897.5*raw^2.605 ms
// HIL Evidence: captures/cal-32r-guided/comp-release-dense/comp-release.json
// ---------------------------------------------------------------------------

describe('normalizedToReleaseMs — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('32R all-min: raw=0 → 2.50 ms [empirical anchor, exact]', () => {
    expect(normalizedToReleaseMs(0)).toBeCloseTo(2.5, 1)
  })
  it('raw=0.010 → 2.51 ms (±0.01 ms) [guided anchor]', () => {
    expect(normalizedToReleaseMs(0.01)).toBeCloseTo(2.51, 1)
  })
  it('raw=0.100 → 4.73 ms (±0.01 ms) [guided anchor]', () => {
    expect(normalizedToReleaseMs(0.10)).toBeCloseTo(4.73, 1)
  })
  it('raw=0.250 → 26.7 ms (±0.1 ms) [guided anchor]', () => {
    expect(normalizedToReleaseMs(0.25)).toBeCloseTo(26.7, 1)
  })
  it('raw=0.500 → 150 ms (±1 ms) [guided anchor]', () => {
    expect(normalizedToReleaseMs(0.5)).toBeGreaterThan(149)
    expect(normalizedToReleaseMs(0.5)).toBeLessThan(151)
  })
  it('raw=0.750 → 427 ms (±1 ms) [guided anchor]', () => {
    expect(normalizedToReleaseMs(0.75)).toBeGreaterThan(426)
    expect(normalizedToReleaseMs(0.75)).toBeLessThan(428)
  })
  it('legacy checkpoint raw=0.720 → 384 ms [2026-07-02 anchor]', () => {
    expect(normalizedToReleaseMs(0.7200873)).toBeCloseTo(384, 0)
  })
  it('32R all-max: raw=1.0 → 900 ms [empirical anchor, exact]', () => {
    expect(normalizedToReleaseMs(1.0)).toBeCloseTo(900, 0)
  })
  it('32SC checkpoint raw=0.365 → 67.5 ms (±2 ms)', () => {
    expect(normalizedToReleaseMs(0.365)).toBeCloseTo(67.5, 0)
  })
  it('release is monotonically increasing', () => {
    expect(normalizedToReleaseMs(0.2)).toBeLessThan(normalizedToReleaseMs(0.5))
    expect(normalizedToReleaseMs(0.5)).toBeLessThan(normalizedToReleaseMs(0.8))
  })
})

// ---------------------------------------------------------------------------
// Gate release — calibrated_inferred (7 anchor points, max error < 2ms)
// HIL: 50 + 1950*raw^1.583 ms on 32SC fw 3.4.0.111374 (Phase 2)
// ---------------------------------------------------------------------------

describe('normalizedToGateReleaseMs — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('raw=0.000 → 50.0 ms [guided anchor]', () => {
    expect(normalizedToGateReleaseMs(0)).toBeCloseTo(50, 0)
  })
  it('raw=0.010 → 51.3 ms [guided anchor]', () => {
    expect(normalizedToGateReleaseMs(0.010)).toBeCloseTo(51.3, 1)
  })
  it('raw=0.100 → 101 ms [guided anchor]', () => {
    expect(normalizedToGateReleaseMs(0.100)).toBeCloseTo(101, 0)
  })
  it('raw=0.250 → 267 ms [guided anchor]', () => {
    expect(normalizedToGateReleaseMs(0.250)).toBeCloseTo(267, 0)
  })
  it('raw=0.500 → 700 ms [guided anchor]', () => {
    expect(normalizedToGateReleaseMs(0.500)).toBeGreaterThan(695)
    expect(normalizedToGateReleaseMs(0.500)).toBeLessThan(706)
  })
  it('raw=0.750 → 1.29 s (1290 ms) [guided anchor]', () => {
    expect(normalizedToGateReleaseMs(0.750)).toBeGreaterThan(1283)
    expect(normalizedToGateReleaseMs(0.750)).toBeLessThan(1296)
  })
  it('raw=1.000 → 2.00 s (2000 ms) [guided anchor]', () => {
    expect(normalizedToGateReleaseMs(1.0)).toBeCloseTo(2000, 0)
  })
  it('legacy checkpoint raw=0.180 → 179 ms [Phase 2]', () => {
    expect(normalizedToGateReleaseMs(0.180)).toBeCloseTo(179, 0)
  })
  it('legacy checkpoint raw=0.260 → 281 ms [Phase 2]', () => {
    expect(normalizedToGateReleaseMs(0.260)).toBeCloseTo(281, 0)
  })
  it('legacy checkpoint raw=0.447 → 594 ms [Phase 2]', () => {
    expect(normalizedToGateReleaseMs(0.447)).toBeGreaterThan(589)
    expect(normalizedToGateReleaseMs(0.447)).toBeLessThan(599)
  })
  it('legacy checkpoint raw=0.880 → 1640 ms [Phase 2]', () => {
    expect(normalizedToGateReleaseMs(0.880)).toBeGreaterThan(1635)
    expect(normalizedToGateReleaseMs(0.880)).toBeLessThan(1648)
  })
  it('gate release is monotonically increasing', () => {
    expect(normalizedToGateReleaseMs(0.2)).toBeLessThan(normalizedToGateReleaseMs(0.5))
    expect(normalizedToGateReleaseMs(0.5)).toBeLessThan(normalizedToGateReleaseMs(0.8))
  })
})

// ---------------------------------------------------------------------------
// Channel delay — guided calibration (32R dense anchors 2026-07-03)
// Formula: raw * 85 ms
// HIL Evidence: captures/cal-32r-guided/delay-dense/delay.json
// ---------------------------------------------------------------------------

describe('normalizedToDelayMs — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('raw=0.000 → 0.0 ms [guided anchor]', () => {
    expect(normalizedToDelayMs(0.000)).toBeCloseTo(0.0, 2)
  })
  it('raw=0.010 → 0.8 ms display (0.85 ms exact) [guided anchor]', () => {
    expect(normalizedToDelayMs(0.010)).toBeCloseTo(0.85, 2)
  })
  it('raw=0.100 → 8.5 ms [guided anchor]', () => {
    expect(normalizedToDelayMs(0.100)).toBeCloseTo(8.5, 2)
  })
  it('raw=0.250 → 21.2 ms display (21.25 ms exact) [guided anchor]', () => {
    expect(normalizedToDelayMs(0.250)).toBeCloseTo(21.25, 2)
  })
  it('raw=0.500 → 42.5 ms [guided anchor]', () => {
    expect(normalizedToDelayMs(0.500)).toBeCloseTo(42.5, 2)
  })
  it('raw=0.750 → 63.8 ms display (63.75 ms exact) [guided anchor]', () => {
    expect(normalizedToDelayMs(0.750)).toBeCloseTo(63.75, 2)
  })
  it('raw=1.000 → 85.0 ms [guided anchor]', () => {
    expect(normalizedToDelayMs(1.000)).toBeCloseTo(85.0, 2)
  })
  it('inverse: delayMsToNormalized round-trips dense points', () => {
    const raws = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1.0]
    for (const raw of raws) {
      expect(delayMsToNormalized(normalizedToDelayMs(raw))).toBeCloseTo(raw, 3)
    }
  })
})

// ---------------------------------------------------------------------------
// Gate range (GATE mode, expander=false) — guided calibration (32R, 2026-07-03)
// Piecewise interpolation anchored by dense PV-echo + display readback points.
// ---------------------------------------------------------------------------

describe('normalizedToGateRangeDb — guided calibration (32R dense anchors)', () => {
  it('raw=0 → -84dB (exact min)', () => {
    expect(normalizedToGateRangeDb(0)).toBe(-84)
  })

  it('matches sparse anchors from initial + recheck sweeps', () => {
    expect(normalizedToGateRangeDb(0.1)).toBeCloseTo(-67.29, 2)
    expect(normalizedToGateRangeDb(0.25)).toBeCloseTo(-46.5, 2)
    expect(normalizedToGateRangeDb(0.5)).toBeCloseTo(-21.0, 2)
    expect(normalizedToGateRangeDb(0.625)).toBeCloseTo(-14.0, 2)
    expect(normalizedToGateRangeDb(0.75)).toBeCloseTo(-6.6, 2)
    expect(normalizedToGateRangeDb(0.875)).toBeCloseTo(-4.23, 2)
    expect(normalizedToGateRangeDb(0.9)).toBeCloseTo(-3.5, 2)
    expect(normalizedToGateRangeDb(1.0)).toBe(0)
  })

  it('matches dense sweep anchors', () => {
    expect(normalizedToGateRangeDb(0.55)).toBeCloseTo(-17.43, 2)
    expect(normalizedToGateRangeDb(0.6)).toBeCloseTo(-14.29, 2)
    expect(normalizedToGateRangeDb(0.65)).toBeCloseTo(-11.57, 2)
    expect(normalizedToGateRangeDb(0.7)).toBeCloseTo(-9.43, 2)
    expect(normalizedToGateRangeDb(0.8)).toBeCloseTo(-5.38, 2)
    expect(normalizedToGateRangeDb(0.85)).toBeCloseTo(-4.62, 2)
    expect(normalizedToGateRangeDb(0.95)).toBeCloseTo(-1.43, 2)
  })

  it('is monotonically increasing (less negative toward raw=1)', () => {
    expect(normalizedToGateRangeDb(0.55)).toBeLessThan(normalizedToGateRangeDb(0.7))
    expect(normalizedToGateRangeDb(0.7)).toBeLessThan(normalizedToGateRangeDb(0.85))
    expect(normalizedToGateRangeDb(0.85)).toBeLessThan(normalizedToGateRangeDb(0.95))
  })

  it('clamps outside range [0,1]', () => {
    expect(normalizedToGateRangeDb(-1)).toBe(-84)
    expect(normalizedToGateRangeDb(2)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Limiter threshold — guided calibration (32R, dense anchors 2026-07-03)
// HIL: (raw-1)*28 dBFS
// ---------------------------------------------------------------------------

describe('normalizedToLimiterThresholdDb — guided calibration (32R dense anchors)', () => {
  it('raw=0.000 → -28.00 dBFS (exact min)', () => {
    expect(normalizedToLimiterThresholdDb(0.0)).toBeCloseTo(-28.0, 2)
  })
  it('raw=0.100 → -25.20 dBFS (exact)', () => {
    expect(normalizedToLimiterThresholdDb(0.1)).toBeCloseTo(-25.2, 2)
  })
  it('raw=0.250 → -21.00 dBFS (exact)', () => {
    expect(normalizedToLimiterThresholdDb(0.25)).toBeCloseTo(-21.0, 2)
  })
  it('raw=0.500 → -14.00 dBFS (exact)', () => {
    expect(normalizedToLimiterThresholdDb(0.5)).toBeCloseTo(-14.0, 2)
  })
  it('raw=0.725 → -7.70 dBFS (exact)', () => {
    expect(normalizedToLimiterThresholdDb(0.725)).toBeCloseTo(-7.7, 2)
  })
  it('raw=0.890 → -3.08 dBFS (exact)', () => {
    expect(normalizedToLimiterThresholdDb(0.89)).toBeCloseTo(-3.08, 2)
  })
  it('raw=1.000 → 0.00 dBFS (exact max)', () => {
    expect(normalizedToLimiterThresholdDb(1.0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Comp keyfilter frequency — guided calibration (32R dense anchors 2026-07-03)
// Formula: 40 × 400^raw Hz  (raw > 0); raw=0 → 'off'
// HIL Evidence: captures/cal-32r-guided/comp-keyfilter-dense/comp-keyfilter.json
// ---------------------------------------------------------------------------
import { normalizedToKeyfilterHz } from '../schemas/fat-channel.js'

describe('normalizedToKeyfilterHz — guided calibration (32R dense anchors 2026-07-03)', () => {
  it('raw=0 → "off" [empirical: min stop displayed as off]', () => {
    expect(normalizedToKeyfilterHz(0)).toBe('off')
  })
  it('raw=0.010 → 42.47 Hz (±0.05 Hz) [guided anchor]', () => {
    const v = normalizedToKeyfilterHz(0.010)
    expect(typeof v).toBe('number')
    expect(v as number).toBeCloseTo(42.47, 1)
  })
  it('raw=0.100 → 72.82 Hz (±0.05 Hz) [guided anchor]', () => {
    const v = normalizedToKeyfilterHz(0.100)
    expect(typeof v).toBe('number')
    expect(v as number).toBeCloseTo(72.82, 1)
  })
  it('raw=0.250 → 178.9 Hz (±0.1 Hz) [guided anchor]', () => {
    const v = normalizedToKeyfilterHz(0.250)
    expect(typeof v).toBe('number')
    expect(v as number).toBeCloseTo(178.9, 1)
  })
  it('raw=0.500 → 800.0 Hz [guided anchor, exact]', () => {
    const v = normalizedToKeyfilterHz(0.500)
    expect(typeof v).toBe('number')
    expect(v as number).toBeCloseTo(800.0, 1)
  })
  it('raw=0.750 → 3.58 kHz (3580 Hz) (±3 Hz) [guided anchor]', () => {
    const v = normalizedToKeyfilterHz(0.750)
    expect(typeof v).toBe('number')
    expect(v as number).toBeGreaterThan(3577)
    expect(v as number).toBeLessThan(3583)
  })
  it('32R all-max: raw=1.0 → 16000 Hz [empirical anchor, exact clamp]', () => {
    expect(normalizedToKeyfilterHz(1.0)).toBe(16000)
  })
  it('frequency is monotonically increasing', () => {
    const vals = [0.1, 0.3, 0.5, 0.7, 0.9, 1.0].map(r => normalizedToKeyfilterHz(r) as number)
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// Gate attack — guided calibration (32R dense anchors 2026-07-03)
// ---------------------------------------------------------------------------

describe('normalizedToGateAttackMs — guided calibration (32R dense anchors)', () => {
  it('raw=0.000 -> 0.02 ms (exact min)', () => {
    expect(normalizedToGateAttackMs(0.0)).toBeCloseTo(0.02, 3)
  })
  it('raw=0.010 -> 0.02 ms (low-end plateau)', () => {
    expect(normalizedToGateAttackMs(0.01)).toBeCloseTo(0.02, 3)
  })
  it('raw=0.100 -> 0.10 ms (exact anchor)', () => {
    expect(normalizedToGateAttackMs(0.1)).toBeCloseTo(0.10, 2)
  })
  it('raw=0.250 -> 0.47 ms (exact anchor)', () => {
    expect(normalizedToGateAttackMs(0.25)).toBeCloseTo(0.47, 2)
  })
  it('raw=0.500 -> 5.00 ms (exact anchor)', () => {
    expect(normalizedToGateAttackMs(0.5)).toBeCloseTo(5.00, 2)
  })
  it('raw=0.750 -> 50.1 ms (exact anchor)', () => {
    expect(normalizedToGateAttackMs(0.75)).toBeCloseTo(50.1, 1)
  })
  it('raw=1.000 -> 500 ms (exact max)', () => {
    expect(normalizedToGateAttackMs(1.0)).toBeCloseTo(500.0, 1)
  })
  it('is monotonically increasing across range', () => {
    const vals = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1.0].map(normalizedToGateAttackMs)
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1])
    }
  })
  it('clamps outside [0,1]', () => {
    expect(normalizedToGateAttackMs(-0.1)).toBeCloseTo(0.02, 3)
    expect(normalizedToGateAttackMs(1.5)).toBeCloseTo(500.0, 1)
  })
})

describe('normalizedToKeyfilterHz — gate.keyfilter parity (32R dense anchors 2026-07-03)', () => {
  it('matches gate.keyfilter guided anchors (same taper as comp.keyfilter)', () => {
    expect(normalizedToKeyfilterHz(0)).toBe('off')
    expect(normalizedToKeyfilterHz(0.01)).toBeCloseTo(42.47, 1)
    expect(normalizedToKeyfilterHz(0.1)).toBeCloseTo(72.82, 1)
    expect(normalizedToKeyfilterHz(0.25)).toBeCloseTo(178.9, 1)
    expect(normalizedToKeyfilterHz(0.5)).toBeCloseTo(800.0, 1)

    const at075 = normalizedToKeyfilterHz(0.75)
    expect(typeof at075).toBe('number')
    expect(at075 as number).toBeGreaterThan(3577)
    expect(at075 as number).toBeLessThan(3583)

    expect(normalizedToKeyfilterHz(1)).toBe(16000)
  })
})

// EQ band type Phase 2 — HIGH_SHELF confirmed observed; LOW_PASS not observed
// in STANDARD EQ testing on 32SC fw 3.4.0.111374 (may exist in other models/firmware).

describe('normalizedToEqBandType — Phase 2 updates (HIGH_SHELF observed, LOW_PASS absent)', () => {
  it('raw=0.667 → HIGH_SHELF (observed Phase 2)', () => {
    expect(normalizedToEqBandType(0.667)).toBe('HIGH_SHELF')
  })
  it('raw=0.333 → LOW_SHELF (observed Phase 1)', () => {
    expect(normalizedToEqBandType(0.333)).toBe('LOW_SHELF')
  })
  it('raw=1.000 → BELL (observed Phase 1)', () => {
    expect(normalizedToEqBandType(1.000)).toBe('BELL')
  })
})
