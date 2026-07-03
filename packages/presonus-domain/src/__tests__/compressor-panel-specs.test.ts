import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  COMPRESSOR_PANEL_SPECS,
  CompressorModelPanelSpecSchema,
} from '../schemas/compressor-panel-specs.js'

describe('compressor front-panel baseline specs', () => {
  it('contains all eight uncalibrated compressor model specs', () => {
    const required = [
      'COMP_160',
      'BRIT_COMP',
      'CLASSIC_COMPRESSOR',
      'EVEREST_C100A',
      'FC_670',
      'RC_500_COMPRESSOR',
      'TUBE_CB',
      'VT_1_COMPRESSOR',
    ]

    for (const id of required) {
      expect(COMPRESSOR_PANEL_SPECS[id as keyof typeof COMPRESSOR_PANEL_SPECS]).toBeDefined()
    }
  })

  it('all specs are front-panel baselines only', () => {
    for (const spec of Object.values(COMPRESSOR_PANEL_SPECS)) {
      const parsed = CompressorModelPanelSpecSchema.parse(spec)
      expect(parsed.calibrationStatus).toBe('front_panel_baseline_only')
      expect(parsed.mappingStatus).toBe('front_panel_labels_only')
      expect(parsed.source).toBe('uc_surface_screenshot')
      expect(parsed.sourceConfidence).toBe('visual_label_observed')
    }
  })

  it('every knob declares rawRange [0,1]', () => {
    for (const spec of Object.values(COMPRESSOR_PANEL_SPECS)) {
      const all = [...spec.controls, ...spec.switches, ...spec.sidechain]
      for (const c of all) {
        if (c.controlType === 'knob') {
          expect(c.rawRange).toEqual([0, 1])
        }
      }
    }
  })

  it('every model has side-chain controls', () => {
    for (const spec of Object.values(COMPRESSOR_PANEL_SPECS)) {
      expect(spec.sidechain.length).toBeGreaterThan(0)
      expect(spec.sidechain.some((c) => c.controlId === 'sidechain_input')).toBe(true)
      expect(spec.sidechain.some((c) => c.controlId === 'key_filter')).toBe(true)
    }
  })

  it('does not claim observed or calibrated_inferred mapping status', () => {
    for (const spec of Object.values(COMPRESSOR_PANEL_SPECS)) {
      expect(spec.mappingStatus).not.toBe('observed')
      expect(spec.mappingStatus).not.toBe('calibrated_inferred')
    }
  })

  it('Tube CB includes fixed/manual attack-release select', () => {
    const tubeCb = COMPRESSOR_PANEL_SPECS.TUBE_CB
    const mode = tubeCb.switches.find((c) => c.controlId === 'attack_release_select')
    expect(mode).toBeDefined()
    expect(mode?.controlType).toBe('mode_select')
    if (mode?.controlType === 'mode_select') {
      expect(mode.states).toEqual(['fixed', 'manual'])
    }
  })

  it('COMP 160 compression includes infinity', () => {
    const comp160 = COMPRESSOR_PANEL_SPECS.COMP_160
    const compression = comp160.controls.find((c) => c.controlId === 'compression')
    expect(compression).toBeDefined()
    if (compression?.controlType === 'knob') {
      expect(compression.panelScale).toContain('∞')
    }
  })

  it('VT1 ratio includes 1:1 and 4:1', () => {
    const vt1 = COMPRESSOR_PANEL_SPECS.VT_1_COMPRESSOR
    const ratio = vt1.controls.find((c) => c.controlId === 'ratio')
    expect(ratio).toBeDefined()
    if (ratio?.controlType === 'knob') {
      expect(ratio.panelScale).toContain('1:1')
      expect(ratio.panelScale).toContain('4:1')
    }
  })

  it('Classic threshold includes note about sign ambiguity', () => {
    const classic = COMPRESSOR_PANEL_SPECS.CLASSIC_COMPRESSOR
    const threshold = classic.controls.find((c) => c.controlId === 'threshold')
    expect(threshold).toBeDefined()
    expect(threshold?.notes?.toLowerCase()).toContain('ambiguity')
  })
})

describe('safety: panel specs are not consumed by production write tools', () => {
  it('tools.ts does not import compressor-panel-specs metadata module', () => {
    const __dirname = fileURLToPath(new URL('.', import.meta.url))
    const root = resolve(__dirname, '../../../../')
    const toolsPath = resolve(root, 'packages/presonus-mcp-server/src/tools.ts')
    const src = readFileSync(toolsPath, 'utf8')

    expect(src.includes('compressor-panel-specs')).toBe(false)
    expect(src.includes('COMPRESSOR_PANEL_SPECS')).toBe(false)
  })
})
