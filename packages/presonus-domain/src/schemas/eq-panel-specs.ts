import { z } from 'zod'
import type { KnownEqModel } from './fat-channel.js'

export const EqPanelSourceSchema = z.literal('uc_surface_screenshot')
export const EqPanelSourceConfidenceSchema = z.literal('visual_label_observed')
export const EqPanelCalibrationStatusSchema = z.literal('front_panel_baseline_only')
export const EqPanelMappingStatusSchema = z.literal('front_panel_labels_only')

export const PanelCurrentValueSourceSchema = z.enum([
  'exact_digital_readout',
  'exact_discrete_state',
  'visual_pointer_estimate',
  'qualitative_endpoint_only',
])

export type PanelCurrentValueSource = z.infer<typeof PanelCurrentValueSourceSchema>

const ContinuousControlSpecSchema = z.object({
  controlType: z.enum(['knob', 'slider']),
  controlId: z.string(),
  label: z.string(),
  rawRange: z.tuple([z.literal(0), z.literal(1)]),
  panelScale: z.array(z.string()).min(1),
  mappingStatus: EqPanelMappingStatusSchema,
  currentValueSource: PanelCurrentValueSourceSchema,
  currentValueNotes: z.string().optional(),
  notes: z.string().optional(),
})

const DiscreteControlSpecSchema = z.object({
  controlType: z.enum(['selector', 'toggle', 'button', 'mode_select']),
  controlId: z.string(),
  label: z.string(),
  states: z.array(z.string()).min(1),
  mappingStatus: EqPanelMappingStatusSchema,
  currentValueSource: PanelCurrentValueSourceSchema,
  currentValueNotes: z.string().optional(),
  notes: z.string().optional(),
})

export const EqPanelControlSpecSchema = z.discriminatedUnion('controlType', [
  ContinuousControlSpecSchema,
  DiscreteControlSpecSchema,
])

export type EqPanelControlSpec = z.infer<typeof EqPanelControlSpecSchema>

export const EqModelPanelSpecSchema = z.object({
  modelId: z.string(),
  displayName: z.string(),
  source: EqPanelSourceSchema,
  sourceConfidence: EqPanelSourceConfidenceSchema,
  calibrationStatus: EqPanelCalibrationStatusSchema,
  mappingStatus: EqPanelMappingStatusSchema,
  controls: z.array(EqPanelControlSpecSchema),
  switches: z.array(EqPanelControlSpecSchema),
  notes: z.array(z.string()).optional(),
})

export type EqModelPanelSpec = z.infer<typeof EqModelPanelSpecSchema>

const knob = (
  controlId: string,
  label: string,
  panelScale: string[],
  currentValueSource: PanelCurrentValueSource,
  currentValueNotes?: string,
  notes?: string,
): EqPanelControlSpec => ({
  controlType: 'knob',
  controlId,
  label,
  rawRange: [0, 1],
  panelScale,
  mappingStatus: 'front_panel_labels_only',
  currentValueSource,
  currentValueNotes,
  notes,
})

const slider = (
  controlId: string,
  label: string,
  panelScale: string[],
  currentValueSource: PanelCurrentValueSource,
  currentValueNotes?: string,
  notes?: string,
): EqPanelControlSpec => ({
  controlType: 'slider',
  controlId,
  label,
  rawRange: [0, 1],
  panelScale,
  mappingStatus: 'front_panel_labels_only',
  currentValueSource,
  currentValueNotes,
  notes,
})

const selector = (
  controlId: string,
  label: string,
  states: string[],
  currentValueSource: PanelCurrentValueSource,
  currentValueNotes?: string,
  notes?: string,
): EqPanelControlSpec => ({
  controlType: 'selector',
  controlId,
  label,
  states,
  mappingStatus: 'front_panel_labels_only',
  currentValueSource,
  currentValueNotes,
  notes,
})

const toggle = (
  controlId: string,
  label: string,
  states: string[] = ['off', 'on'],
  currentValueSource: PanelCurrentValueSource = 'exact_discrete_state',
  currentValueNotes?: string,
  notes?: string,
): EqPanelControlSpec => ({
  controlType: 'toggle',
  controlId,
  label,
  states,
  mappingStatus: 'front_panel_labels_only',
  currentValueSource,
  currentValueNotes,
  notes,
})

