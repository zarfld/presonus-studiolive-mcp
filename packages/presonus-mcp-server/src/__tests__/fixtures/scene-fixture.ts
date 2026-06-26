/**
 * Live-derived fixture factory for write-channel-scene mocked tests.
 *
 * This fixture is a TypeScript const derived from a live HIL probe of
 * SD7E21010066 on 2026-06-26. It is NOT loaded from any JSON file.
 *
 * When the HIL probe reveals topology changes, update this file to match
 * and annotate with the new observation date.
 *
 * Annotated: 2026-06-26, SD7E21010066, scene "Live set"
 */

/** Minimal flatState covering all keys used by the new write tools */
export const FIXTURE_FLAT_STATE: Record<string, unknown> = {
  // ── Line channel usernames (live-observed 2026-06-26) ──
  'line.ch1.username':  'Kick In',
  'line.ch2.username':  'Kick Out',
  'line.ch3.username':  'Snare Top',
  'line.ch4.username':  'Snare Bottom',
  'line.ch5.username':  'High Tom',
  'line.ch6.username':  'Floor Tom',
  'line.ch7.username':  'Floor Tom',
  'line.ch8.username':  'Hi Hat',
  'line.ch9.username':  'Overheads',
  'line.ch10.username': 'Overheads',
  'line.ch11.username': 'Klick',
  'line.ch12.username': 'Electric',
  'line.ch13.username': 'Electric',
  'line.ch14.username': 'Bass',
  'line.ch15.username': 'Lead Vocals',
  'line.ch16.username': 'Backup Vocals',
  'line.ch17.username': 'Kick InNY',
  'line.ch18.username': 'Kick OutNY',
  'line.ch19.username': 'Snare TopNY',
  'line.ch20.username': 'Snare BottomNY',
  'line.ch21.username': 'Kick',
  'line.ch22.username': 'Snare',
  'line.ch23.username': 'BassAttack',

  // ── FX return usernames (live-observed 2026-06-26) ──
  'fxreturn.ch1.username': 'SnarePlate',
  'fxreturn.ch2.username': 'SnareRoom',
  'fxreturn.ch3.username': 'VoxPlate',
  'fxreturn.ch4.username': 'VoxDelay',

  // ── Sub group bus names (live-observed 2026-06-26) ──
  'sub.ch1.username': 'Drums',
  'sub.ch1.chnum':    'Sb A',
  'sub.ch1.volume': 75,
  'sub.ch1.mute': false,
  'sub.ch1.link': 0,
  'sub.ch1.linkmaster': 0,

  'sub.ch2.username': 'Drums',
  'sub.ch2.chnum':    'Sb B',
  'sub.ch2.volume': 75,
  'sub.ch2.mute': false,
  'sub.ch2.link': 0,
  'sub.ch2.linkmaster': 0,

  'sub.ch3.username': 'LeadVox',
  'sub.ch3.chnum':    'Sb C',
  'sub.ch3.volume': 75,
  'sub.ch3.mute': false,
  'sub.ch3.link': 0,
  'sub.ch3.linkmaster': 0,

  'sub.ch4.username': 'BackVox',
  'sub.ch4.chnum':    'Sb D',
  'sub.ch4.volume': 75,
  'sub.ch4.mute': false,
  'sub.ch4.link': 0,
  'sub.ch4.linkmaster': 0,

  // ── Sub group memberships (live-observed 2026-06-26) ──
  // Drums (sub1)
  'line.ch1.sub1': 1,  'line.ch2.sub1': 1, 'line.ch3.sub1': 1, 'line.ch4.sub1': 1,
  'line.ch5.sub1': 1,  'line.ch6.sub1': 1, 'line.ch7.sub1': 1, 'line.ch9.sub1': 1,
  'line.ch10.sub1': 1,
  // Drums (sub2) — mirrors sub1 for current scene
  'line.ch1.sub2': 1,  'line.ch2.sub2': 1, 'line.ch3.sub2': 1, 'line.ch4.sub2': 1,
  'line.ch5.sub2': 1,  'line.ch6.sub2': 1, 'line.ch7.sub2': 1, 'line.ch9.sub2': 1,
  'line.ch10.sub2': 1,
  // LeadVox (sub3)
  'line.ch15.sub3': 1,
  'fxreturn.ch3.sub3': 1,  // VoxPlate in LeadVox
  'fxreturn.ch4.sub3': 1,  // VoxDelay in LeadVox
  // BackVox (sub4)
  'line.ch16.sub4': 1,
  'fxreturn.ch3.sub4': 1,  // VoxPlate in BackVox
  'fxreturn.ch4.sub4': 1,  // VoxDelay in BackVox  ← REQ-F-WRITE-005 target

  // ── Aux bus names (live-observed 2026-06-26) ──
  'aux.ch13.username': 'NYDrums',
  'aux.ch13.volume': 75,
  'aux.ch13.mute': false,

  // ── Aux send assignments (live-observed) ──
  'line.ch17.assign_aux13': true,   // Kick InNY in NYDrums
  'line.ch18.assign_aux13': true,   // Kick OutNY in NYDrums
  'line.ch17.aux13': 0.735,
  'line.ch18.aux13': 0.735,

  // ── Channel mute / volume (representative) ──
  'line.ch11.mute': false,
  'line.ch11.volume': 0.75,
  'line.ch17.mute': false,
  'line.ch17.volume': 0.75,
  'line.ch18.mute': false,
  'line.ch18.volume': 0.75,

  // ── Global / identity ──
  'global.mixer_name': 'StudioLive 32SC',
  'global.dcamode': 1,
}

/** Build a minimal MixerSnapshot-like object for mocked tool tests */
export function makeFixtureSnapshot(overrides: Record<string, unknown> = {}) {
  const flatState = { ...FIXTURE_FLAT_STATE, ...overrides }
  return {
    capturedAt: new Date().toISOString(),  // always fresh — avoids stale-snapshot assertion failures
    isStale: false,
    channels: Array.from({ length: 23 }, (_, i) => {
      const n = i + 1
      const id = `line.ch${n}`
      return {
        id,
        name: String(flatState[`${id}.username`] ?? `Ch ${n}`),
        mute: Boolean(flatState[`${id}.mute`] ?? false),
        fader: { linear: (flatState[`${id}.volume`] as number | undefined) ?? 0.75 },
        sendRouting: {},
        fatChannel: null,
      }
    }),
    flatState,
    outputPatch: null,
    currentScene: null,
    currentProject: null,
    identity: {
      deviceId: 'serial:SD7E21010066',
      serial: 'SD7E21010066',
      name: 'StudioLive 32SC',
      model: 'StudioLive 32SC',
      ip: '157.247.3.13',
      port: 53000,
      role: 'FOH' as const,
      controllable: true,
      confidence: 'observed' as const,
      lastSeen: new Date().toISOString(),
    },
  }
}
