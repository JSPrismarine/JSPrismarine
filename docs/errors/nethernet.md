---
title: '@jsprismarine/nethernet errors'
description: The code, message and meaning of every error @jsprismarine/nethernet throws.
group: Documents
category: Errors
---

# @jsprismarine/nethernet errors

These are the errors `@jsprismarine/nethernet` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.nethernet -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                       | What its errors mean                                                                |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `JoinRefusedError`          | A failed `POST /v1/join/<networkId>`, with what the server answered.                |
| `NetherNetUnavailableError` | The native library could not be loaded, so NetherNet cannot run here.               |
| `RefusedRequest`            | A signaling request the server refuses, answered with an HTTP error status.         |
| `UdpPortsError`             | Thrown for a setting Bedrock Dedicated Server 1.26.70.24 refuses, with its message. |

## `NETHERNET_CLIENT_CONNECTS_ONCE`

`A NetherNet client connects once`

Thrown as `NethernetErrors.ClientConnectsOnce`, which extends `Error`.

`connect()` was called twice on one NetherNet client. Make a new client for each connection.

## `NETHERNET_CONNECTION_IS_CLOSED`

`The NetherNet connection is closed`

Thrown as `NethernetErrors.ConnectionIsClosed`, which extends `Error`.

A message was sent on a NetherNet connection after it closed.

## `NETHERNET_CONNECTION_IS_NOT_OPEN`

`The NetherNet connection is not open`

Thrown as `NethernetErrors.ConnectionIsNotOpen`, which extends `Error`.

A message was sent before the NetherNet connection opened or after it closed.

## `NETHERNET_DESCRIPTION_HAS_NO_IDENTITY`

`The description carries no a=identity`

Thrown as `NethernetErrors.DescriptionHasNoIdentity`, which extends `Error`.

A peer's WebRTC offer has no `a=identity` line, so the server cannot tell who sent it. The
client is not a Bedrock client, or is offline-mode only.

## `NETHERNET_DISCOVERY_PACKET_CHECKSUM_DOES_NOT_MATCH`

`A discovery packet’s checksum does not match`

Thrown as `NethernetErrors.DiscoveryPacketChecksumDoesNotMatch`, which extends `Error`.

A LAN discovery datagram does not decrypt to a valid packet, so it is damaged or not from
Minecraft.

## `NETHERNET_DISCOVERY_PACKET_IS_TOO_SHORT`

`A discovery packet is too short`

Thrown as `NethernetErrors.DiscoveryPacketIsTooShort`, which extends `Error`.

A LAN discovery datagram is too short to be one, so something else sent to UDP port 7551.

## `NETHERNET_DISCOVERY_PACKET_TEXT_RUNS_PAST_END`

`A discovery packet’s text runs past its end`

Thrown as `NethernetErrors.DiscoveryPacketTextRunsPastEnd`, which extends `Error`.

A LAN discovery datagram's text field runs past its end, so it is malformed.

## `NETHERNET_EMPTY_SEGMENT`

`A NetherNet segment needs a count and at least one byte`

Thrown as `NethernetErrors.EmptySegment`, which extends `Error`.

A peer sent an empty NetherNet segment, so it is malformed.

## `NETHERNET_EXPECTED_JOIN_PATH`

`Expected /v1/join/<networkId>`

Thrown as `NethernetErrors.ExpectedJoinPath`, which extends `RefusedRequest`.

A request to the signaling server named no network id, or one too long. The server answers
400.

## `NETHERNET_IDENTITY_ASSERTION_IS_MALFORMED`

`The identity assertion is malformed`

Thrown as `NethernetErrors.IdentityAssertionIsMalformed`, which extends `Error`.

A peer's `a=identity` holds an assertion that is not the JSON Bedrock writes.

## `NETHERNET_IDENTITY_FINGERPRINT_MISMATCH`

`The identity does not sign this description's fingerprints`

Thrown as `NethernetErrors.IdentityFingerprintMismatch`, which extends `Error`.

A peer's identity was signed for a different WebRTC description, so somebody reused another
session's identity.

## `NETHERNET_IDENTITY_HAS_NO_ASSERTION`

`The a=identity has no assertion`

Thrown as `NethernetErrors.IdentityHasNoAssertion`, which extends `Error`.

A peer's `a=identity` line carries no assertion.

## `NETHERNET_IDENTITY_TOKEN_HAS_EXPIRED`

`The identity token has expired`

Thrown as `NethernetErrors.IdentityTokenHasExpired`, which extends `Error`.

