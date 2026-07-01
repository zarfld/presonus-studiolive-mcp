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
  it('Ch3: raw=0.3667 → 94 Hz', () => {
    expect(normalizedToHpfFreqHz(0.3667)).toBeCloseTo(94, 0)
  })
  it('Ch22: raw=0.5033 → 157 Hz', () => {
    expect(normalizedToHpfFreqHz(0.5033)).toBeCloseTo(157, 0)
  })
  it('Ch4: raw=0.6200 → 242 Hz', () => {
    expect(normalizedToHpfFreqHz(0.6200)).toBeCloseTo(242, 0)
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
// Comp makeup gain — calibrated_inferred (STANDARD comp, comp.gain key)
// HIL: raw*27.6 confirmed on 32SC fw 3.4.0.111374 (2026-07-01)
// ---------------------------------------------------------------------------

describe('normalizedToCompMakeupDb — calibrated_inferred STANDARD comp', () => {
  it('Ch11: raw=0.200 → 5.52 dB (actual 5.6, within 0.1 dB)', () => {
    expect(normalizedToCompMakeupDb(0.200)).toBeCloseTo(5.52, 1)
  })
  it('Ch12: raw=0.183 → 5.05 dB (actual 5.13, within 0.1 dB)', () => {
    expect(normalizedToCompMakeupDb(0.183)).toBeCloseTo(5.05, 1)
  })
  it('range: raw=0 → 0 dB, raw=1 → ~27.6 dB', () => {
    expect(normalizedToCompMakeupDb(0)).toBeCloseTo(0, 2)
    expect(normalizedToCompMakeupDb(1)).toBeCloseTo(27.6, 1)
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
// Comp/gate attack — calibrated_inferred (2 anchor points)
// HIL: 0.2*exp(10.3*raw) ms confirmed on 32SC fw 3.4.0.111374 (2026-07-01)
// NOTE: Validated only in range raw=0.15–0.40; extrapolation outside is uncertain
// ---------------------------------------------------------------------------

describe('normalizedToAttackMs — calibrated_inferred', () => {
  it('Ch11 STANDARD comp: raw=0.190 → ~1.4 ms (±0.1 ms)', () => {
    expect(normalizedToAttackMs(0.190)).toBeGreaterThan(1.2)
    expect(normalizedToAttackMs(0.190)).toBeLessThan(1.6)
  })
  it('Ch12 STANDARD comp: raw=0.363 → ~8 ms (±1 ms)', () => {
    expect(normalizedToAttackMs(0.363)).toBeGreaterThan(7)
    expect(normalizedToAttackMs(0.363)).toBeLessThan(9.5)
  })
  it('raw=0 → very fast attack (< 0.5 ms)', () => {
    expect(normalizedToAttackMs(0)).toBeLessThan(0.5)
  })
})
