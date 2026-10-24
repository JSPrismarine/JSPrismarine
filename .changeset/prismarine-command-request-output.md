---
'@jsprismarine/prismarine': patch
---

`CommandRequestHandler` drops a request whose origin is not `Player`, since a client has no
business claiming a command block or automation origin, and answers each dispatched command
with a `CommandOutputPacket` that echoes the request's origin and reports whether the command
ran as its success count. `CommandManager.dispatchCommand` resolves to that boolean instead of
`void`. `CommandRequestPacket` gains `encodePayload`, and its `commandOriginData` is always set
rather than possibly `null`.