A peer's identity token expired. The client retries with a fresh one; a server clock that is
far off refuses every peer this way.

## `NETHERNET_IDENTITY_TOKEN_HAS_NO_CLAIMS`

`The identity token has no claims`

Thrown as `NethernetErrors.IdentityTokenHasNoClaims`, which extends `Error`.

A peer's identity token has no claims.

## `NETHERNET_IDENTITY_TOKEN_HAS_NO_KEY`

`The identity token has no usable cpk claim`

Thrown as `NethernetErrors.IdentityTokenHasNoKey`, which extends `Error`.

A peer's identity token does not carry a public key the server can read.

## `NETHERNET_IDENTITY_TOKEN_NOT_SELF_SIGNED`

`The identity token is not signed by its own key`

Thrown as `NethernetErrors.IdentityTokenNotSelfSigned`, which extends `Error`.

A peer's identity token is not signed by the key it names, so it is forged.

## `NETHERNET_INVALID_IDENTITY_KEY_CURVE`

`A NetherNet identity key must be {bedrockCurve}`

Thrown as `NethernetErrors.InvalidIdentityKeyCurve`, which extends `Error`.

A NetherNet identity was made with a key on a curve other than the one Bedrock uses. Generate
the key on that curve.

## `NETHERNET_INVALID_SERVER_PUBLIC_IP`

`Invalid value '{text}' for server-public-ip: {notAnIp}`

Thrown as `NethernetErrors.InvalidServerPublicIp`, which extends `UdpPortsError`.

The `server-public-ip` setting is not an IP address. Set it to the address clients reach the
server at, without a port.

## `NETHERNET_INVALID_SERVER_UDP_PORTS`

`server-udp-ports: {message}`

Thrown as `NethernetErrors.InvalidServerUdpPorts`, which extends `UdpPortsError`.

The `server-udp-ports` setting is malformed. The message is the one Bedrock Dedicated Server
gives for the same value.

## `NETHERNET_JOIN_REFUSED`

`The server refused the offer with HTTP {status}`

Thrown as `NethernetErrors.JoinRefused`, which extends `JoinRefusedError`.

The NetherNet server refused the join offer with that HTTP status and no explanation.

## `NETHERNET_JOIN_REFUSED_WITH_BODY`

`The server refused the offer with HTTP {status}: {body}`

Thrown as `NethernetErrors.JoinRefusedWithBody`, which extends `JoinRefusedError`.

The NetherNet server refused the join offer, with that HTTP status and its own explanation.

## `NETHERNET_JOIN_STATUS_HAS_NO_NUMBER`

`The join status has no number {key}`

Thrown as `NethernetErrors.JoinStatusHasNoNumber`, which extends `Error`.

A NetherNet server's join status lacks a number it must have, so the server is not one this
client understands.

## `NETHERNET_JOIN_STATUS_HAS_NO_STRING`

`The join status has no string {key}`

Thrown as `NethernetErrors.JoinStatusHasNoString`, which extends `Error`.

A NetherNet server's join status lacks a text field it must have, so the server is not one
this client understands.

## `NETHERNET_JOIN_STATUS_IS_NOT_OBJECT`

`The join status is not an object`

Thrown as `NethernetErrors.JoinStatusIsNotObject`, which extends `Error`.

A NetherNet server answered the join status request with something other than a JSON object.

## `NETHERNET_MESSAGE_CANNOT_BE_EMPTY`

`A NetherNet message cannot be empty`

Thrown as `NethernetErrors.MessageCannotBeEmpty`, which extends `RangeError`.

An empty message was sent on a NetherNet connection.

## `NETHERNET_MESSAGE_TOO_LARGE`

`A NetherNet message is longer than the {maxBytes} bytes accepted`

Thrown as `NethernetErrors.MessageTooLarge`, which extends `Error`.

A peer sent a message larger than the connection accepts, so it is refused and the peer
disconnected.

## `NETHERNET_MESSAGE_TOO_LONG_TO_SEGMENT`

`A {byteLength} byte message is longer than NetherNet's {maxSegments} segments of {segmentBytes}`

Thrown as `NethernetErrors.MessageTooLongToSegment`, which extends `RangeError`.

A message is too long to split into the most segments NetherNet allows. The sender built a
packet batch larger than the protocol can carry.

## `NETHERNET_MISSING_SDP_OFFER`

`Missing SDP offer in request body`

