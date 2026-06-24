# Fat Channel Model Catalog

This reference contains detailed compressor/EQ model descriptions and selector tables migrated from the original monolithic skill file. Load it when the quick selector in `SKILL.md` is not enough.

# Compressor Models

### Factory Models (always available — no add-on required)

---

#### `STANDARD` — Live Index 0 · `{870D04F7-212E-4F9C-ADBB-39A97216433F}`

- **Character**: Transparent, surgical, neutral VCA-style compressor
- **Controls**: Threshold, ratio, attack, release, makeup gain, key-filter, sidechain
- **Sound**: No harmonic color; reduces dynamics precisely without adding character
- **Best for**:
  - Channels that need gain leveling without coloration (speech, acoustic guitar, piano)
  - Any source where the goal is control, not character
  - Podcasts, broadcast, PA spoken word
- **Avoid when**: You want vintage warmth, harmonic saturation, or "pumping" character

---

#### `TUBE` — Live Index 1 · `{7F8A4262-D377-48E3-9D48-15D82C400A71}`

- **Character**: Warm, smooth, program-dependent — inspired by vintage tube optical compressors (LA-2A/Vari-Mu style)
- **Controls**: Threshold, ratio, attack, release, output gain
- **Sound**: Adds subtle harmonic warmth; releases musically without sounding unnatural; slower transient response
- **Best for**:
  - Lead vocals — smooths out peaks while retaining presence
  - Upright bass or acoustic bass — adds warmth without killing transients
  - Acoustic guitar — natural-sounding squash
  - Mix bus on acoustic/folk/jazz sessions
- **Avoid when**: You need fast transient control or click/attack preservation (kick, snare top)

---

#### `FET` — Live Index 2 · `{1F831EC1-B8AC-4EE9-AD53-54227AF53D58}`

- **Character**: Fast, aggressive, punchy — modeled after FET limiters (UREI 1176 style)
- **Controls**: Threshold, ratio (4:1, 8:1, 12:1, 20:1), attack, release, makeup gain
- **Sound**: Extremely fast attack catches transients hard; aggressive at high ratios; "all-buttons" mode adds density and distortion
- **Best for**:
  - Snare drum — classic crack and punch
  - Room mics — slammed for the "Bonham" room sound
  - Rap/hip-hop vocals — aggressive control
  - Bass guitar DI — fast transient control with attitude
  - Any source that needs "taming" with bite retained
- **Avoid when**: Smoothness and transparency are the priority

---

### Add-on Models (Fat Channel Collection Vol. 1)

---

#### `BRIT_COMP` — Live Index 3 · `{FEF33155-7A9E-4F4E-B209-CFE86DDAFC8E}`

- **Character**: British VCA console compressor — inspired by SSL G-Bus / Neve-style bus compression
- **Controls**: Threshold, ratio, attack, release (program-adaptive), makeup gain
- **Sound**: Adds "glue" and punch; musical auto-release; cohesive without dulling transients
- **Best for**:
  - Drum bus — the classic SSL "glue comp" trick
  - Mix bus compression — binds elements together
  - Guitar bus, keyboard bus
  - Any stereo group that needs cohesion and impact
- **Avoid when**: You need precise surgical control; this is a coloring/gluing compressor

---

#### `CLASSIC_COMPRESSOR` — Live Index 4 · `{C38F9E1A-0127-4BB8-9377-40C545A50328}`

- **Character**: Versatile, polished VCA — studio workhorse with clean punch
- **Controls**: Threshold, ratio, attack, release, makeup gain
- **Sound**: Between the transparency of STANDARD and the color of BRIT_COMP; adds modest density
- **Best for**:
  - Live bass guitar — controlled, punchy, clean
  - Keys and synths — keeps levels even without obvious compression artifacts
  - General-purpose "set it and forget it" compression on any live channel
  - Backup vocals — even, polished levels
- **When to choose over STANDARD**: When you want slight density/punch added; CLASSIC adds a touch of character STANDARD does not

---

#### `COMP_160` — Live Index 5 · `{F0BD22BB-5FE8-4279-8B05-D089B4D7B0BB}`

- **Character**: Fast, punchy, program-dependent VCA — modeled after dbx 160/165A
- **Controls**: Threshold, compression (ratio), output gain; attack/release are program-dependent
- **Sound**: No manual attack/release — reacts to the program material automatically; very transparent at moderate settings, tight and punchy when driven
- **Best for**:
  - Kick drum DI or mic — fast, transparent control with impact
  - Snare (especially bottom mic) — quick and clean
  - Bass guitar — tracks dynamics without pumping
  - Live drum overhead/room control
