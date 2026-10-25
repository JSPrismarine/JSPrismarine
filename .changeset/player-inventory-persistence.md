---
'@jsprismarine/prismarine': minor
---

Persist what a player is carrying. `WorldPlayerData` had no inventory at all, so a logout threw
away every stack a player held, along with its durability, its name and the enchantments that
had just been made to work. It now carries the 36 main slots, the hand slot, the four armor
slots, the off hand and a new 27-slot ender chest, plus health, food, saturation and experience.

The LevelDB provider writes the containers as Bedrock's own `Inventory`, `Armor`, `Offhand` and
`EnderChestInventory` lists of item compounds, with `SelectedInventorySlot` and an `Attributes`
list beside them, so the game and any vanilla tool read the record. Each stack carries its count,
its aux value, its durability as `tag.Damage`, its name and lore under `tag.display`, and its
enchantments twice: Bedrock's `ench` numbers for the 37 a client knows, and the Java ids under
`tag.jsprismarine:enchantments` so Sweeping Edge and a datapack's own survive the trip. The
advancement progress and the enchantment seed moved into that record too; the LevelDB codec used
to drop both and only the JSON fallback kept them.

`Item` gained `minecraft:custom_name` and `minecraft:lore` to carry across the trip, read through
`getCustomName` and `getLore` and written through a copying `withDisplay`. `bedrockIds` gained
`javaEnchantmentId`, the inverse of `bedrockEnchantType`, which is what reading a stored `ench`
list needs.

`Player.disable` saved nothing for a player with no XUID, which is every player on a server with
online mode off. It now saves them under their name, which is the key `World.getPlayerData`
already read them back by.

Two things a player keeps in vanilla and still does not keep here: a per-player spawn point, which
this server does not model at all (`/spawnpoint` reports it unsupported and `getRespawnPoint`
always answers with the world spawn), and which world they logged out in, since a login always
places them in the default world.
