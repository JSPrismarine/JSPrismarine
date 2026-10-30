# Describe a packet's wire layout as data, once, in the protocol package

Status: accepted

A packet whose layout changed at a protocol version is today a sibling class:
`AnimatePacket2225 extends AnimatePacket`, overriding `encodePayload`/`decodePayload`, substituted
per session by `prepareOutbound` with an `Object.assign` copy. Eight such classes exist at one
version delta, their lookup is keyed by class identity (which a bundler rewrites — the compiled
executable shipped a renamed `DeathInfoPacket2`), and the same packets exist a second time in
`packages/protocol` for the client. We replace the sibling-class mechanism: one class per packet,
with the version differences expressed as data the encoder walks.

## What we build

**A field vocabulary** (`packages/protocol/src/wire/fieldTypes.ts`). A wire type is a frozen
`{ write(stream, value), read(stream) }` pair over `@jsprismarine/binaryutils`'s `BinaryStream`,
which both stacks' packets already extend, so one definition drives prismarine's `DataPacket` and
protocol's `NetworkPacket` alike. Primitives (`uint8`, `varuint32`, `varuint64`, `varint64`,
`lf32`, `bool`, `string`, …), combinators (`optional(T)` as presence byte + value, `list(T)` as
varuint count + items), and a bridge wrapping an existing `NetworkStructure` class, which is the
escape hatch: a packet whose body resists flat description (`ItemStackRequest`, `CraftingData`)
keeps its hand-written reader and writer as one named wire type, referenced from the field list,
instead of keeping a hand-written packet class.

**Version gates in one file** (`packages/protocol/src/wire/wireGates.ts`). A gate is a named
predicate over a protocol number — `since(2225)`, `between(a, b)` — and every version fork in the
wire format lives in this file, so one grep answers "where does the protocol branch". Gates appear
only in field lists; no encoder tests a version.

**Packet definitions** (`definePacket`). One ordered field list per packet:

```ts
const animate = definePacket('AnimatePacket', {
    action: t.uint8,
    runtimeEntityId: t.varuint64,
    data: t.lf32,
    swingSource: t.optional(t.string),
    hand: t.gated(SINCE_2225, t.uint8, HandSlot.MAINHAND)
});
```

The payload *type* is derived from the list (`PayloadOf<typeof animate>`), so the field list is the
single source for the wire order, both wire directions, and the TypeScript shape. A packet whose
layout never changed carries no gate and never mentions a version.

**A frozen `WireLayout` per codec** (`WireLayout.ts`). Registering a codec resolves each
definition against its protocol number once: gates evaluate to included or excluded, the result is
a frozen flat field array, and a gate-free definition resolves to the same shared frozen array at
every version. Encoding walks the layout; decoding walks it in the same order. `prepareOutbound`
collapses to stamping the session's protocol on the packet — no clone, no class substitution, and
no chain at any number of versions, because a layout is a resolved record, not a transform.

## What this replaces

- The `*2225` sibling classes and `packetOverrides()` substitution maps.
- Class identity as a lookup key anywhere on the wire path.
- The duplicated packet bodies across `packages/prismarine` and `packages/protocol`: definitions
  live in the protocol package only, and prismarine consumes them.

## How it is checked

Both directions come from one list by construction, so the packet-codec tracker stops checking
that a class implements two methods and starts checking that every wire id a codec exposes has a
definition and that every definition round-trips. The stronger check is against the real engine:
the capture pipeline already records packet bodies from a live Bedrock Dedicated Server, and a
layout is verified by `encode(decode(bytes)) === bytes` over those captures — when our client
decodes a real server's bytes through a layout, the same layout is what our server encodes with,
so one proof covers both roles.

## Migration

Foundation and a pilot first (`Animate`, byte-compatible with the classes it replaces at 2193 and
2225, proven by encoding both against the old classes), then the sibling classes, then the
remaining packets in mechanical waves, protocol-package-first so the duplication shrinks as the
waves land. The old class API stays as a thin adapter over the walker until the last consumer
moves.
