---
'@jsprismarine/prismarine': patch
---

`/replaceitem`, `/item` and `/loot replace` write the slots of mobs as well as players and container blocks ([#3567](https://github.com/JSPrismarine/JSPrismarine/issues/3567)): a zombie's head, a horse's saddle and armor, a llama's chest, a villager's pocket and a chest minecart's container. Java's slot names mean what they mean in Java 26.3, so `container.0` on a player is hotbar slot 0, where `/loot replace` used to write the first slot past the hotbar. `/item` is registered: `replace`, `fill` and `override` with an item or from another slot, on blocks and entities. `/item modify` and a modifier on `/item … from` refuse with "This server has no item modifiers for /item yet, so that command cannot run". A refusal names what went wrong in a sentence, such as "The target does not have slot saddle" or "Could not replace slot 9, must be a value between 0 and 8.".