const button = (
  controlId: string,
  label: string,
  states: string[],
  currentValueSource: PanelCurrentValueSource = 'exact_discrete_state',
  currentValueNotes?: string,
  notes?: string,
): EqPanelControlSpec => ({
  controlType: 'button',
  controlId,
  label,
  states,
  mappingStatus: 'front_panel_labels_only',
  currentValueSource,
  currentValueNotes,
  notes,
})

const modeSelect = (
  controlId: string,
  label: string,
  states: string[],
  currentValueSource: PanelCurrentValueSource,
  currentValueNotes?: string,
  notes?: string,
): EqPanelControlSpec => ({
  controlType: 'mode_select',
  controlId,
  label,
  states,
  mappingStatus: 'front_panel_labels_only',
  currentValueSource,
  currentValueNotes,
  notes,
})

const BASE = {
  source: 'uc_surface_screenshot' as const,
  sourceConfidence: 'visual_label_observed' as const,
  calibrationStatus: 'front_panel_baseline_only' as const,
  mappingStatus: 'front_panel_labels_only' as const,
}

export const EQ_PANEL_SPECS: Record<KnownEqModel, EqModelPanelSpec> = {
  STANDARD: {
    modelId: 'STANDARD',
    displayName: 'Standard EQ',
    ...BASE,
    controls: [],
    switches: [],
    notes: [
      'Included for completeness only. Existing standard EQ calibration remains authoritative elsewhere.',
    ],
  },
  PASSIVE: {
    modelId: 'PASSIVE',
    displayName: 'Passive EQ',
    ...BASE,
    controls: [
      knob('low_boost', 'Low Boost', ['digital value'], 'exact_digital_readout', 'Value box shown in UI.'),
      knob('low_atten', 'Low Atten', ['digital value'], 'exact_digital_readout', 'Value box shown in UI.'),
      selector('low_frequency', 'Low Frequency', ['20 Hz', '30 Hz', '60 Hz', '100 Hz'], 'exact_discrete_state', 'Selector detents are readable in UI.'),
      knob('bandwidth', 'Bandwidth', ['digital value'], 'exact_digital_readout', 'Value box shown in UI.'),
      knob('high_boost', 'High Boost', ['digital value'], 'exact_digital_readout', 'Value box shown in UI.'),
      knob('high_atten', 'High Atten', ['digital value'], 'exact_digital_readout', 'Value box shown in UI.'),
      selector('high_frequency', 'High Frequency', ['3 kHz', '4 kHz', '5 kHz', '8 kHz', '10 kHz', '12 kHz', '16 kHz'], 'exact_discrete_state', 'Selector detents are readable in UI.'),
      selector('atten_sel', 'Atten Sel', ['5', '10', '20'], 'exact_discrete_state'),
    ],
    switches: [toggle('processor', 'Processor')],
  },
  VINTAGE: {
    modelId: 'VINTAGE',
    displayName: 'Vintage EQ',
    ...BASE,
    controls: [
      button('lf_frequency', 'LF Frequency', ['35 Hz', '60 Hz', '110 Hz', '220 Hz']),
      knob('lf_gain', 'LF Gain', ['-16 dB', '+16 dB'], 'exact_digital_readout', 'UI readout box present for gain.'),
      button('lmf_frequency', 'LMF Frequency', ['360 Hz', '700 Hz', '1.6 kHz']),
      knob('lmf_gain', 'LMF Gain', ['-16 dB', '+16 dB'], 'exact_digital_readout', 'UI readout box present for gain.'),
      button('hmf_frequency', 'HMF Frequency', ['3.2 kHz', '4.8 kHz', '7.2 kHz']),
      knob('hmf_gain', 'HMF Gain', ['-16 dB', '+16 dB'], 'exact_digital_readout', 'UI readout box present for gain.'),
      knob('hf_gain', 'HF Gain', ['-16 dB', '+16 dB'], 'exact_digital_readout', 'UI readout box present for gain.'),
    ],
    switches: [toggle('processor', 'Processor')],
  },
  ALPINE_EQ_550: {
    modelId: 'ALPINE_EQ_550',
    displayName: 'Alpine 550 EQ',
    ...BASE,
    controls: [
      slider('lf_frequency', 'LF Frequency', ['50 Hz', '100 Hz', '200 Hz', '300 Hz', '400 Hz'], 'visual_pointer_estimate'),
      slider('mf_frequency', 'MF Frequency', ['0.4 kHz', '0.8 kHz', '1.5 kHz', '3 kHz', '5 kHz'], 'visual_pointer_estimate'),
      slider('hf_frequency', 'HF Frequency', ['5 kHz', '7 kHz', '10 kHz', '12.5 kHz', '15 kHz'], 'visual_pointer_estimate'),
      knob('lf_gain', 'LF Gain', ['-12 dB', '+12 dB'], 'visual_pointer_estimate'),
      knob('mf_gain', 'MF Gain', ['-12 dB', '+12 dB'], 'visual_pointer_estimate'),
      knob('hf_gain', 'HF Gain', ['-12 dB', '+12 dB'], 'visual_pointer_estimate'),
    ],
    switches: [
      toggle('in', 'In'),
      toggle('lf', 'LF'),
      toggle('hf', 'HF'),
      toggle('filter', 'Filter'),
    ],
  },
  BAXANDALL_EQ: {
    modelId: 'BAXANDALL_EQ',
    displayName: 'Baxandall EQ',
    ...BASE,
    controls: [
      knob('low_cut_hz', 'Low Cut', ['OUT', 'CUT', '12', '18', '24', '30', '36', '43', '54'], 'visual_pointer_estimate'),
      knob('low_frequency', 'Low Frequency', ['74', '84', '.98', '116', '131', '166', '230', '361', 'SHELF'], 'visual_pointer_estimate'),
      knob('low_gain', 'Low Gain', ['-5', '+5'], 'visual_pointer_estimate'),
      knob('high_gain', 'High Gain', ['-5', '+5'], 'visual_pointer_estimate'),
      knob('high_frequency', 'High Frequency', ['1.6', '1.8', '2.1', '2.5', '3.4', '4.8', '7.1', '18', 'SHELF'], 'visual_pointer_estimate'),
      knob('high_cut_khz', 'High Cut', ['OUT', 'CUT', '7.5', '9', '11.1', '12.6', '18', '28', '70'], 'visual_pointer_estimate'),
    ],
    switches: [toggle('processor', 'Processor')],
  },
  RC_500_EQ: {
    modelId: 'RC_500_EQ',
    displayName: 'RC 500 EQ',
    ...BASE,
    controls: [
      knob('low_frequency', 'Low Frequency', ['20', '30', '40', '50', '75', '150', '300', '400 Hz'], 'visual_pointer_estimate'),
      knob('low_gain', 'Low Gain', ['-16', '+16'], 'visual_pointer_estimate'),
      knob('mid_frequency', 'Mid Frequency', ['400', '450', '500', '700', '1k', '2k', '4k', '5k'], 'visual_pointer_estimate'),
      knob('mid_gain', 'Mid Gain', ['-16', '+16'], 'visual_pointer_estimate'),
      knob('high_frequency', 'High Frequency', ['2k', '2.5k', '3k', '4k', '6k', '12k', '16k', '20k'], 'visual_pointer_estimate'),
      knob('high_gain', 'High Gain', ['-16', '+16'], 'visual_pointer_estimate'),
    ],
    switches: [
      toggle('processor', 'Processor'),
      toggle('low_peak_shelf', 'Low Peak/Shelf'),
      toggle('high_peak_shelf', 'High Peak/Shelf'),
    ],
  },
  SOLAR_69_EQ: {
    modelId: 'SOLAR_69_EQ',
    displayName: 'Solar 69 EQ',
    ...BASE,
    controls: [
      knob('bass_frequency', 'Bass Frequency', ['flat', '50', '60', '100', '200', '300 Hz'], 'visual_pointer_estimate'),
      knob('bass_gain', 'Bass Gain', ['0', '15 dB'], 'visual_pointer_estimate'),
      knob('mid_frequency', 'Mid Frequency', ['0.7', '1', '1.4', '2', '2.8', '3.5', '4.5', '6 kHz'], 'visual_pointer_estimate'),
      knob('mid_gain', 'Mid Gain', ['0', '15 dB'], 'visual_pointer_estimate'),
      knob('high_10khz_gain', 'High 10 kHz Gain', ['-10', '+10 dB'], 'visual_pointer_estimate'),
      knob('level_adjust', 'Level Adjust', ['-20', '0'], 'visual_pointer_estimate'),
    ],
    switches: [
      toggle('processor', 'Processor'),
      toggle('peak_trough', 'Peak/Trough', ['peak', 'trough']),
      modeSelect('level_mode', 'Level Mode', ['plus', 'neutral', 'minus'], 'qualitative_endpoint_only', 'Screenshot does not prove protocol-encoded discrete states for all positions.'),
    ],
  },
  TUBE_EQ: {
    modelId: 'TUBE_EQ',
    displayName: 'Tube EQ',
    ...BASE,
    controls: [
      selector('low_peak_selector', 'Low Peak Selector', ['0.1', '0.3', '0.5', '0.7', '1'], 'visual_pointer_estimate'),
      knob('low_frequency', 'Low Frequency', ['0', '10 kHz'], 'visual_pointer_estimate'),
      selector('mid_dip_selector', 'Mid Dip Selector', ['0.2', '0.3', '0.5', '0.7', '1', '1.5', '2', '3', '4', '5', '7'], 'visual_pointer_estimate'),
      knob('mid_frequency', 'Mid Frequency', ['0', '10 kHz'], 'visual_pointer_estimate'),
      selector('high_peak_selector', 'High Peak Selector', ['1.5', '2', '3', '4', '5'], 'visual_pointer_estimate'),
      knob('high_frequency', 'High Frequency', ['0', '10 kHz'], 'visual_pointer_estimate'),
    ],
    switches: [toggle('processor', 'Processor')],
  },
  VINTAGE_3_BAND_EQ: {
    modelId: 'VINTAGE_3_BAND_EQ',
    displayName: 'Vintage 3-Band EQ',
    ...BASE,
    controls: [
      selector('lf_frequency', 'LF Frequency', ['35 Hz', '60 Hz', '110 Hz', '220 Hz'], 'visual_pointer_estimate', 'Could be discrete when proven by calibration.'),
      knob('lf_gain', 'LF Gain', ['minus', '0 dB', 'plus'], 'visual_pointer_estimate', 'Qualitative around 0 dB from panel markings.'),
      selector('mf_frequency', 'MF Frequency', ['0.35', '0.7', '1.6', '3.2', '4.8', '7.2 kHz'], 'visual_pointer_estimate', 'Could be discrete when proven by calibration.'),
      knob('mf_gain', 'MF Gain', ['minus', '0 dB', 'plus'], 'visual_pointer_estimate', 'Qualitative around 0 dB from panel markings.'),
      selector('hf_frequency', 'HF Frequency', ['10 kHz', '12 kHz', '16 kHz'], 'visual_pointer_estimate', 'Could be discrete when proven by calibration.'),
      knob('hf_gain', 'HF Gain', ['minus', '0 dB', 'plus'], 'visual_pointer_estimate', 'Qualitative around 0 dB from panel markings.'),
      selector('filter', 'Filter', ['6 kHz', '8 kHz', '10 kHz', '14 kHz', '18 kHz', 'OFF'], 'visual_pointer_estimate', 'Could be exact discrete state if stepped state is confirmed.'),
    ],
    switches: [
      toggle('hi_q', 'HI_Q'),
      toggle('eql', 'EQL'),
      toggle('phase', 'PHASE'),
    ],
  },
  VT_1_EQ: {
    modelId: 'VT_1_EQ',
    displayName: 'VT1 EQ',
    ...BASE,
    controls: [
      knob('band1_frequency', 'Band1 Frequency', ['20', '30', '40', '50', '60', '80', '200', '250 Hz'], 'visual_pointer_estimate'),
      knob('band1_gain', 'Band1 Gain', ['-16', '+16'], 'visual_pointer_estimate'),
      knob('band2_frequency', 'Band2 Frequency', ['160', '180', '200', '240', '320', '500', '1.2k', '2k'], 'visual_pointer_estimate'),
      knob('band2_gain', 'Band2 Gain', ['-16', '+16'], 'visual_pointer_estimate'),
      knob('band3_frequency', 'Band3 Frequency', ['800', '900', '1k', '1.2k', '2k', '3k', '5k', '8k'], 'visual_pointer_estimate'),
      knob('band3_gain', 'Band3 Gain', ['-16', '+16'], 'visual_pointer_estimate'),
      knob('band4_frequency', 'Band4 Frequency', ['2k', '2.5k', '3k', '4k', '6k', '12k', '16k', '20k'], 'visual_pointer_estimate'),
      knob('band4_gain', 'Band4 Gain', ['-16', '+16'], 'visual_pointer_estimate'),
    ],
    switches: [
      toggle('processor', 'Processor'),
      toggle('hf_peak', 'HF_PEAK'),
      toggle('lf_peak', 'LF_PEAK'),
    ],
  },
}
