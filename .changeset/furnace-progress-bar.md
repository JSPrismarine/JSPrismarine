---
'@jsprismarine/prismarine': patch
---

Move the furnace progress bar. A cooking station wrote its counters to the block entity and told nobody, so `ContainerSetDataPacket` — the only thing a Bedrock client draws the arrow and the flame from — was never sent by this server at all, and a furnace cooked behind a dead screen. Each tick now hands the three furnace properties to every player with that station open: the cook ticks the arrow is drawn from, and the fuel left and what it started with that the flame is a fraction of. A property is sent only when its value changes, so a station nobody is cooking in costs one priming send per open and nothing after it.
