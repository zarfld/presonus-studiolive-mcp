import { z } from 'zod'
import type { KnownCompressorModel } from './fat-channel.js'

export const PanelSourceSchema = z.literal('uc_surface_screenshot')
export const PanelSourceConfidenceSchema = z.literal('visual_label_observed')
export const PanelCalibrationStatusSchema = z.literal('front_panel_baseline_only')
export const PanelMappingStatusSchema = z.literal('front_panel_labels_only')
export const CompressorPanelCurrentValueSourceSchema = z.enum([
  'exact_digital_readout',
  'exact_discrete_state',
  'visual_pointer_estimate',
  'qualitative_endpoint_only',
])

export type CompressorPanelCurrentValueSource = z.infer<typeof CompressorPanelCurrentValueSourceSchema>

export const KnobControlSpecSchema = z.object({
  controlType: z.literal('knob'),
  controlId: z.string(),
  label: z.string(),
  rawRange: z.tuple([z.literal(0), z.literal(1)]),
  panelScale: z.array(z.string()).min(1),
  currentValueSource: CompressorPanelCurrentValueSourceSchema,
  notes: z.string().optional(),
})

export const SwitchControlSpecSchema = z.object({
  controlType: z.enum(['toggle', 'button', 'mode_select']),
  controlId: z.string(),
  label: z.string(),
  states: z.array(z.string()).min(1),
  currentValueSource: CompressorPanelCurrentValueSourceSchema,
  notes: z.string().optional(),
})

export const DropdownControlSpecSchema = z.object({
  controlType: z.literal('dropdown'),
  controlId: z.string(),
  label: z.string(),
  options: z.array(z.string()).min(1),
  currentValueSource: CompressorPanelCurrentValueSourceSchema,
  notes: z.string().optional(),
})

export const CompressorPanelControlSpecSchema = z.discriminatedUnion('controlType', [
  KnobControlSpecSchema,
  SwitchControlSpecSchema,
  DropdownControlSpecSchema,
])

export type CompressorPanelControlSpec = z.infer<typeof CompressorPanelControlSpecSchema>

export const CompressorModelPanelSpecSchema = z.object({
  modelId: z.string(),
  displayName: z.string(),
  source: PanelSourceSchema,
  sourceConfidence: PanelSourceConfidenceSchema,
  calibrationStatus: PanelCalibrationStatusSchema,
  mappingStatus: PanelMappingStatusSchema,
  controls: z.array(CompressorPanelControlSpecSchema),
  switches: z.array(CompressorPanelControlSpecSchema),
  sidechain: z.array(CompressorPanelControlSpecSchema),
  notes: z.array(z.string()).optional(),
})

export type CompressorModelPanelSpec = z.infer<typeof CompressorModelPanelSpecSchema>

const knob = (
  controlId: string,
  label: string,
  panelScale: string[],
  currentValueSource: CompressorPanelCurrentValueSource = 'visual_pointer_estimate',
  notes?: string,
): CompressorPanelControlSpec => ({
  controlType: 'knob',
  controlId,
  label,
  rawRange: [0, 1],
  panelScale,
  currentValueSource,
  notes,
})

const toggle = (
  controlId: string,
  label: string,
  states: string[],
  currentValueSource: CompressorPanelCurrentValueSource = 'exact_discrete_state',
  notes?: string,
): CompressorPanelControlSpec => ({
  controlType: 'toggle',
  controlId,
  label,
  states,
  currentValueSource,
  notes,
})

const button = (
  controlId: string,
  label: string,
  states: string[],
  currentValueSource: CompressorPanelCurrentValueSource = 'exact_discrete_state',
  notes?: string,
): CompressorPanelControlSpec => ({
  controlType: 'button',
  controlId,
  label,
  states,
  currentValueSource,
  notes,
})

const modeSelect = (
  controlId: string,
  label: string,
  states: string[],
  currentValueSource: CompressorPanelCurrentValueSource = 'exact_discrete_state',
  notes?: string,
): CompressorPanelControlSpec => ({
  controlType: 'mode_select',
  controlId,
  label,
  states,
  currentValueSource,
  notes,
})

const dropdown = (
  controlId: string,
  label: string,
  options: string[],
  currentValueSource: CompressorPanelCurrentValueSource = 'exact_discrete_state',
  notes?: string,
): CompressorPanelControlSpec => ({
  controlType: 'dropdown',
  controlId,
  label,
  options,
  currentValueSource,
  notes,
})

const SC_DROPDOWN = dropdown('sidechain_input', 'Side-Chain Input', ['dropdown'], 'exact_discrete_state', 'Panel shows a source selector; option labels vary by routing context.')
const KEY_FILTER = knob('key_filter', 'Key Filter', ['40 Hz', '16 kHz'], 'visual_pointer_estimate')

