---
'@jsprismarine/worldgen': patch
'@jsprismarine/errors': patch
---

`@jsprismarine/worldgen` reads Java 26.4's world generation grammar when given its data pack format. `WorldgenDataSource`, `parseDensityFunction` and `parseNoiseGeneratorSettings` take an optional `format`, the target's data pack format major. From format 128 on, the `upscale` density function replaces `interpolated`, and `noise_settings` has no `default_block`, because the vanilla material rules place every solid block. A custom material rule that leaves a solid position unplaced gets stone there, where Java leaves air. Without a format they read 26.3's grammar as before. `@jsprismarine/errors` adds `UnsupportedUpscaleMode` and `UnevenUpscaleCells` for the `upscale` shapes that are not implemented, and `NonPositiveUpscaleCell` for an `upscale` axis whose `cell_size` is zero or less.
