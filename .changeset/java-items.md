---
'@jsprismarine/prismarine': minor
---

Java Edition players can drop items with the drop key: one item, or the whole stack with Ctrl, through a new `dropHeldItem` intent. Java clients see the stack a dropped item holds and how much an experience orb is worth, see a dropped stack's new count after a merge, watch items fly to whoever picks them up, and are shown their own experience bar and level.

Breaking: `SessionPresenter` gains required `showExperience`, `showPickUp` and `showItemCount` methods, and code that implements it has to add them. Pickups reach every client through `showPickUp` rather than a `TakeItemActorPacket` sent straight to the session.