- **Key difference from FET**: Less aggressive, more transparent; dbx-style vs. 1176-style character

---

#### `EVEREST_C100A` — Live Index 6 · `{23F9C088-08BE-4259-9DCE-38720AE5DE73}`

- **Character**: Tube leveling amplifier — smooth, musical, vintage warmth with program-adaptive behavior (Vari-Mu / Chandler / Fairchild-adjacent)
- **Controls**: Threshold, ratio, attack, release, makeup gain
- **Sound**: Rich harmonic coloration from the tube circuit simulation; natural dynamic riding; very musical release that breathes with the material
- **Best for**:
  - Lead vocal bus — smooth, warm, even
  - Acoustic instruments (violin, cello, woodwinds) — adds body and warmth
  - Mix or 2-bus leveling on acoustic/jazz/classical content
  - Gentle program leveling where character and warmth are desired
- **Avoid when**: Surgical precision or transparency is needed; this is a coloring compressor

---

#### `FC_670` — Live Index 7 · `{85DD5632-A536-49FF-894A-9329FC1124E4}`

- **Character**: Vari-mu tube compressor — modeled after the legendary Fairchild 670
- **Controls**: Threshold, time constants (program-adaptive), output gain
- **Sound**: Extremely musical; slow attack that "breathes" with the music; adds warmth, depth, and subtle harmonic richness; legendary for its smooth gain riding
- **Best for**:
  - Stereo mix bus — classic "vintage glue"
  - Drum overhead bus — tames transients while adding depth
  - Acoustic piano — natural, musical dynamics
  - Vocal bus with multiple singers
  - Any source that should sound like it was recorded at Abbey Road in 1966
- **Key distinction**: The most musical, least "processed-sounding" compressor available; use when you want dynamics to breathe, not just be controlled

---

#### `RC_500_COMPRESSOR` — Live Index 8 · `{6A372968-AFA7-4A3F-805D-A09A4AE15777}`

- **Character**: Clean, modern VCA with musical response — studio-quality channel compression
- **Controls**: Threshold, ratio, attack, release, makeup gain, key filter
- **Sound**: Punchy and controlled without excessive coloration; sits between the transparency of STANDARD and the punch of FET
- **Best for**:
  - Electric guitar — controls dynamics without killing pick attack
  - Drum room mics — natural-sounding taming
  - IEM and monitor mix channels — even, consistent level
  - General live channel compression when STANDARD is too clinical
- **Paired with**: `RC_500_EQ` for a matched "RC 500 Channel Strip" workflow

---

#### `TUBE_CB` — Live Index 9 · `{C3C32BBC-42E2-41A7-99B5-EA1D62F897B5}`

- **Character**: Tube optical compressor with side-chain flexibility — Tube-Tech CL 1B inspired
- **Controls**: Threshold, ratio, attack, release, makeup gain, sidechain/key
- **Sound**: Warm, musical tube saturation with optical-style program-dependent behavior; smoother than FET but with more body than TUBE factory model
- **Best for**:
  - Vocals (lead and backing) — warm, smooth, natural
  - Bass guitar — warm tube character with good transient control
  - Cello, violin, acoustic guitar
  - Any source where warmth + control is the goal
- **Key distinction from TUBE**: More side-chain control options; slightly tighter optical response

---

#### `VT_1_COMPRESSOR` — Live Index 10 · `{AF35E448-40EC-4C5A-A05C-B40A5AC0A42F}`

- **Character**: Variable-mu tube compressor — Manley Variable Mu / Vari-Mu style
- **Controls**: Threshold, ratio (variable-mu, soft knee), attack, release, makeup gain
- **Sound**: Extremely smooth gain reduction; soft-knee characteristic makes compression nearly invisible until driven hard; rich harmonic saturation; never sounds harsh
- **Best for**:
  - Mix/2-bus — the "final touch" compressor
  - Full drum bus — adds body, depth, and subtle density
  - Acoustic ensemble recordings
  - Any situation where compression should be heard as "louder and fuller" rather than "compressed"
- **Avoid when**: Fast transient control is needed (use FET or COMP_160 instead)

---

## Compressor Selector — Quick Reference

