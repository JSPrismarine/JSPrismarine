---
'@jsprismarine/prismarine': minor
---

Wire the last three throwing members of the content world adapter, and send a player's right click
through the content hooks.

`entities.spawn` puts a body into the live world. Which identifiers it accepts comes from the
content entity registry, so a pack's own mob is spawnable rather than only the types with a written
class; a written class is built where one adds behavior the identifier needs, a falling block is
built from the block its record names, and everything else is a `GenericEntity` carrying the
identifier, which is what a Bedrock client draws from anyway. An identifier no registry carries is
reported and nothing is spawned, so a lit TNT block no longer loses its entity.

`items.stateOf`, `items.targetOf` and `items.perform` are backed by `item/actorPort.ts`, over the
live player and the live entity index. Both queries are answered off the player. Eight of the
twenty-two entity-facing `ItemWorldAction` variants are performed against the system that owns
them: eating, a blow, a stack into the inventory, durability, armor, a name tag, a random teleport
and an item cooldown. The other fourteen are reported once per kind naming the system this server
has not written, and do nothing.

`item/interaction.ts` runs a player's right click through the content hooks before
`World.useItemOn` sees it: the clicked block's `onPlayerInteract` first, unless the player is
sneaking with something in hand, then the item's `onUseOn`, and a placement through the content
block adapter when both decline, so `onPlace` runs and a container gets its record. A right click
on an entity records the target and runs the item's `onUse`, which is how a behavior reaches
`targetOf`. The path declines whenever `content-packs` is off, so a server without content behaves
exactly as before.

Content block entity records are now the chunks' own block entities, so a container filled by a
behavior is saved with its chunk and sent to every client that loads it.
`blockentity/contentRecord.ts` states the mapping: `items` becomes Bedrock's `Items` list, the rest
of the record is JSON under one `jsprismarine:data` tag, and tags the record does not describe stay
where they were found.

The bump is `minor` because `worldEntityAccess` now takes an options object in place of its single
world argument, and per the versioning policy a breaking change below `1.0.0` is a `minor`.
