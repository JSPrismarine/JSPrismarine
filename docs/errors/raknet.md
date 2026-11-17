---
title: '@jsprismarine/raknet errors'
description: The code, message and meaning of every error @jsprismarine/raknet throws.
group: Documents
category: Errors
---

# @jsprismarine/raknet errors

These are the errors `@jsprismarine/raknet` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.raknet -->
## `RAKNET_ALREADY_CONNECTED`

`Already connecting or connected; use a ClientSocket per connection`

Thrown as `RaknetErrors.AlreadyConnected`, which extends `Error`.

`connect()` was called on a RakNet client socket that is already connecting or connected. Use
one socket per connection.

## `RAKNET_CLIENT_SOCKET_CLOSED`

`Cannot connect on a killed ClientSocket`

Thrown as `RaknetErrors.ClientSocketClosed`, which extends `Error`.

`connect()` was called on a RakNet client socket that was closed.

## `RAKNET_CLIENT_SOCKET_KILLED`

`ClientSocket was killed`

Thrown as `RaknetErrors.ClientSocketKilled`, which extends `Error`.

The RakNet client socket was closed while a connection or ping was still waiting.

## `RAKNET_CONNECTION_REFUSED`

`Connection refused: {reason}`

Thrown as `RaknetErrors.ConnectionRefused`, which extends `Error`.

The server refused the RakNet connection and said why, such as an incompatible protocol
version.

## `RAKNET_CONNECTION_TIMED_OUT`

`Connection to {address}:{port} timed out`

Thrown as `RaknetErrors.ConnectionTimedOut`, which extends `Error`.

The server did not answer the RakNet handshake in time. Check the address and port, and that
UDP traffic reaches it.

## `RAKNET_DISCONNECTED_BEFORE_HANDSHAKE_COMPLETED`

`Disconnected before the handshake completed: {reason}`

Thrown as `RaknetErrors.DisconnectedBeforeHandshakeCompleted`, which extends `Error`.

The connection closed before the RakNet handshake finished.

## `RAKNET_INVALID_FRAGMENT_INDEX`

`Invalid Frame fragment index={fragmentIndex}, count={fragmentSize}`

Thrown as `RaknetErrors.InvalidFragmentIndex`, which extends `Error`.

A peer sent a fragment whose index is past its fragment count, so the frame is malformed.

## `RAKNET_INVALID_FRAME_LENGTH`

`Invalid Frame length={length}`

Thrown as `RaknetErrors.InvalidFrameLength`, which extends `Error`.

A peer sent a frame with no payload, so it is malformed.

## `RAKNET_INVALID_IPV4_ADDRESS`

`Invalid IPv4 address: {address}`

Thrown as `RaknetErrors.InvalidIpv4Address`, which extends `Error`.

An address was written as IPv4 but is not one.

## `RAKNET_INVALID_IPV6_ADDRESS`

`Invalid IPv6 address: {text}`

Thrown as `RaknetErrors.InvalidIpv6Address`, which extends `Error`.

An address was written as IPv6 but is not one.

## `RAKNET_INVALID_RING_CAPACITY`

`A shared byte ring needs a power-of-two capacity from 8 to 2^30 bytes; got {capacity}`

Thrown as `RaknetErrors.InvalidRingCapacity`, which extends `RangeError`.

The RakNet worker's shared ring was given a capacity that is not a power of two between 8
bytes and 1 GiB.

## `RAKNET_INVALID_RING_RECORD`

`Shared byte ring contains an invalid {length}-byte record`

Thrown as `RaknetErrors.InvalidRingRecord`, which extends `RangeError`.

The memory the RakNet worker shares with the main thread holds a record longer than the
buffer, so the two sides disagree on its layout. This is a bug.

## `RAKNET_INVALID_UDP_BUFFER_SIZE`

`UDP {name} buffer size must be a positive safe integer, got {size}`

Thrown as `RaknetErrors.InvalidUdpBufferSize`, which extends `RangeError`.

A UDP socket buffer size setting is not a positive whole number.

## `RAKNET_LOOPBACK_HANDSHAKE_TIMED_OUT`

`Loopback handshake timed out`

Thrown as `RaknetErrors.LoopbackHandshakeTimedOut`, which extends `Error`.

The in-process loopback connection did not finish its handshake in time. This is a bug in the
loopback socket or the test that drives it.