| Source | Recommended | Why |
|---|---|---|
| Kick drum | `FET`, `COMP_160` | Fast attack, punch, transient control |
| Snare top | `FET`, `BRIT_COMP` | Crack and bite |
| Snare bottom | `COMP_160`, `STANDARD` | Clean, transparent |
| Hi-hat / overhead | `RC_500_COMPRESSOR`, `STANDARD` | Natural control |
| Room mics | `FET`, `FC_670` | Aggressive OR vintage depth |
| Drum bus | `BRIT_COMP`, `FC_670` | Glue and punch |
| Bass guitar DI | `FET`, `COMP_160`, `TUBE_CB` | Punch or warmth |
| Bass amp | `TUBE_CB`, `CLASSIC_COMPRESSOR` | Warm, smooth |
| Electric guitar | `RC_500_COMPRESSOR`, `BRIT_COMP` | Controlled, musical |
| Acoustic guitar | `TUBE`, `TUBE_CB` | Warm, natural |
| Lead vocals | `TUBE`, `TUBE_CB`, `VT_1_COMPRESSOR` | Smooth, warm |
| Backing vocals | `CLASSIC_COMPRESSOR`, `STANDARD` | Even, consistent |
| Keys / synth | `CLASSIC_COMPRESSOR`, `STANDARD` | Clean leveling |
| Mix bus | `FC_670`, `VT_1_COMPRESSOR`, `BRIT_COMP` | Glue, warmth, cohesion |
| Speech / broadcast | `STANDARD`, `CLASSIC_COMPRESSOR` | Transparent |

---

# EQ Models

### Factory Models (always available)

---

#### `STANDARD` EQ — Live Index 0 · `{A0A8A068-14F0-4B04-BB6F-AF8329D0E8EE}`

- **Type**: 4-band fully parametric EQ + HPF
- **Character**: Transparent, surgical, neutral — no harmonic coloration
- **Bands**: Low shelf, low-mid peak, high-mid peak, high shelf; each fully parametric (frequency, gain, Q)
- **Best for**:
  - Surgical problem-solving (narrow cuts for resonances, feedback frequencies)
  - When source material needs correction, not color
  - High-Q cuts for feedback modes or room modes in live sound
  - Any channel where transparency is the goal
- **When to choose over vintage models**: When you need precise, problem-solving equalization

---

#### `PASSIVE` EQ — Live Index 1 · `{C0730CBB-5135-4558-9222-C40BDBA036ED}`

- **Type**: Passive EQ — Pultec EQP-1A inspired
- **Character**: Warm, musical, vintage; famous for the "Pultec trick" (boost and cut simultaneously at the same frequency for enhanced bass punch)
- **Controls**: Boost and attenuate at specific frequencies; program-adapted bandwidth curves
- **Sound**: Gentle, rounded curves; cannot be surgical; adds musical width and warmth; shelves have a characteristic musical rise
- **Best for**:
  - Bass guitar — bottom-end enhancement
  - Kick drum — classic Pultec bass boost
  - Acoustic guitar — airy top-end with passive high shelf
  - Mix bus — broad, musical tonal shaping
  - Vocals that need warmth without obvious EQ
- **Avoid when**: You need precise, narrow corrections; passive EQs are broad and musical, not surgical

---

#### `VINTAGE` EQ — Live Index 2 · `{E1C5E024-C5CD-473C-B08A-6EC177812E01}`

- **Type**: Vintage-character parametric — inspired by vintage console channel EQ topology
- **Character**: Adds harmonic character alongside frequency adjustment; musicality over precision
- **Sound**: Broad, musical curves; boost frequencies sound "better" than the neutral STANDARD EQ
- **Best for**:
  - Vintage rock, blues, jazz sessions
  - Electric guitar — adds body and presence
  - Drum channels that need "vintage" warmth
  - Vocals where you want both tonal shaping and character
- **When to choose over STANDARD**: When you want the EQ itself to add color, not just correct

---

### Add-on Models (Fat Channel Collection Vol. 1)

---

#### `ALPINE_EQ_550` — Live Index 3 · `{CBDD0DD3-C5EF-495A-B4C7-92EC5E8FE146}`

- **Type**: Fixed-frequency proportional-Q EQ — modeled after API 550 series (500-series console EQ)
- **Character**: Musical, punchy, "console" sound; proportional Q (narrower at high gains, wider at low gains)
- **Controls**: Fixed frequency selections per band; ±12 dB boost/cut
- **Sound**: The classic "American" rock sound; fast, decisive EQ; boosts sound open and present, cuts are clean
- **Best for**:
  - Drums — the "classic rock drum sound" EQ
  - Electric guitar — presence and cut
  - Bass guitar — low-mid punch
  - Snare drum — crack and mid presence
  - Any rock, metal, or pop channel
