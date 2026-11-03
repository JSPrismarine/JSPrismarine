---
'@jsprismarine/prismarine': patch
---

Read `minecraft:tool` rules for a Bedrock block through the Java names its tags know. The rules name Java blocks, and Java has no lit variants: its furnace and its redstone ore light up as a state rather than as a block of their own. A rule read against the Bedrock name alone made every pickaxe the wrong tool for `minecraft:lit_furnace` and `minecraft:lit_redstone_ore`, so mining one spilled the contents, dropped no block, and dug at bare-hand speed.
