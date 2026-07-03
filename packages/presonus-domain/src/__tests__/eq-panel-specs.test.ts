import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  EQ_PANEL_SPECS,
  EqModelPanelSpecSchema,
} from '../schemas/eq-panel-specs.js'

describe('eq front-panel baseline specs', () => {
  it('contains all nine screenshot-derived EQ model specs', () => {
    const required = [
      'PASSIVE',
      'VINTAGE',
      'ALPINE_EQ_550',
      'BAXANDALL_EQ',
      'RC_500_EQ',
      'SOLAR_69_EQ',
      'TUBE_EQ',
      'VINTAGE_3_BAND_EQ',
      'VT_1_EQ',
    ]

    for (const id of required) {
      expect(EQ_PANEL_SPECS[id as keyof typeof EQ_PANEL_SPECS]).toBeDefined()
    }
  })

  it('every spec has front_panel_baseline_only calibration status', () => {
    for (const spec of Object.values(EQ_PANEL_SPECS)) {
      const parsed = EqModelPanelSpecSchema.parse(spec)
      expect(parsed.calibrationStatus).toBe('front_panel_baseline_only')
      expect(parsed.mappingStatus).toBe('front_panel_labels_only')
    }
  })

  it('every control and switch has front_panel_labels_only mapping status', () => {
    for (const spec of Object.values(EQ_PANEL_SPECS)) {
      for (const control of [...spec.controls, ...spec.switches]) {
        expect(control.mappingStatus).toBe('front_panel_labels_only')
      }
    }
  })

  it('every knob/slider has rawRange [0,1]', () => {
    for (const spec of Object.values(EQ_PANEL_SPECS)) {
      for (const control of [...spec.controls, ...spec.switches]) {
        if (control.controlType === 'knob' || control.controlType === 'slider') {
          expect(control.rawRange).toEqual([0, 1])
        }
      }
    }
  })

  it('controls with UI numeric value boxes use exact_digital_readout', () => {
    const passive = EQ_PANEL_SPECS.PASSIVE
    const vintage = EQ_PANEL_SPECS.VINTAGE

    const passiveReadouts = ['low_boost', 'low_atten', 'bandwidth', 'high_boost', 'high_atten']
    for (const id of passiveReadouts) {
      const c = passive.controls.find((control) => control.controlId === id)
      expect(c?.currentValueSource).toBe('exact_digital_readout')
    }

    const vintageReadouts = ['lf_gain', 'lmf_gain', 'hmf_gain', 'hf_gain']
    for (const id of vintageReadouts) {
      const c = vintage.controls.find((control) => control.controlId === id)
      expect(c?.currentValueSource).toBe('exact_digital_readout')
    }
  })

  it('buttons and toggles use exact_discrete_state', () => {
    for (const spec of Object.values(EQ_PANEL_SPECS)) {
      for (const control of [...spec.controls, ...spec.switches]) {
        if (control.controlType === 'button' || control.controlType === 'toggle') {
          expect(control.currentValueSource).toBe('exact_discrete_state')
        }
      }
    }
  })

  it('pointer-only controls use visual_pointer_estimate', () => {
    const baxandall = EQ_PANEL_SPECS.BAXANDALL_EQ
    const tube = EQ_PANEL_SPECS.TUBE_EQ

    for (const control of baxandall.controls) {
      expect(control.currentValueSource).toBe('visual_pointer_estimate')
    }

    for (const control of tube.controls) {
      expect(control.currentValueSource).toBe('visual_pointer_estimate')
    }
  })

  it('Passive EQ and Vintage EQ include exact digital readout controls', () => {
    const passive = EQ_PANEL_SPECS.PASSIVE
    const vintage = EQ_PANEL_SPECS.VINTAGE

    expect(passive.controls.some((c) => c.currentValueSource === 'exact_digital_readout')).toBe(true)
    expect(vintage.controls.some((c) => c.currentValueSource === 'exact_digital_readout')).toBe(true)
  })

  it('Tube EQ and Baxandall EQ do not claim exact digital readout', () => {
    const tube = EQ_PANEL_SPECS.TUBE_EQ
    const baxandall = EQ_PANEL_SPECS.BAXANDALL_EQ

    expect(tube.controls.some((c) => c.currentValueSource === 'exact_digital_readout')).toBe(false)
    expect(baxandall.controls.some((c) => c.currentValueSource === 'exact_digital_readout')).toBe(false)
  })
})

describe('safety: EQ panel specs are not consumed by production write tools', () => {
  it('tools.ts does not import eq-panel-specs metadata module', () => {
    const __dirname = fileURLToPath(new URL('.', import.meta.url))
    const root = resolve(__dirname, '../../../../')
    const toolsPath = resolve(root, 'packages/presonus-mcp-server/src/tools.ts')
    const src = readFileSync(toolsPath, 'utf8')

    expect(src.includes('eq-panel-specs')).toBe(false)
    expect(src.includes('EQ_PANEL_SPECS')).toBe(false)
  })

  it('write tool registration controls remain in tools.ts', () => {
    const __dirname = fileURLToPath(new URL('.', import.meta.url))
    const root = resolve(__dirname, '../../../../')
    const toolsPath = resolve(root, 'packages/presonus-mcp-server/src/tools.ts')
    const src = readFileSync(toolsPath, 'utf8')

    expect(src.includes('writeEnabled')).toBe(true)
    expect(src.includes('if (config.writeEnabled)')).toBe(true)
    expect(src.includes('hard-disabled')).toBe(true)
  })
})