- **Key distinction**: This is the "rock and pop workhorse" EQ; musical, fast to use, sounds great pushed hard

---

#### `BAXANDALL_EQ` — Live Index 4 · `{B4D3497E-4B1C-4CFA-B859-A918C17CDA03}`

- **Type**: Baxandall shelving EQ — classic hi-fi/broadcast topology
- **Character**: Very gentle, broad, musical shelves; cannot be surgical; extremely transparent at moderate settings
- **Controls**: Low shelf (bass), high shelf (treble); simple, broad
- **Sound**: Sounds "natural" — like the source is simply brighter or warmer, not equalized; best tonal shaping tool for full-range sources
- **Best for**:
  - Broadcast speech — gentle tonal balance
  - Acoustic piano — broad air and warmth
  - Mix bus — overall tonal balance without color
  - IEM mixes — comfortable high-frequency adjustment
  - Any source that just needs "a bit more warmth" or "a bit more air"
- **Avoid when**: You need mid-band control or frequency-specific shaping

---

#### `RC_500_EQ` — Live Index 5 · `{63ADDF9B-0EC7-430A-AEBE-62B4CB5FBBD6}`

- **Type**: Parametric EQ — studio channel strip quality
- **Character**: Clean, musical, versatile; a step up in character from STANDARD without heavy coloration
- **Controls**: Fully parametric with good frequency range
- **Sound**: More musical and open-sounding than STANDARD; adds slight density and presence
- **Best for**:
  - Electric guitar channel strip (paired with RC_500_COMPRESSOR)
  - Drum channels that need precise but musical shaping
  - Live sound where you need both control and musicality
- **Paired with**: `RC_500_COMPRESSOR` for a matched channel strip workflow

---

#### `SOLAR_69_EQ` — Live Index 6 · `{03819C3F-DC16-4B7B-B521-14B4042192F2}`

- **Type**: Vintage console EQ — Neve 1073 / classic British console inspired
- **Character**: Rich, warm, "British" character; EQ boosts sound musical and full; cuts are smooth
- **Controls**: Fixed frequency selections per band; HP filter; characteristic Neve-style curves
- **Sound**: The classic "British" sound — warm low end, present midrange, airy top end; adding EQ makes sources sound bigger and more present
- **Best for**:
  - Snare drum — the classic Neve snare presence
  - Vocals — warm, full, present
  - Bass guitar — Neve-style warmth and punch
  - Drum bus — richness and body
  - Rock and pop recording/mixing
- **Key distinction**: If ALPINE_EQ_550 is "American punch," SOLAR_69_EQ is "British warmth and richness"

---

#### `TUBE_EQ` — Live Index 7 · `{09B38119-3945-40D1-BA33-2FA19620DAB0}`

- **Type**: Tube EQ — Pultec / Manley Massive Passive inspired
- **Character**: Rich harmonic saturation from tube circuits alongside EQ; very musical; adds depth and dimension
- **Controls**: Boost and cut controls with tube-circuit frequency shaping
- **Sound**: EQ curves interact with tube harmonics; boosting frequencies also adds warmth and richness; the EQ "opens up" the source rather than just adjusting level at a frequency
- **Best for**:
  - Lead vocals — warmth, air, dimension
  - Acoustic guitar — rich body and shimmering highs
  - Electric piano / organ — depth and warmth
  - Mix bus — subtle tube character with broad shaping
  - Any source that sounds "thin" and needs "body and dimension"
- **Avoid when**: Precision is needed; tube EQs add character that may not be appropriate for surgical work

---

#### `VINTAGE_3_BAND_EQ` — Live Index 8 · `{4635DE88-C3D2-4645-BC4D-8DFD116D6914}`

- **Type**: 3-band vintage fixed-frequency EQ — inspired by classic SSL/API console 3-band sections
- **Character**: Simple, musical, fast to use; the 3-band format is optimized for fast live sound decisions
- **Controls**: Low shelf, midrange peak (semi-parametric), high shelf
- **Sound**: Musical, punchy, wide; great for broad tonal decisions; less flexible than full parametric but faster and more musical
- **Best for**:
  - Live sound quick adjustments — fast, musical, effective
  - Drum bus — broad shape without surgical fuss
  - Guitar and bass — quick character shaping
  - Backing vocals — simple broad adjustments
  - When simplicity and speed matter more than surgical precision
