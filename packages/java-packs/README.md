# @jsprismarine/java-packs

[![License: MIT OR MPL-2.0](https://img.shields.io/badge/license-MIT%20OR%20MPL--2.0-blue)](https://github.com/JSPrismarine/JSPrismarine#readme)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/java-packs)](https://www.npmjs.com/package/@jsprismarine/java-packs)

Converts Bedrock resource packs into Java Edition resource packs a vanilla client can load.

`convertResourcePacks(stack, target)` from `@jsprismarine/java-packs/convert` takes a stack of
Bedrock resource packs, top first, and the Java release to build for, and returns the Java pack's
files, ready for `writeZip` from `@jsprismarine/packs/zip`. It reads no file and keeps no state, so
the same stack and release always give the same bytes, and a caller can cache the pack by its
inputs. A file, language key or sound event the stack holds more than once comes from the highest
pack, as Bedrock resolves it.

```ts
import { convertResourcePacks } from '@jsprismarine/java-packs/convert';
import { writeZip } from '@jsprismarine/packs/zip';
import { RELEASE } from '@jsprismarine/protocol/java/versions/26.3/release';

const { files, textures, report } = convertResourcePacks([{ name: 'Furniture', files: packFiles }], {
    release: RELEASE.minecraftVersion,
    format: RELEASE.resourcePackFormat
});
const zip = writeZip(files);
```

What converts:

| Bedrock                                                  | Java                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The manifest's name, `pack_icon.png`                     | `pack.mcmeta` with the release's `min_format` and `max_format`, `pack.png`                                   |
| PNG and TGA textures under `textures/`                   | PNG under `assets/bedrock/textures/`, at the same path made a Java path, added to the block and item atlases |
| `textures/flipbook_textures.json`                        | Each animated texture's `.png.mcmeta`                                                                        |
| `texts/<locale>.lang`                                    | `assets/bedrock/lang/<locale>.json`, with Bedrock's keys                                                     |
| `sounds/sound_definitions.json` and its Ogg Vorbis files | `assets/bedrock/sounds.json` and `assets/bedrock/sounds/`                                                    |
| `font/glyph_XX.png`                                      | Bitmap providers in the default font over code points `0xXX00` to `0xXXFF`                                   |

`textures` maps each Bedrock texture path to the Java texture it became, so a model written later
can name it. `report` lists, per Bedrock pack, how many assets of each kind converted and a note for
everything else: what converted with a loss, what a later step converts (models, client entities,
attachables, block appearance, fog), what no vanilla Java client can show (animations, render
controllers, particles, JSON UI, materials, Vibrant Visuals data, and sounds that ship as WAV or
FSB), and what did not read. [Bedrock resource packs for Java clients](../../docs/plans/bedrock-resource-packs-for-java.md)
plans the rest.

`decodeTga` and `encodePng` from `@jsprismarine/java-packs/image` are the image codecs the
conversion uses. `decodeTga` reads the color-mapped, true color and grayscale TGA files Bedrock
packs ship, run-length encoded or not, and says why a file does not read rather than throwing.
