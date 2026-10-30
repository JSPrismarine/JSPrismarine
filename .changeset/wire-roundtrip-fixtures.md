---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/client': patch
'@jsprismarine/protocol': patch
---

Hold declarative wire layouts to a real server's bytes.

The capture client gains `--wire`: one raw payload per packet kind the Bedrock Dedicated Server
sent during the login, written per protocol version as `src/jsp/v<protocol>/wire/<id>.bin` by the
`packets` pass. A new parity family, `protocol.wire-roundtrip`, decodes each captured payload
through its declarative layout and re-encodes it, and the bytes must come back exactly - the
layout our client decoded a real server's bytes through is the same frozen record our server
encodes with, so one round trip proves both directions and both roles. Coverage over the capture
is reported, not gated, and grows as packets gain definitions; the suite also holds every
captured id to having a name in the codec tables, which all 41 already do. The fixtures are a
committed snapshot: a re-capture may rewrite the recipe payload, whose net ids are per-session.