- **Key advantage**: Simpler than 4-band; faster decisions; still musical and effective

---

#### `VT_1_EQ` — Live Index 9 · `{A0FAF452-D664-4BA2-90FC-6BD4AC469B29}`

- **Type**: Variable-tube EQ — Manley Massive Passive / tube parametric inspired
- **Character**: Deep tube warmth with sophisticated parametric control; adds dimension alongside frequency shaping
- **Controls**: Multi-band parametric with tube-circuit saturation
- **Sound**: Combines the precision of parametric EQ with the richness of tube harmonic character; boosts add "body" not just volume at a frequency; cuts remain clean
- **Best for**:
  - Mix/2-bus — sophisticated final tonal shaping with character
  - Lead vocal — dimension, air, warmth simultaneously
  - Acoustic instruments that need tonal refinement with body
  - Any source that sounds "digitally flat" and needs "analogue dimension"
- **Paired with**: `VT_1_COMPRESSOR` for a matched tube channel strip

---

#### `BUS_EQ` — Line index N/A (bus/aux/sub only) · `{4B92A91C-C6FB-4F0F-AE51-841378E4F9CF}`

- **Channel types**: Aux outputs, sub groups, FX buses — NOT for line input channels
- **Character**: Full-range bus EQ; optimized for output bus treatment rather than per-channel use
- **Best for**: Shaping monitor mixes (IEM, wedge), sub-group frequency balancing, FX return tonal adjustment

---

## EQ Selector — Quick Reference

| Source / Goal | Recommended | Why |
|---|---|---|
| Surgical notch / feedback cut | `STANDARD` | Precise, narrow, transparent |
| Gentle tonal warmth / air | `PASSIVE`, `BAXANDALL_EQ` | Broad musical curves |
| Rock/metal drums | `ALPINE_EQ_550`, `SOLAR_69_EQ` | Punch and presence |
| Vintage / classic vibe | `VINTAGE`, `SOLAR_69_EQ`, `TUBE_EQ` | Character EQ |
| British warmth (Neve style) | `SOLAR_69_EQ` | Classic British console sound |
| American punch (API style) | `ALPINE_EQ_550` | Fast, open, punchy |
| Bass drum low-end | `PASSIVE` | Pultec trick for bottom |
| Vocals — warmth and air | `TUBE_EQ`, `VT_1_EQ`, `SOLAR_69_EQ` | Tube character or British warmth |
| Speech / broadcast | `BAXANDALL_EQ`, `STANDARD` | Transparent or broad |
| IEM/monitor comfort | `BAXANDALL_EQ`, `VINTAGE_3_BAND_EQ` | Gentle, fast adjustments |
| Full channel strip (RC-500) | `RC_500_EQ` + `RC_500_COMPRESSOR` | Matched pair |
| Full tube strip (VT-1) | `VT_1_EQ` + `VT_1_COMPRESSOR` | Matched pair |
| Mix bus shaping | `VT_1_EQ`, `FC_670` + `BAXANDALL_EQ` | Vintage warmth and glue |
| Fast live adjustment | `VINTAGE_3_BAND_EQ` | Simple 3-band, fast |

---

## Decision Framework for Agents

When choosing models, apply this decision hierarchy:

```
1. Does the channel need correction (remove problems)?
   → STANDARD EQ + STANDARD or CLASSIC compressor

2. Does the source need punch and transient control?
   → Compressor: FET, COMP_160, BRIT_COMP
   → EQ: ALPINE_EQ_550, SOLAR_69_EQ

3. Does the source need warmth and musical character?
   → Compressor: TUBE, TUBE_CB, VT_1_COMPRESSOR, FC_670, EVEREST_C100A
   → EQ: PASSIVE, TUBE_EQ, VT_1_EQ, SOLAR_69_EQ, VINTAGE

4. Is this a bus / group / mix?
   → Compressor: BRIT_COMP, FC_670, VT_1_COMPRESSOR
   → EQ: VT_1_EQ, BAXANDALL_EQ, VINTAGE_3_BAND_EQ
   → Bus channels: BUS_EQ

5. Is this a matched channel strip?
   → RC_500_COMPRESSOR + RC_500_EQ  (punchy, modern)
   → VT_1_COMPRESSOR + VT_1_EQ     (warm, tube)
```

---

---
