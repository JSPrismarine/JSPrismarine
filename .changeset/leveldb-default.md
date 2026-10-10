---
'@jsprismarine/prismarine': minor
---

Make `LevelDB` the default world provider, so a new install stores its world in the format Minecraft: Bedrock Edition uses rather than in one only this server understands.

Existing installs are untouched. `ConfigBuilder` writes resolved defaults back into `config.yaml` the first time it reads them, so any world that has already run carries an explicit `provider:` line and keeps whatever it had. To move one over, change that line — and note that the two formats do not share a directory layout, so the old `chunks` folder is left alone rather than converted.
