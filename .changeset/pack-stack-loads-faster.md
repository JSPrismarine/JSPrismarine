---
'@jsprismarine/packs': patch
---

Load the vanilla pack stack in about a third of the time. Two changes, both measured against the
BDS vanilla layers plus the `jsprismarine_vanilla` overlay plus the Java 26.3 datapack, which is
what a server boots on: 2573 ms to 951 ms, with a byte-identical set of definitions and
diagnostics.

- `parseLenientJson` tries strict JSON before the lenient cleanup. The cleanup rewrites the whole
  text character by character twice over to blank out comments and trailing commas, and valid JSON
  has neither outside a string, so it hands a strict file back unchanged. 8486 of the stack's 8556
  Bedrock files are strict, and parsing them strictly costs 74 ms where the cleanup cost 563 ms.
- `load` opens only the files a registry owns. A pack folder holds much more than definitions - the
  composed vanilla pack ships 1311 `.nbt` structures, a 3 MB `level.dat` and its textures beside
  2588 readable files - and a path no registry routes was read, buffered and then dropped.
  `expandSource` takes a new optional `PackFileFilter` for this; with none it still returns a pack
  whole, and `manifest.json` and the `__brarchive/` containers are read whatever the filter says.
