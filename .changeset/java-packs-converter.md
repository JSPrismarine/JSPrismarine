---
'@jsprismarine/java-packs': patch
---

Add `@jsprismarine/java-packs`, which converts a stack of Bedrock resource packs into one Java Edition resource pack. `convertResourcePacks` writes `pack.mcmeta` for the target release's resource pack format, the icon, every PNG and TGA texture as PNG under the `bedrock` namespace with its flipbook animation and atlas source, the language files with Bedrock's keys, the sounds that ship as Ogg Vorbis, and glyph fonts. It returns a report per pack of what converted, what a later step converts and what a vanilla Java client cannot show. `decodeTga` and `encodePng` are its image codecs.
