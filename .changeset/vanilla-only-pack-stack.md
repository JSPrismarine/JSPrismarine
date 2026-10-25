---
'@jsprismarine/prismarine': minor
'@jsprismarine/entities': patch
'@jsprismarine/content': patch
'@jsprismarine/packs': patch
---

Serve the vanilla behavior pack alone, and let Mojang's content load without 55 warnings about
itself.

The default stack handed the whole BDS `behavior_packs` folder to the loader, so a default build
served the editor pack's five `editor:` entities, chemistry's balloon and ice bomb, and eight
chemistry reducer recipes that won over the vanilla recipes of the same name. It now composes the
packs it was asked for, by the header UUID a world references a pack by, and the default asks for
the vanilla behavior pack: 129 entity types rather than 136. `PackStackRequest.bedrockPacks` names
more packs by UUID, or `'all'` composes the folder whole, for a server that does want chemistry or
the editor.

A clean build reported 102 warnings and no error. 26 of them were the `"events": null` an entity
with no events is written with, and 26 the empty `"remove": {}` of a randomize branch that changes
nothing; the parser already read both correctly, so the warnings only taught an operator to skip
the report. Both are silent now, and an events key that is neither an object nor null, and a
`component_groups` that is there and is not a list, still report. What is left is 47 warnings that
each name something the server does not do, and an unknown component now names the first file that
declared it.
