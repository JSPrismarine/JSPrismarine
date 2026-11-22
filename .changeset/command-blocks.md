---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/blocks': patch
'@jsprismarine/commands': patch
'@jsprismarine/prismarine': patch
---

Command blocks keep the command a player sets and run it. An operator in creative mode opens a command block's screen, and the edit is stored in the block's `CommandBlock` block entity, under Bedrock's own tags. An impulse block runs on the rising edge of redstone power, a repeating block runs every tick while powered or always active, and the chain blocks in front of a block that ran follow it, with conditional blocks reading the success of the block behind them. Bedrock's tick delay and "execute on first tick" apply, and a comparator reads a block's success count. The `commandblocksenabled` game rule turns them off.

A command block minecart keeps a command it is given and runs it, as the cart, every four ticks over a powered activator rail, as Java's does. Its screen does not show the stored command yet (#3655).

`@jsprismarine/block-behaviors` adds the `jsprismarine:command_block` family and an optional `WorldActions.runCommand`. A `CommandSource` can carry a `name` that `/say` and `/me` speak as when it has no entity.
