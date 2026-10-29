---
'@jsprismarine/minecraft': patch
---

Stop presenting six frozen enums as per-version data. `LevelEvent`, `ActorDataID`, `ActorFlags`,
`ServerAuthMovementMode`, `AbilityLayerFlag` and `RecipeEntryType` have no schema in any
`bedrock-protocol-docs` release — a schema exists only for a type a packet field is declared with,
and these travel as plain integers — so every protocol fell back to the same frozen 1.26.40
`enums.html`. Each version directory then held a copy that differed from the others only in its
`Source:` line, which reads as a value checked against that release.

They are now generated once, to `generated/unversioned/`, headed `NOT VERSIONED` with the
protocols that read them, the 1.26.40 commit they come from, and whatever `datagen/manifest.json`
records under `legacy.knownGaps` about how they have drifted since. `generated/v2193/`,
`generated/v2225/` and the default exports re-export that one copy, so every existing import keeps
working and no value changed. An enum is treated this way only while *every* declared version
reports it absent; the first release that describes one makes it versioned again with no manifest
change, and two versions that disagreed about a shared enum would fail the run rather than let one
copy win.

The gap recorded for `LevelEvent`: it is missing `ParticleCreakingHeartTrail = 9816`, added after
1.26.40, and its last three members carry the list positions 3617-3619 that the dump printed
rather than values. Nothing in this repository sends any of them.
