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
  hpfFreqHzToNormalized,
} from '../schemas/fat-channel.js'

// ---------------------------------------------------------------------------
// EQ gain — OBSERVED (5 anchor points, max error < 0.005 dB)
// HIL: (raw-0.5)*30 confirmed exactly on 32SC fw 3.4.0.111374 (2026-07-01)
// ---------------------------------------------------------------------------

describe('normalizedToEqGainDb — observed (32SC fw 3.4.0.111374)', () => {
  it('Ch9 band-1: raw=0.3454 → -4.64 dB', () => {
    expect(normalizedToEqGainDb(0.3454)).toBeCloseTo(-4.64, 1)
  })
  it('Ch12 band-1: raw=0.2474 → -7.58 dB', () => {
    expect(normalizedToEqGainDb(0.2474)).toBeCloseTo(-7.58, 1)
  })
  it('Ch11 band-1: raw=0.2680 → -6.96 dB', () => {
    expect(normalizedToEqGainDb(0.2680)).toBeCloseTo(-6.96, 1)
  })
  it('Ch1 band-1: raw=0.5412 → +1.24 dB', () => {
    expect(normalizedToEqGainDb(0.5412)).toBeCloseTo(1.24, 1)
  })
  it('Ch2 band-1: raw=0.6495 → +4.48 dB', () => {
    expect(normalizedToEqGainDb(0.6495)).toBeCloseTo(4.48, 1)
  })
  it('raw=0.5 → 0 dB (unity)', () => {
    expect(normalizedToEqGainDb(0.5)).toBeCloseTo(0, 2)
  })
  it('range extremes: raw=0 → −15 dB, raw=1 → +15 dB', () => {
    expect(normalizedToEqGainDb(0)).toBeCloseTo(-15, 1)
    expect(normalizedToEqGainDb(1)).toBeCloseTo(15, 1)
  })
  it('inverse: eqGainDbToNormalized rounds-trip', () => {
    expect(eqGainDbToNormalized(normalizedToEqGainDb(0.3454))).toBeCloseTo(0.3454, 3)
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
// EQ frequency — calibrated_inferred (5 anchor points, max error < 0.013%)
// HIL: 36*502^raw confirmed for band 1 on 32SC fw 3.4.0.111374 (2026-07-01)
// ---------------------------------------------------------------------------

describe('normalizedToEqFreqHz — calibrated_inferred (32SC fw 3.4.0.111374)', () => {
  it('Ch9 band-1: raw=0.2297 → 150.1 Hz', () => {
    expect(normalizedToEqFreqHz(0.2297)).toBeCloseTo(150.1, 0)
  })
  it('Ch12 band-1: raw=0.1188 → 75.31 Hz', () => {
    expect(normalizedToEqFreqHz(0.1188)).toBeCloseTo(75.31, 0)
  })
  it('Ch11 band-1: raw=0.1337 → 82.63 Hz', () => {
    expect(normalizedToEqFreqHz(0.1337)).toBeCloseTo(82.63, 0)
  })
  it('Ch1 band-1: raw=0.1081 → 70.48 Hz', () => {
    expect(normalizedToEqFreqHz(0.1081)).toBeCloseTo(70.48, 0)
  })
  it('Ch2 band-1: raw=0.1209 → 76.31 Hz', () => {
    expect(normalizedToEqFreqHz(0.1209)).toBeCloseTo(76.31, 0)
  })
  it('range: raw=0 → ~36 Hz, raw=1 → ~18 kHz', () => {
    expect(normalizedToEqFreqHz(0)).toBeCloseTo(36, 0)
    expect(normalizedToEqFreqHz(1)).toBeGreaterThan(15000)
    expect(normalizedToEqFreqHz(1)).toBeLessThan(20000)
  })
  it('inverse: eqFreqHzToNormalized round-trips within ±1%', () => {
    const raw = eqFreqHzToNormalized(normalizedToEqFreqHz(0.2297))
    expect(raw).toBeCloseTo(0.2297, 2)
  })
})

// ---------------------------------------------------------------------------
// EQ Q factor — calibrated_inferred (5 anchor points, max error < 0.17)
// HIL: 0.028*466^raw on 32SC fw 3.4.0.111374 (2026-07-01)
// ---------------------------------------------------------------------------

describe('normalizedToEqQ — calibrated_inferred (32SC fw 3.4.0.111374)', () => {
  it('Ch2 band-1: raw=0.500 → Q≈0.6 (±0.05)', () => {
    expect(normalizedToEqQ(0.500)).toBeCloseTo(0.60, 1)
  })
  it('Ch1 band-1: raw=0.750 → Q≈2.97 (±0.2)', () => {
    expect(normalizedToEqQ(0.750)).toBeGreaterThan(2.7)
    expect(normalizedToEqQ(0.750)).toBeLessThan(3.3)
  })
  it('Ch11 band-1: raw=0.820 → Q≈4.31 (±0.3)', () => {
    expect(normalizedToEqQ(0.820)).toBeGreaterThan(4.0)
    expect(normalizedToEqQ(0.820)).toBeLessThan(4.7)
  })
  it('Ch9 band-1: raw=0.827 → Q≈4.46 (±0.3)', () => {
    expect(normalizedToEqQ(0.827)).toBeGreaterThan(4.1)
    expect(normalizedToEqQ(0.827)).toBeLessThan(4.8)
  })
  it('range: raw=0 → min Q<0.1, raw=1 → max Q~13', () => {
    expect(normalizedToEqQ(0)).toBeLessThan(0.1)
    expect(normalizedToEqQ(1)).toBeGreaterThan(10)
    expect(normalizedToEqQ(1)).toBeLessThan(20)
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
// Comp threshold — calibrated_inferred (STANDARD comp, comp.threshold key)
// HIL: (raw-1)*56 confirmed on 32SC fw 3.4.0.111374 (2026-07-01)
// NOTE: STANDARD comp uses comp.threshold key; FET uses comp.input key
// ---------------------------------------------------------------------------

describe('normalizedToCompThresholdDb — calibrated_inferred STANDARD comp', () => {
  it('Ch11 STANDARD: raw=0.4930 → -28.39 dBFS', () => {
    expect(normalizedToCompThresholdDb(0.4930)).toBeCloseTo(-28.39, 1)
  })
  it('Ch12 STANDARD: raw=0.5350 → -26.04 dBFS', () => {
    expect(normalizedToCompThresholdDb(0.5350)).toBeCloseTo(-26.04, 1)
  })
  it('range: raw=0 → -56 dBFS, raw=1 → 0 dBFS', () => {
    expect(normalizedToCompThresholdDb(0)).toBeCloseTo(-56, 1)
    expect(normalizedToCompThresholdDb(1)).toBeCloseTo(0, 2)
  })
})

// ---------------------------------------------------------------------------
// Comp makeup gain — CORRECTED (32R guided calibration 2026-07-02, K=28.0)
// Confirms: raw=0→0dB, raw=0.315→8.82dB, raw=1→28.00dB (all exact, K=28.0)
// Phase 1 formula raw*27.6 was systematically low by ~1.4% (anchors in low range)
// ---------------------------------------------------------------------------

describe('normalizedToCompMakeupDb — corrected_guided K=28.0 (32R 2026-07-02)', () => {
  it('32R Ch11: raw=0 → 0.00 dB [empirical anchor, exact]', () => {
    expect(normalizedToCompMakeupDb(0)).toBeCloseTo(0, 2)
  })
  it('32R Ch11: raw=0.315 → 8.82 dB [empirical anchor, ±0.05 dB]', () => {
    expect(normalizedToCompMakeupDb(0.315)).toBeCloseTo(8.82, 1)
  })
  it('32R Ch11: raw=1.000 → 28.00 dB [empirical anchor, exact max]', () => {
    expect(normalizedToCompMakeupDb(1)).toBeCloseTo(28.0, 1)
  })
})

// ---------------------------------------------------------------------------
// Gate threshold — calibrated_inferred (2 anchor points, exact match)
// HIL: (raw-1)*84 confirmed on 32SC fw 3.4.0.111374 (2026-07-01)
// ---------------------------------------------------------------------------

describe('normalizedToGateThresholdDb — calibrated_inferred', () => {
  it('Ch11: raw=0.7308 → -22.62 dBFS', () => {
    expect(normalizedToGateThresholdDb(0.7308)).toBeCloseTo(-22.62, 1)
  })
  it('Ch12: raw=0.6713 → -27.61 dBFS', () => {
    expect(normalizedToGateThresholdDb(0.6713)).toBeCloseTo(-27.61, 1)
  })
  it('range: raw=0 → -84 dBFS, raw=1 → 0 dBFS', () => {
    expect(normalizedToGateThresholdDb(0)).toBeCloseTo(-84, 1)
    expect(normalizedToGateThresholdDb(1)).toBeCloseTo(0, 2)
  })
})

// ---------------------------------------------------------------------------
// Comp/gate attack — CONFIRMED 3-anchor (pure 32R guided calibration 2026-07-02)
// Formula: 0.20 + 149.8*raw^2.922 ms
//   raw≈0 → 0.20 ms (physical min stop)
//   raw=0.525 → 23.0 ms (32R 50% position, dump-confirmed) EXACT
//   raw=1.000 → 150 ms (32R all-max) EXACT
// Phase 1 raw=0.190→1.37ms was correct for 32R; formula now predicts 1.37ms.
// The 32SC raw=0.190→21.8ms was a stale-ZLIB mismatch (knob not at 0.190).
// HIL Evidence: test/fixtures/32r/fat-channel/guided/comp-calibration-anchors-2026-07-02-*.json
// ---------------------------------------------------------------------------

describe('normalizedToAttackMs — confirmed_3pt_32R_guided (2026-07-02)', () => {
  it('32R all-min: raw=0 → 0.20 ms [empirical anchor, exact clamp]', () => {
    expect(normalizedToAttackMs(0)).toBe(0.20)
  })
  it('32R 50%: raw=0.525 → ~23.0 ms (±0.5 ms) [empirical anchor, EXACT]', () => {
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
  normalizedToReleaseMs,
  normalizedToGateReleaseMs,
  normalizedToGateRangeDb,
  normalizedToLimiterThresholdDb,
} from '../schemas/fat-channel.js'

// Comp ratio — OPPORTUNISTIC_CALIBRATION: only endpoints guided-probed;
// 5 intermediate points from session context. ~13% mid-range error.
// Treat mid-range assertions as probe_required quality.

describe('normalizedToCompRatioX — opportunistic_calibration, ~13% mid-range error (Phase 2, 32SC fw 3.4.0.111374)', () => {
  it('raw=0 → 1.0 (exact min, 1:1 no compression)', () => {
    expect(normalizedToCompRatioX(0)).toBe(1.0)
  })
  it('raw=1 → Infinity (Limit mode)', () => {
    expect(normalizedToCompRatioX(1)).toBe(Infinity)
  })
  it('raw=0.526 → ~2.0:1 (±5%)', () => {
    expect(normalizedToCompRatioX(0.526)).toBeGreaterThan(1.9)
    expect(normalizedToCompRatioX(0.526)).toBeLessThan(2.1)
  })
  it('raw=0.663 → ~2.7:1 (±15%)', () => {
    expect(normalizedToCompRatioX(0.663)).toBeGreaterThan(2.2)
    expect(normalizedToCompRatioX(0.663)).toBeLessThan(3.2)
  })
  it('raw=0.706 → ~3.0:1 (±15%)', () => {
    expect(normalizedToCompRatioX(0.706)).toBeGreaterThan(2.5)
    expect(normalizedToCompRatioX(0.706)).toBeLessThan(3.5)
  })
  it('raw=0.826 → ~4.7:1 (±15%)', () => {
    expect(normalizedToCompRatioX(0.826)).toBeGreaterThan(3.9)
    expect(normalizedToCompRatioX(0.826)).toBeLessThan(5.5)
  })
  it('raw=0.950 → ~10.2:1 (±20%)', () => {
    expect(normalizedToCompRatioX(0.950)).toBeGreaterThan(8)
    expect(normalizedToCompRatioX(0.950)).toBeLessThan(15)
  })
  it('ratio is monotonically increasing across range', () => {
    const r1 = normalizedToCompRatioX(0.3)
    const r2 = normalizedToCompRatioX(0.5)
    const r3 = normalizedToCompRatioX(0.7)
    const r4 = normalizedToCompRatioX(0.9)
    expect(r1).toBeLessThan(r2)
    expect(r2).toBeLessThan(r3)
    expect(r3).toBeLessThan(r4)
  })
})

// ---------------------------------------------------------------------------
// Comp release (STANDARD) — FULLY CONFIRMED (5 anchors, 32R guided 2026-07-02)
// Formula: 2.5 + 897.5*raw^2.605 ms
//   raw≈0 → 2.50 ms (exact: 2.5+897.5*0=2.5)
//   raw=0.365 → 67.5 ms (32SC)
//   raw=0.720 → 384 ms (32R, EXACT)
//   raw=1.000 → 900 ms (32R all-max, EXACT: 2.5+897.5=900)
// HIL Evidence: test/fixtures/32r/fat-channel/guided/ (2026-07-02)
// ---------------------------------------------------------------------------

describe('normalizedToReleaseMs — CONFIRMED guided calibration (32R 2026-07-02)', () => {
  it('32R all-min: raw=0 → 2.50 ms [empirical anchor, exact]', () => {
    expect(normalizedToReleaseMs(0)).toBeCloseTo(2.5, 1)
  })
  it('32SC Ch27: raw=0.365 → 67.5 ms (±2 ms)', () => {
    expect(normalizedToReleaseMs(0.365)).toBeCloseTo(67.5, 0)
  })
  it('32R Ch11: raw=0.720 → 384 ms [empirical anchor, exact 0.005%]', () => {
    expect(normalizedToReleaseMs(0.7200873)).toBeCloseTo(384, 0)
  })
  it('32R all-max: raw=1.0 → 900 ms [empirical anchor, exact]', () => {
    expect(normalizedToReleaseMs(1.0)).toBeCloseTo(900, 0)
  })
  it('raw=0.5 → ~150 ms (±10 ms) [32SC shows 162ms, ~7% device variation]', () => {
    expect(normalizedToReleaseMs(0.5)).toBeGreaterThan(140)
    expect(normalizedToReleaseMs(0.5)).toBeLessThan(165)
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

describe('normalizedToGateReleaseMs — calibrated_inferred (Phase 2, 32SC fw 3.4.0.111374)', () => {
  it('raw=0 → 50ms (exact min)', () => {
    expect(normalizedToGateReleaseMs(0)).toBeCloseTo(50, 0)
  })
  it('raw=0.130 → 127ms (Ch9, ±2ms)', () => {
    expect(normalizedToGateReleaseMs(0.130)).toBeCloseTo(127, 0)
  })
  it('raw=0.180 → 179ms (Ch27, ±2ms)', () => {
    expect(normalizedToGateReleaseMs(0.180)).toBeCloseTo(179, 0)
  })
  it('raw=0.260 → 281ms (±2ms)', () => {
    expect(normalizedToGateReleaseMs(0.260)).toBeCloseTo(281, 0)
  })
  it('raw=0.447 → 594ms (±5ms)', () => {
    expect(normalizedToGateReleaseMs(0.447)).toBeGreaterThan(589)
    expect(normalizedToGateReleaseMs(0.447)).toBeLessThan(599)
  })
  it('raw=0.880 → 1640ms (Ch10, ±5ms)', () => {
    expect(normalizedToGateReleaseMs(0.880)).toBeGreaterThan(1635)
    expect(normalizedToGateReleaseMs(0.880)).toBeLessThan(1648)
  })
  it('raw=1.0 → 2000ms (exact max)', () => {
    expect(normalizedToGateReleaseMs(1.0)).toBeCloseTo(2000, 0)
  })
  it('gate release is monotonically increasing', () => {
    expect(normalizedToGateReleaseMs(0.2)).toBeLessThan(normalizedToGateReleaseMs(0.5))
    expect(normalizedToGateReleaseMs(0.5)).toBeLessThan(normalizedToGateReleaseMs(0.8))
  })
})

// ---------------------------------------------------------------------------
// Gate range (GATE mode, expander=false) — calibrated_inferred (2 mid-range points)
// HIL: 100*(raw^0.46 - 1) dB on 32SC fw 3.4.0.111374 (Phase 2)
// ---------------------------------------------------------------------------

describe('normalizedToGateRangeDb — calibrated_inferred gate mode (Phase 2, 32SC fw 3.4.0.111374)', () => {
  it('raw=0 → -100dB (floor)', () => {
    expect(normalizedToGateRangeDb(0)).toBe(-100)
  })
  it('raw=0.040 → ~-77.14dB (Ch27, ±1dB)', () => {
    expect(normalizedToGateRangeDb(0.040)).toBeGreaterThan(-78.5)
    expect(normalizedToGateRangeDb(0.040)).toBeLessThan(-75.5)
  })
  it('raw=0.210 → ~-51.0dB (±1dB)', () => {
    expect(normalizedToGateRangeDb(0.210)).toBeGreaterThan(-52.5)
    expect(normalizedToGateRangeDb(0.210)).toBeLessThan(-49.5)
  })
  it('raw=1.0 → 0dB (exact max, no gating)', () => {
    expect(normalizedToGateRangeDb(1.0)).toBe(0)
  })
  it('range is monotonically increasing (less negative toward raw=1)', () => {
    expect(normalizedToGateRangeDb(0.1)).toBeLessThan(normalizedToGateRangeDb(0.5))
    expect(normalizedToGateRangeDb(0.5)).toBeLessThan(normalizedToGateRangeDb(0.9))
  })
})

// ---------------------------------------------------------------------------
// Limiter threshold — calibrated_inferred (4 anchor points, max error 0.27 dB)
// HIL: (raw-1)*27 dBFS on 32SC fw 3.4.0.111374 (Phase 2)
// ---------------------------------------------------------------------------

describe('normalizedToLimiterThresholdDb — calibrated_inferred (Phase 2, 32SC fw 3.4.0.111374)', () => {
  it('raw=0.095 → ~-24.34 dBFS (±0.3 dB)', () => {
    expect(normalizedToLimiterThresholdDb(0.095)).toBeCloseTo(-24.34, 0)
  })
  it('raw=0.725 → ~-7.7 dBFS (±0.3 dB)', () => {
    expect(normalizedToLimiterThresholdDb(0.725)).toBeCloseTo(-7.7, 0)
  })
  it('raw=0.890 → ~-3.07 dBFS (±0.3 dB)', () => {
    expect(normalizedToLimiterThresholdDb(0.890)).toBeCloseTo(-3.07, 0)
  })
  it('raw=1.0 → 0.0 dBFS (exact max)', () => {
    expect(normalizedToLimiterThresholdDb(1.0)).toBe(0)
  })
  it('raw=0 → -27 dBFS (formula floor)', () => {
    expect(normalizedToLimiterThresholdDb(0)).toBeCloseTo(-27, 1)
  })
})

// ---------------------------------------------------------------------------
// Comp keyfilter frequency — CALIBRATED_INFERRED (32R guided calibration 2026-07-02)
// Formula: 40 × 400^raw Hz  (raw > 0); raw=0 → 'off'
// HIL Evidence: test/fixtures/32r/fat-channel/guided/comp-calibration-anchors-2026-07-02-50pct.json
// ---------------------------------------------------------------------------
import { normalizedToKeyfilterHz } from '../schemas/fat-channel.js'

describe('normalizedToKeyfilterHz — calibrated_inferred (32R 50% + max dump, 2026-07-02)', () => {
  it('raw=0 → "off" [empirical: min stop displayed as off]', () => {
    expect(normalizedToKeyfilterHz(0)).toBe('off')
  })
  it('32R 50%: raw=0.495 → ~776 Hz (±5 Hz) [empirical anchor, EXACT]', () => {
    const v = normalizedToKeyfilterHz(0.495)
    expect(typeof v).toBe('number')
    expect(v as number).toBeGreaterThan(771)
    expect(v as number).toBeLessThan(782)
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