export const COMPRESSOR_PANEL_SPECS: Record<KnownCompressorModel, CompressorModelPanelSpec> = {
  STANDARD: {
    modelId: 'STANDARD',
    displayName: 'Standard',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [],
    switches: [],
    sidechain: [SC_DROPDOWN, KEY_FILTER],
    notes: ['Standard model panel labels are already covered by guided calibration elsewhere. This entry remains baseline-only metadata.'],
  },
  TUBE: {
    modelId: 'TUBE',
    displayName: 'Tube Comp',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('gain', 'Gain', ['0', '100'], 'exact_digital_readout', 'UI shows numeric readout, example 40.00'),
      knob('peak_reduction', 'Peak Reduction', ['0', '100'], 'exact_digital_readout', 'UI shows numeric readout, example 0.00'),
      knob('key_filter', 'Key Filter', ['off', '16 kHz'], 'exact_digital_readout', 'UI shows readout, example off'),
    ],
    switches: [
      toggle('processor', 'Processor', ['off', 'on']),
      toggle('limit_comp', 'Limit/Comp', ['Limit', 'Comp']),
      button('key_listen', 'Key Listen', ['off', 'on']),
    ],
    sidechain: [SC_DROPDOWN],
    notes: ['TUBE model has known formula behavior elsewhere in domain mapping; this panel entry is descriptive baseline metadata only and does not override calibrated formulas.'],
  },
  FET: {
    modelId: 'FET',
    displayName: 'FET Comp',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('input', 'Input', ['-56 dB', '0 dB'], 'exact_digital_readout', 'UI shows numeric readout, example -43.00 dB'),
      knob('output', 'Output', ['-56 dB', '0 dB'], 'exact_digital_readout', 'UI shows numeric readout, example 0.00 dB'),
      knob('attack', 'Attack', ['.8 ms', '.02 ms'], 'visual_pointer_estimate', 'Label direction may be reversed; verify by HIL before formula use'),
      knob('release', 'Release', ['1.1 sec', '50 ms'], 'visual_pointer_estimate', 'Label direction may be reversed; verify by HIL before formula use'),
      modeSelect('ratio', 'Ratio', ['20:1', '12:1', '8:1', '4:1', 'All'], 'exact_discrete_state'),
      knob('key_filter', 'Key Filter', ['off', '16 kHz'], 'exact_digital_readout', 'UI shows readout, example off'),
    ],
    switches: [
      toggle('processor', 'Processor', ['off', 'on']),
      button('key_listen', 'Key Listen', ['off', 'on']),
    ],
    sidechain: [SC_DROPDOWN],
    notes: ['FET model has known formula behavior elsewhere in domain mapping; this panel entry is descriptive baseline metadata only and does not override calibrated formulas.'],
  },
  COMP_160: {
    modelId: 'COMP_160',
    displayName: 'COMP 160',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('threshold', 'Threshold', ['.01', '.03', '.1', '.3', '1', '3'], 'visual_pointer_estimate', 'Panel also shows BELOW/ABOVE indicators.'),
      knob('compression', 'Compression', ['1', '1.5', '2', '3', '4', '6', '10', '20', '∞']),
      knob('output_gain', 'Output Gain', ['-20', '-10', '0', '+10', '+20']),
    ],
    switches: [
      toggle('in', 'In', ['off', 'on']),
      button('key_listen', 'Key Listen', ['off', 'on']),
    ],
    sidechain: [SC_DROPDOWN, KEY_FILTER],
  },
  BRIT_COMP: {
    modelId: 'BRIT_COMP',
    displayName: 'Brit Comp',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('threshold', 'Threshold', ['-20', '+20']),
      knob('ratio', 'Ratio', ['2', '4', '10'], 'visual_pointer_estimate', 'Panel shows intermediate ticks between labeled values.'),
      knob('makeup', 'Makeup', ['0', '+15']),
      knob('attack', 'Attack', ['.1', '.3', '1', '3', '10', '30 ms']),
      knob('release', 'Release', ['.1', '.3', '.6', '1.2', 'AUTO seconds']),
    ],
    switches: [toggle('in', 'In', ['off', 'on']), button('key', 'Key', ['off', 'on'])],
    sidechain: [SC_DROPDOWN, KEY_FILTER],
  },
  CLASSIC_COMPRESSOR: {
    modelId: 'CLASSIC_COMPRESSOR',
    displayName: 'Classic Compressor',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('threshold', 'Threshold', ['20', '16', '12', '8', '4', '0', '+4 dBu'], 'visual_pointer_estimate', 'Sign/direction ambiguity is unresolved from panel labels alone; keep labels verbatim until probe verification.'),
      knob('recovery', 'Recovery', ['100', '400', '800', '1500', 'A1', 'A2 ms/auto labels']),
      knob('gain', 'Gain', ['0', '4', '8', '12', '16', '20 dBu']),
      knob('ratio', 'Ratio', ['1.5:1', '2:1', '3:1', '4:1', '6:1']),
    ],
    switches: [toggle('power', 'Power', ['off', 'on']), button('key', 'Key', ['off', 'on'])],
    sidechain: [SC_DROPDOWN, KEY_FILTER],
  },
  EVEREST_C100A: {
    modelId: 'EVEREST_C100A',
    displayName: 'Everest C100A',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('gain', 'Gain', ['0', '10']),
      knob('gain_reduction', 'Gain Reduction', ['0', '10']),
    ],
    switches: [
      toggle('processor', 'Processor', ['off', 'on']),
      toggle('attack', 'Attack', ['FAST', 'SLOW']),
      toggle('release', 'Release', ['FAST', 'SLOW']),
      toggle('key_listen', 'Key Listen', ['off', 'on']),
    ],
    sidechain: [SC_DROPDOWN, KEY_FILTER],
  },
  FC_670: {
    modelId: 'FC_670',
    displayName: 'FC 670',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('input_gain', 'Input Gain', ['0', '20 scale']),
      knob('threshold', 'Threshold', ['0', '10 scale']),
      knob('time_constant', 'Time Constant', ['1', '2', '3', '4', '5', '6']),
    ],
    switches: [toggle('processor', 'Processor', ['off', 'on']), button('key_listen', 'Key Listen', ['off', 'on'])],
    sidechain: [SC_DROPDOWN, KEY_FILTER],
  },
  RC_500_COMPRESSOR: {
    modelId: 'RC_500_COMPRESSOR',
    displayName: 'RC 500',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('threshold', 'Threshold', ['-20', '-15', '-10', '-5', '0', '+5', '+10', '+15']),
      knob('makeup', 'Makeup', ['0', '+18']),
      knob('attack', 'Attack', ['FAST', 'SLOW']),
      knob('release', 'Release', ['FAST', 'SLOW']),
    ],
    switches: [toggle('processor', 'Processor', ['off', 'on']), toggle('sidechain_key_listen', 'Side-Chain / Key Listen', ['off', 'on'])],
    sidechain: [SC_DROPDOWN, KEY_FILTER],
  },
  TUBE_CB: {
    modelId: 'TUBE_CB',
    displayName: 'Tube CB',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('gain', 'Gain', ['off', '-10', '0', '+10', '+20', '+30']),
      knob('threshold', 'Threshold', ['off', '0', '-10', '-20', '-30', '-40']),
      knob('ratio', 'Ratio', ['2:1', '10:1']),
      knob('attack', 'Attack', ['fast', 'slow']),
      knob('release', 'Release', ['fast', 'slow']),
    ],
    switches: [
      toggle('processor', 'Processor', ['off', 'on']),
      modeSelect('attack_release_select', 'Attack/Release Select', ['fixed', 'manual'], 'exact_discrete_state', 'Attack/release knobs may be mode-dependent when fixed/manual changes.'),
      toggle('key', 'Key', ['off', 'on']),
    ],
    sidechain: [SC_DROPDOWN, KEY_FILTER],
    notes: ['Attack/release knob behavior may change with fixed/manual mode. Preserve as panel baseline only until calibration.'],
  },
  VT_1_COMPRESSOR: {
    modelId: 'VT_1_COMPRESSOR',
    displayName: 'VT1',
    source: 'uc_surface_screenshot',
    sourceConfidence: 'visual_label_observed',
    calibrationStatus: 'front_panel_baseline_only',
    mappingStatus: 'front_panel_labels_only',
    controls: [
      knob('threshold', 'Threshold', ['-30', '-20', '-10', '0', '+10', '+20', '+30']),
      knob('ratio', 'Ratio', ['1:1', '1.2:1', '1.3:1', '1.5:1', '2:1', '2.5:1', '3:1', '4:1']),
      knob('attack', 'Attack', ['FAST', 'SLOW']),
      knob('release', 'Release', ['FAST', 'SLOW']),
      knob('gain', 'Gain', ['0', '3', '6', '9', '12', '15', '18']),
    ],
    switches: [toggle('processor', 'Processor', ['off', 'on']), toggle('key_listen', 'Key Listen', ['off', 'on'])],
    sidechain: [SC_DROPDOWN, KEY_FILTER],
  },
}