Thrown as `NethernetErrors.MissingSdpOffer`, which extends `RefusedRequest`.

A join request had an empty body where the WebRTC offer belongs. The server answers 400.

## `NETHERNET_NATIVE_CALL_FAILED`

`{message}: {log}`

Thrown as `NethernetErrors.NativeCallFailed`, which extends `Error`.

A call into the native NetherNet library failed. The message is the library's error followed by what it logged during the call; the cause is the original error.

## `NETHERNET_NATIVE_LIBRARY_CANNOT_LOAD`

`NetherNet's native library cannot load on {platform}-{arch}: {value}`

Thrown as `NethernetErrors.NativeLibraryCannotLoad`, which extends `NetherNetUnavailableError`.

NetherNet needs the native networking library, and it does not load on this machine. The
message ends with the loader's reason; the `native-network` errors explain how to install it.

## `NETHERNET_NO_LAN_SERVER_ANSWERED`

`No NetherNet server {networkId} answered on the LAN`

Thrown as `NethernetErrors.NoLanServerAnswered`, which extends `Error`.

No server with that network id answered LAN discovery. Check that the server runs on this
network and that UDP port 7551 is open.

## `NETHERNET_PEER_ENDED_BEFORE_DESCRIPTION`

`The peer {state} before it had a description`

Thrown as `NethernetErrors.PeerEndedBeforeDescription`, which extends `Error`.

The WebRTC peer closed or failed before it produced its description. The native library's log
says why.

## `NETHERNET_PEER_HAS_NO_DESCRIPTION`

`The peer gathered its candidates but has no description`

Thrown as `NethernetErrors.PeerHasNoDescription`, which extends `Error`.

The WebRTC peer finished gathering candidates without a description. This is a bug in the
native driver.

## `NETHERNET_PORT_STRATEGY_OUT_OF_RANGE`

`The strategy picked {port}, outside {start}-{end}`

Thrown as `NethernetErrors.PortStrategyOutOfRange`, which extends `RangeError`.

The port allocation strategy picked a port outside its range. This is a bug in the strategy.

## `NETHERNET_SDP_OFFER_TOO_LARGE`

`SDP offer is too large`

Thrown as `NethernetErrors.SdpOfferTooLarge`, which extends `RefusedRequest`.

A join request's WebRTC offer is larger than the server accepts. The server answers 413.

## `NETHERNET_SEGMENT_OUT_OF_SEQUENCE`

`A NetherNet segment says {left} more follow, where {value} were due`

Thrown as `NethernetErrors.SegmentOutOfSequence`, which extends `Error`.

A peer's NetherNet segments arrived out of sequence, so the message is damaged.

## `NETHERNET_SERVER_IS_CLOSED`

`The NetherNet server is closed`

Thrown as `NethernetErrors.ServerIsClosed`, which extends `Error`.

`listen()` was called on a NetherNet server that was closed.

## `NETHERNET_SIGNAL_CONNECTION_ID_IS_NOT_NUMBER`

`NetherNet signal connection ID {id} is not a number`

Thrown as `NethernetErrors.SignalConnectionIdIsNotNumber`, which extends `Error`.

A NetherNet signal's connection id is not a number, so the signal is malformed.

## `NETHERNET_UNKNOWN_DISCOVERY_PACKET_TYPE`

`Unknown discovery packet type {type}`

Thrown as `NethernetErrors.UnknownDiscoveryPacketType`, which extends `Error`.

A LAN discovery datagram has a type this server does not know, such as one from a newer
Minecraft.

## `NETHERNET_UNKNOWN_NETHERNET_SIGNAL_TYPE`

`Unknown NetherNet signal type {type}`

Thrown as `NethernetErrors.UnknownNethernetSignalType`, which extends `Error`.

A NetherNet signal has a type this server does not know, such as one from a newer Minecraft.

## `NETHERNET_UNSIGNABLE_DESCRIPTION`

`An SDP description without a fingerprint cannot be signed`

Thrown as `NethernetErrors.UnsignableDescription`, which extends `Error`.

A WebRTC description without a DTLS fingerprint was given an identity, which signs the
fingerprints. This is a bug in the caller.

## `NETHERNET_UNSUPPORTED_LAN_ADVERTISEMENT_VERSION`

`Unsupported LAN advertisement version {version}`

Thrown as `NethernetErrors.UnsupportedLanAdvertisementVersion`, which extends `Error`.

A LAN advertisement uses a layout version this client does not read, such as one from a newer
Minecraft.
<!-- /fact -->
