---
'@jsprismarine/prismarine': minor
---

Give players somewhere to put armour, so the armour they already had starts working.

Both ends of this were finished long before the middle was. Twenty-four armour items have declared their defence points since they were written, and the damage formula has known what to do with them since the pipeline was laid - but `HumanInventory` was `super(36)` and nothing else, so there was nowhere to read from and every blow landed as though the player were naked.

**The armour is a container of its own**, not four more slots on the end of the main one. The client addresses it that way - `ContainerUiId.ARMOR_CONTAINER`, window 120 - and anything walking the inventory looking for space would otherwise offer to put a pickaxe on your head. An off-hand slot comes with it, since the protocol carries the two together.

Equipping works through the drag machinery that was already there: `ItemStackRequestHandler` learned to read and write the armour container alongside the cursor and the crafting grid, so the same code path that moves a stack between two inventory slots moves a helmet onto a head. The slot id is range-checked, because a request naming slot nine would otherwise write past the end of a four-slot container.

**`MobArmorEquipmentPacket`** is what lets anybody else see it. `AddPlayerPacket` carries the held item and nothing more, so armour has to follow a player into view as a packet of its own - exactly as the skeleton's bow does. It is positional and always all five pieces, empty ones sent as air: a client that was handed three would read the next packet's bytes as the fourth.

The `firedamage`-style rules already knew that drowning and starving ignore armour, so a chestplate now takes the edge off a sword and does nothing at all against a lungful of water. Toughness does what it was written to do - iron protects less and less as a blow gets harder, and diamond holds up.

Durability is still not decremented, on armour or on weapons. It needs a slot to be told to the client as it changes, which is now possible, and it is the next thing rather than a thing left out.