## `RAKNET_LOOPBACK_SOCKET_CLOSED`

`Cannot connect on a killed LoopbackSocket`

Thrown as `RaknetErrors.LoopbackSocketClosed`, which extends `Error`.

`connect()` was called on a loopback socket that was closed.

## `RAKNET_PING_ON_CLOSED_SOCKET`

`Cannot ping on a killed ClientSocket`

Thrown as `RaknetErrors.PingOnClosedSocket`, which extends `Error`.

`ping()` was called on a RakNet client socket that was closed.

## `RAKNET_PING_TIMED_OUT`

`Ping to {token} timed out`

Thrown as `RaknetErrors.PingTimedOut`, which extends `Error`.

The server did not answer a RakNet ping in time.

## `RAKNET_RING_MEMORY_WRONG_SIZE`

`Shared byte ring memory has {byteLength} bytes; expected {value}`

Thrown as `RaknetErrors.RingMemoryWrongSize`, which extends `RangeError`.

The shared memory given to the RakNet worker's ring has the wrong size. This is a bug in the
worker's setup.

## `RAKNET_SEND_ON_STOPPED_WORKER`

`Cannot send through a stopped RakNet worker`

Thrown as `RaknetErrors.SendOnStoppedWorker`, which extends `Error`.

A packet was sent after the RakNet worker stopped, which happens while the server shuts down.

## `RAKNET_SERVER_NAME_WITHOUT_VERSION`

`A server name requires a supported Minecraft version!`

Thrown as `RaknetErrors.ServerNameWithoutVersion`, which extends `Error`.

The server list entry was built for a protocol with no Minecraft version. This is a bug in
the protocol table.

## `RAKNET_START_STOPPED_WORKER_SOCKET`

`Cannot start a stopped Worker RakNet socket`

Thrown as `RaknetErrors.StartStoppedWorkerSocket`, which extends `Error`.

A RakNet worker socket was started after it was stopped. Make a new one.

## `RAKNET_TOO_MANY_FRAMES_IN_DATAGRAM`

`Datagram holds more than {maxFramesPerDatagram} frames`

Thrown as `RaknetErrors.TooManyFramesInDatagram`, which extends `Error`.

A datagram was built with more frames than RakNet allows in one. This is a bug in the sender.

## `RAKNET_WORKER_EXITED_WITH_CODE`

`RakNet worker exited with code {code}`

Thrown as `RaknetErrors.WorkerExitedWithCode`, which extends `Error`.

The RakNet worker thread exited, so the server stops accepting players. The log before this
line says why.

## `RAKNET_WORKER_FAILED`

`{message}`

Thrown as `RaknetErrors.WorkerFailed`, which extends `Error`.

The RakNet worker thread failed. The message is the worker's own.

## `RAKNET_WORKER_HAS_NO_PARENT_PORT`

`RakNet worker has no parent port`

Thrown as `RaknetErrors.WorkerHasNoParentPort`, which extends `Error`.

The RakNet worker module was run as a main thread. Only the server starts it.

## `RAKNET_WORKER_QUEUE_IS_FULL`

`RakNet worker queue is full ({queuedBytes}/{capacity} bytes queued)`

Thrown as `RaknetErrors.WorkerQueueIsFull`, which extends `Error`.

The server queued more outgoing data for the RakNet worker than the shared buffer holds, so
the worker fell behind. Raise the buffer size or lower the load.

## `RAKNET_WORKER_RECEIVED_INVALID_STARTUP_DATA`

`RakNet worker received invalid startup data`

Thrown as `RaknetErrors.WorkerReceivedInvalidStartupData`, which extends `TypeError`.

The RakNet worker started with options that are not the shape the server sends. This is a bug
in the worker's setup.

## `RAKNET_WORKER_SOCKET_ALREADY_STARTED`

`Worker RakNet socket has already been started`

Thrown as `RaknetErrors.WorkerSocketAlreadyStarted`, which extends `Error`.

A RakNet worker socket was started twice.

## `RAKNET_WORKER_SOCKET_NOT_STARTED`

`Worker RakNet socket has not been started`

Thrown as `RaknetErrors.WorkerSocketNotStarted`, which extends `Error`.

Code waited for a RakNet worker socket that was never started.
<!-- /fact -->
