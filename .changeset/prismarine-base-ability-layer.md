---
'@jsprismarine/prismarine': patch
---

`PlayerSession.sendAbilities` names all twenty abilities in its base layer, including `VerticalFlySpeed` and `PrivilegedBuilder`, so the client applies the vertical fly speed the packet already carried. `AbilityLayerType` gains `LOADING_SCREEN`, and `UpdateAbilitiesPacket` is exported from the packet registry.
