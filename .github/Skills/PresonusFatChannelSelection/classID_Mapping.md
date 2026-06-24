## Fat Channel Plugin Class ID Mapping

This file records the exact `__classid` values observed on the StudioLive 32SC mixer for Fat Channel compressor and EQ plugins.

Use these values as the source of truth when decoding scene files. The live model index tables in `packages/presonus-domain/src/schemas/fat-channel.ts` remain the source of truth for models that have not yet been captured as scene GUIDs.

### Scene GUIDs — Complete Mapping

All 11 compressor and 10 line-EQ models confirmed by dedicated scene `06._classID_Map.scn`
(2026-06-24, StudioLive 32SC fw 3.3.0.109659). Channels 1–22 were each set to a distinct
model; assignments verified by cross-validating channel 1–11 assignments against channels 12–22
(every GUID appears on exactly two channels with matching model names).

> ⚠️ **Correction**: `{C3C32BBC-42E2-41A7-99B5-EA1D62F897B5}` is **TUBE_CB** (index 9),
> NOT EVEREST_C100A. The correct EVEREST_C100A GUID is `{23F9C088-08BE-4259-9DCE-38720AE5DE73}`.
> Previous mapping in `04.New Scene 4.scn` was misleading because the user had changed channels
> live but had not re-saved the scene.

#### Compressor Models (line channels)

| Model | Live Index | Scene `__classid` |
| --- | --- | --- | --- |
| STANDARD | 0 | {870D04F7-212E-4F9C-ADBB-39A97216433F} |
| TUBE | 1 | {7F8A4262-D377-48E3-9D48-15D82C400A71} |
| FET | 2 | {1F831EC1-B8AC-4EE9-AD53-54227AF53D58} |
| BRIT_COMP | 3 | {FEF33155-7A9E-4F4E-B209-CFE86DDAFC8E} |
| CLASSIC_COMPRESSOR | 4 | {C38F9E1A-0127-4BB8-9377-40C545A50328} |
| COMP_160 | 5 | {F0BD22BB-5FE8-4279-8B05-D089B4D7B0BB} |
| EVEREST_C100A | 6 | {23F9C088-08BE-4259-9DCE-38720AE5DE73} |
| FC_670 | 7 | {85DD5632-A536-49FF-894A-9329FC1124E4} |
| RC_500_COMPRESSOR | 8 | {6A372968-AFA7-4A3F-805D-A09A4AE15777} |
| TUBE_CB | 9 | {C3C32BBC-42E2-41A7-99B5-EA1D62F897B5} |
| VT_1_COMPRESSOR | 10 | {AF35E448-40EC-4C5A-A05C-B40A5AC0A42F} |

#### EQ Models (line channels)

| Model | Live Index | Scene `__classid` |
| --- | --- | --- | --- |
| STANDARD | 0 | {A0A8A068-14F0-4B04-BB6F-AF8329D0E8EE} |
| PASSIVE | 1 | {C0730CBB-5135-4558-9222-C40BDBA036ED} |
| VINTAGE | 2 | {E1C5E024-C5CD-473C-B08A-6EC177812E01} |
| ALPINE_EQ_550 | 3 | {CBDD0DD3-C5EF-495A-B4C7-92EC5E8FE146} |
| BAXANDALL_EQ | 4 | {B4D3497E-4B1C-4CFA-B859-A918C17CDA03} |
| RC_500_EQ | 5 | {63ADDF9B-0EC7-430A-AEBE-62B4CB5FBBD6} |
| SOLAR_69_EQ | 6 | {03819C3F-DC16-4B7B-B521-14B4042192F2} |
| TUBE_EQ | 7 | {09B38119-3945-40D1-BA33-2FA19620DAB0} |
| VINTAGE_3_BAND_EQ | 8 | {4635DE88-C3D2-4645-BC4D-8DFD116D6914} |
| VT_1_EQ | 9 | {A0FAF452-D664-4BA2-90FC-6BD4AC469B29} |

#### Bus/Aux/Sub EQ (separate plugin class — not part of line EQ index space)

| Model | `__classid` | Channel types |
| --- | --- | --- |
| BUS_EQ | {4B92A91C-C6FB-4F0F-AE51-841378E4F9CF} | aux, sub, fxbus |

### Example Scene Payload

The mixer stores the exact GUID in scene JSON like this:

```json
{
	"comp": {
		"__classid": "{1F831EC1-B8AC-4EE9-AD53-54227AF53D58}"
	},
	"eq": {
		"__classid": "{A0A8A068-14F0-4B04-BB6F-AF8329D0E8EE}"
	}
}
```

### Notes

- The `__classid` value is the exact full GUID string, not a rounded model index.
- Use `opt.compmodel.value` and `opt.eqmodel.value` only for live state decoding when scene GUIDs are unavailable.
- Linked channels can preserve stale raw values on the slave channel in the live state tree, so the master channel should be treated as authoritative when validating model assignments.
- Do not confuse Fat Channel compressor/EQ class IDs with unrelated mixer effect/plugin GUIDs that may also appear in the mixer state cache.

### Observed On

- StudioLive 32SC
- Firmware `3.3.0.109659`
- Mixer serial `SD7E21010066`
- Current scene `_classID_Map.scn`
