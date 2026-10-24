---
'@jsprismarine/prismarine': patch
---

`RequestAbilityHandler` applies the client's flight toggle through `Player.setFlying` and answers every other request, or a refused one, by resending the player's abilities, so the client no longer waits for an `UpdateAbilitiesPacket` that never comes. `RequestPermissionsHandler` lets an operator add or remove another player from the op list through the player list's permission dropdown and resends the current abilities for a `Custom` level or a non-operator requester.
