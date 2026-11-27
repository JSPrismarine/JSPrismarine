---
title: '@jsprismarine/client errors'
description: The code, message and meaning of every error @jsprismarine/client throws.
group: Documents
category: Errors
---

# @jsprismarine/client errors

These are the errors `@jsprismarine/client` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.client -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class        | What its errors mean                                         |
| ------------ | ------------------------------------------------------------ |
| `UsageError` | A command-line input mistake that should exit with status 2. |

## `CLIENT_ALREADY_CONNECTED`

`Already connected`

Thrown as `ClientErrors.AlreadyConnected`, which extends `Error`.

`connect()` was called on a client that is already connected. Make a new client for each
connection.

## `CLIENT_CLIENT_OUTDATED`

`The server refused the login: this client is out of date`

Thrown as `ClientErrors.ClientOutdated`, which extends `Error`.

The server runs a newer Minecraft version than the client; use a protocol the server
supports.

## `CLIENT_COMMAND_LINE_REJECTED`

`{reason}`

Thrown as `ClientErrors.CommandLineRejected`, which extends `UsageError`.

The command-line parser refused the arguments; the message is its own.

## `CLIENT_COUNT_BELOW_ONE`

`--count must be at least 1`

Thrown as `ClientErrors.CountBelowOne`, which extends `UsageError`.

`--count` asks for no bots at all. Give it 1 or more.

## `CLIENT_DISCONNECTED_BY_SERVER`

`Disconnected by the server: {reason}`

Thrown as `ClientErrors.DisconnectedByServer`, which extends `Error`.

The server disconnected the client during login and said why.

## `CLIENT_DISCONNECTED_BY_SERVER_WITHOUT_REASON`

`Disconnected by the server: no reason given`

Thrown as `ClientErrors.DisconnectedByServerWithoutReason`, which extends `Error`.

The server disconnected the client during login without saying why. Its log says why.

## `CLIENT_DISCONNECTED_DURING_LOGIN`

`Disconnected during login: {reason}`

Thrown as `ClientErrors.DisconnectedDuringLogin`, which extends `Error`.

The connection closed before the server spawned the client, such as a timeout or a server
that stopped.

## `CLIENT_DUPLICATE_PACKET_ID`

`Packet id 0x{id} is already registered to {name}`

Thrown as `ClientErrors.DuplicatePacketId`, which extends `Error`.

Two packet classes were registered under the same id.

## `CLIENT_HANDSHAKE_TOKEN_HAS_NO_KEY`

`` The handshake token carries no `x5u` public key ``

Thrown as `ClientErrors.HandshakeTokenHasNoKey`, which extends `Error`.

The server's encryption handshake does not carry its public key, so the client cannot derive
the key.

## `CLIENT_HANDSHAKE_TOKEN_HAS_NO_SALT`

`` The handshake token carries no `salt` ``

Thrown as `ClientErrors.HandshakeTokenHasNoSalt`, which extends `Error`.

The server's encryption handshake has no salt, so the client cannot derive the key. The
server is not a Bedrock server or is broken.

## `CLIENT_HANDSHAKE_TOKEN_NOT_JWT`

`A handshake token has a header and a payload separated by dots`

Thrown as `ClientErrors.HandshakeTokenNotJwt`, which extends `Error`.

The server's encryption handshake is not a JSON web token.

## `CLIENT_INVALID_COMMAND_LINE_ARGUMENTS`

`Invalid command-line arguments`

Thrown as `ClientErrors.InvalidCommandLineArguments`, which extends `UsageError`.

The client's command line could not be read. Run it with `--help` for the options.

## `CLIENT_INVALID_DURATION`

`Cannot read "{value}" as a duration. Try 30s, 10m, or 500ms.`

Thrown as `ClientErrors.InvalidDuration`, which extends `UsageError`.

A duration option is not a number with an optional `ms`, `s`, `m` or `h` unit.

## `CLIENT_INVALID_LINK_LOSS`

`Link loss must be from 0 to 1, got {loss}`

Thrown as `ClientErrors.InvalidLinkLoss`, which extends `RangeError`.

The simulated link was given a packet loss outside 0 to 1.

## `CLIENT_INVALID_PERCENTAGE`

`{flag} must be a percentage from 0 to 100, got "{value}"`

Thrown as `ClientErrors.InvalidPercentage`, which extends `UsageError`.

A percentage option is not a number from 0 to 100, with or without `%`.

## `CLIENT_INVALID_RATE`

`Cannot read "{value}" as a rate. Try 5 or 5/s.`

Thrown as `ClientErrors.InvalidRate`, which extends `UsageError`.

A rate option is not a number of events per second.

## `CLIENT_INVALID_WHOLE_NUMBER`

`{flag} must be a whole number, got "{value}"`

Thrown as `ClientErrors.InvalidWholeNumber`, which extends `UsageError`.

A count option is not a whole, non-negative number.

## `CLIENT_JAVA_FRAME_MALFORMED`

`The server sent {malformed}`

Thrown as `ClientErrors.JavaFrameMalformed`, which extends `Error`.

The Java Edition server sent a frame that is longer than any frame may be or ends inside its
length. The connection is closed.

## `CLIENT_JAVA_SESSION_JOIN_REQUIRED`

`The server is in online mode, and this client has no session to join it with`

Thrown as `ClientErrors.JavaSessionJoinRequired`, which extends `Error`.

A Java Edition server in online mode asked the client to log in through Mojang's session
server, and the client was made without a `joinSession` to do it. Pass one, or join a server
with `online-mode` off.

## `CLIENT_LINK_ALREADY_CONDITIONED`

