---
'@jsprismarine/protocol': patch
---

Add `LocatorBarPacket` (id 341) with the `LocatorBarWaypointPayload` and `ServerWaypointPayload` structures and the `ServerWaypointGroupAction` enum: a `GroupHandle` uuid, the `UpdateFlag` and seven optional waypoint fields, then the `ActionFlag`, in the order protocol 2193 defines.
