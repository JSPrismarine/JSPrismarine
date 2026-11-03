---
'@jsprismarine/commands': patch
---

Read a block state list in `/fill`, as `/setblock` already does. Both of Bedrock's and Java's grammars put one between the block and the handling mode, and without it every fill wrote the block's default state: a region of logs all pointed the same way and a region of leaves was always the kind that decays.