`This process is already sending over a conditioned link`

Thrown as `ClientErrors.LinkAlreadyConditioned`, which extends `Error`.

A simulated network link was set up twice in one process. Set it up once.

## `CLIENT_LOGIN_REFUSED`

`The server refused the login with status {status}`

Thrown as `ClientErrors.LoginRefused`, which extends `Error`.

The server refused the login with a status the client does not name. The server's log says
why.

## `CLIENT_LOGIN_TIMED_OUT`

`Login timed out at stage {stage}`

Thrown as `ClientErrors.LoginTimedOut`, which extends `Error`.

The server did not get the client through login in time. The stage says which answer never
came.

## `CLIENT_MISSING_OPTION`

`--{flag} is required`

Thrown as `ClientErrors.MissingOption`, which extends `UsageError`.

A command was run without an option it needs.

## `CLIENT_NEGATIVE_LINK_LATENCY`

`Link latency must be at least 0 ms, got {latencyMs}`

Thrown as `ClientErrors.NegativeLinkLatency`, which extends `RangeError`.

The simulated link was given a negative latency.

## `CLIENT_NETHERNET_CONNECTION_FAILED`

`NetherNet connection failed: {reason}`

Thrown as `ClientErrors.NethernetConnectionFailed`, which extends `Error`.

The NetherNet connection failed before it opened. The reason is what the WebRTC layer
reported.

## `CLIENT_NETHERNET_CONNECTION_TIMED_OUT`

`NetherNet connection did not open within {timeoutMs} ms`

Thrown as `ClientErrors.NethernetConnectionTimedOut`, which extends `Error`.

The NetherNet data channel did not open in time, usually because a firewall or NAT blocks the
UDP traffic WebRTC needs.

## `CLIENT_NETHERNET_FRAME_NOT_BATCH`

`A NetherNet frame must be a batch, got id 0x{payload}`

Thrown as `ClientErrors.NethernetFrameNotBatch`, which extends `Error`.

The server sent a NetherNet frame that is not a packet batch, so the two sides disagree on
the protocol.

## `CLIENT_NOT_NETHERNET_SERVER`

`{host}:{port} does not speak NetherNet`

Thrown as `ClientErrors.NotNethernetServer`, which extends `Error`.

Nothing at that address answered NetherNet signaling. Check the address and port, and that
the server has NetherNet turned on.

## `CLIENT_PACKET_HEADER_TRUNCATED`

`Packet header runs past the end of the buffer`

Thrown as `ClientErrors.PacketHeaderTruncated`, which extends `Error`.

A packet from the server ended inside its header, so it is truncated.

## `CLIENT_PACKET_HEADER_UNTERMINATED`

`Packet header varint did not terminate after 5 bytes`

Thrown as `ClientErrors.PacketHeaderUnterminated`, which extends `Error`.

A packet header from the server is not a valid variable-length integer.

## `CLIENT_PICK_FROM_EMPTY_LIST`

`Cannot pick from an empty list`

Thrown as `ClientErrors.PickFromEmptyList`, which extends `Error`.

A bot behavior asked to pick from an empty list, such as a wander target when there is
nowhere to go.

## `CLIENT_SERVER_FULL`

`The server refused the login: the server is full`

Thrown as `ClientErrors.ServerFull`, which extends `Error`.

The server has no room for another player.

## `CLIENT_SERVER_OUTDATED`

`The server refused the login: the server is out of date`

Thrown as `ClientErrors.ServerOutdated`, which extends `Error`.

The server runs an older Minecraft version than the client; use a client protocol the server
supports.

## `CLIENT_SPAWNED_WITHOUT_START_GAME`

`The server spawned us without ever sending StartGame`

Thrown as `ClientErrors.SpawnedWithoutStartGame`, which extends `Error`.

The server said the client may spawn before it described the world, which a working server
never does.

## `CLIENT_TRANSPORT_NOT_CONNECTED`

`Cannot send on a transport that is not connected`

Thrown as `ClientErrors.TransportNotConnected`, which extends `Error`.

A packet was sent before the NetherNet connection opened or after it closed.

## `CLIENT_UNEXPECTED_JAVA_PACKET`

`Expected {expected} in the {phase} phase, got packet {id}`

Thrown as `ClientErrors.UnexpectedJavaPacket`, which extends `Error`.

A Java Edition server sent a packet at a point of the conversation that has no place for it,
such as a status answer that is not the one asked for. The server speaks the protocol
differently than this client reads it.

## `CLIENT_UNKNOWN_BEHAVIOR`

`Unknown behavior "{name}". Known behaviors: {behaviorNames}`

Thrown as `ClientErrors.UnknownBehavior`, which extends `Error`.

A bot was given a behavior name that does not exist. The message lists the ones that do.

## `CLIENT_UNKNOWN_JAVA_PACKET`

`No {phase} packet has id {id} in Java Edition {release}`

Thrown as `ClientErrors.UnknownJavaPacket`, which extends `Error`.

A Java Edition server sent a packet id the client has no layout for in that phase, so it cannot
read the rest of the conversation. The server speaks another release than the client.

## `CLIENT_UNKNOWN_NETWORK`

`--network must be raknet or nethernet, got "{value}"`

Thrown as `ClientErrors.UnknownNetwork`, which extends `UsageError`.

`--network` names a transport the client does not have.

## `CLIENT_UNSUPPORTED_PROTOCOL`

`This client speaks protocol {protocols}, not {protocolVersion}`

Thrown as `ClientErrors.UnsupportedProtocol`, which extends `Error`.

The client was asked to speak a protocol version it does not implement. The message lists the
ones it does.
<!-- /fact -->
