---
'@jsprismarine/prismarine': patch
---

Break boats and rafts the way Java's `VehicleEntity` does: each blow adds ten times its damage, a tick takes a point off, and past 40 the boat breaks and drops the boat item of its own wood with whatever its chest held. A creative player's blow removes it with no item.

Size mob and vehicle containers like Java: a container that states no `inventory_size` holds only its equipment slots (camel, nautilus, command block minecart), and a llama's chest holds three slots per point of strength, with `inventory_size` as the size at full strength.

Put a held item into the empty `minecraft:equippable` slot that takes it on a tamed adult whose interactions do not claim the item, so a tamed trader llama takes a carpet, as Java's `Equippable.equipOnInteract` allows.
