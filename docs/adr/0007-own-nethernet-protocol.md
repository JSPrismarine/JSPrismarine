# Implement the NetherNet protocol in `@jsprismarine/nethernet`

Status: accepted. Replaces the requirement in [the NetherNet plan](../plans/nethernet-transport.md)
to use the npm `nethernet` package for the WebRTC side.

The server and our client ran NetherNet through `nethernet` (PrismarineJS's node-nethernet), with
`@jsprismarine/nethernet` beside it for HTTP signaling, the identity, the LAN advertisement and
join by address. We now write the rest ourselves, in TypeScript, in `@jsprismarine/nethernet`:
offer, answer and candidate handling for server and client, the connection's message
segmentation, the LAN discovery packets with their encryption, and the signal format. The npm
package and `protodef` leave the workspace.

## Why

- **The WebRTC stack has to be ours to choose.** `nethernet` picks its stack by name, `werift` or
  `wrtc`, and takes no other. [ADR 0006](0006-libdatachannel-for-nethernet-server.md) moves
  NetherNet to libdatachannel, and getting a third stack in meant replacing a field on its
  `Server`.
- **Its werift workarounds are for a werift we do not run.** It pins werift 0.24.4 and patches
  around two of that release's bugs. We run 0.27 for its SCTP fixes, where both patches misfire,
  and `adaptPeerConnections` existed to undo them.
- **It hands us untyped objects.** The server read the peer connection through `unknown` and
  guards, to learn a player's address and to drain a kick.
- **It cannot be compiled ahead of time.** It builds its packet codec at run time with `protodef`'s
  compiler, which generates code and runs it with `eval`. The scriptc build needs code that
  exists at build time.
- **The client gets what the server gets.** One implementation, taking a WebRTC driver as an
  option, serves both.

## What it costs

- About 1,500 lines of JavaScript to replace, and the wire compatibility that came with them. The
  LAN discovery encryption and the segmentation are the parts a mistake would break silently.
- We stop receiving `nethernet`'s fixes and protocol updates, and have to follow Bedrock's changes
  ourselves.

## How we keep it compatible

Our client already joins Bedrock Dedicated Server in its tests, and cinnabar, a Bedrock client,
joins our server in the client end-to-end suite. Those two run our code against implementations
we did not write, in both directions, and are the check. `nethernet` is removed in the slice that
replaces it.

## Alternatives not taken

**Ask `nethernet` for a backend option.** It solves the first reason and none of the others, and
depends on a release we do not control.

**Keep swapping the backend object it holds.** It works today and breaks when the package changes
how it builds peer connections, without a type error.

**Fork `nethernet`.** A fork keeps the JavaScript, the `protodef` codec and the werift patches, and
adds a package to publish.
