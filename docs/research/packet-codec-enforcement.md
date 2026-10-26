# Packet codec enforcement

Research note, 2026-10-26. Question: how to require new and edited packet definitions to support both encoding and decoding while legacy gaps are migrated.

## What the repository already enforces

- `packages/protocol` packet classes extend [`NetworkPacket<T>`](../../packages/protocol/src/NetworkPacket.ts), whose `serializePayload` and `deserializePayload` methods are abstract. TypeScript rejects a concrete subclass that omits either method. This already covers new and edited protocol packets at typecheck time. [TypeScript's abstract-member contract](https://www.typescriptlang.org/docs/handbook/2/classes.html#abstract-classes-and-members) documents the same enforcement mechanism.
- Most server packet classes extend [`DataPacket`](../../packages/prismarine/src/network/packet/DataPacket.ts), which gives `decodePayload` and `encodePayload` empty implementations. A subclass may therefore inherit a no-op in either direction and still typecheck. A source inventory found 170 packet classes. Sixteen payload-bearing classes are one-way; one other class has no payload fields or hooks and uses the empty-payload behavior. RakNet's [`Packet`](../../packages/raknet/src/protocol/Packet.ts) has the same no-op default design. Several RakNet classes override top-level `encode` or inherit behavior through `OfflinePacket`, so a check must account for method inheritance and overrides.
- The JSDoc check [`scripts/check-jsdoc.mts`](../../scripts/check-jsdoc.mts) compares findings to a symbol-keyed baseline. It rejects new missing-doc findings, but it does not inspect changed paths; an existing baselined finding remains allowed when its source file changes.

## Enforcement options

| Approach | Strength | Cost or limit |
| --- | --- | --- |
| Abstract codec methods on the packet base | Compile-time and unconditional; catches new classes and edits without baseline or Git state. | Making `DataPacket` or RakNet's hooks abstract immediately requires every existing concrete subclass to implement both hooks, including explicit no-ops for valid empty payloads and changes to abstract intermediate classes. |
| AST check with source fingerprints for legacy gaps | Incremental: new gaps fail, and a legacy packet fails as soon as its source changes, even after the change is committed. Reuses the repo's TypeScript-API check pattern without relying on Git history. | The baseline stores one SHA-256 per incomplete source file. The AST check proves that both hooks exist, not that they encode matching layouts. TypeScript's Compiler API supports source-file AST inspection, but the current TypeScript wiki cautions that its examples describe TypeScript 6 and earlier, while this repo uses TypeScript 7. |
| Encode/decode round-trip tests | Checks observable wire behavior and catches mismatched layouts. | By itself it does not require every packet to have such a test; fixtures and asymmetric protocol details can also make a simple round trip incomplete. Keep it as behavioral coverage alongside a compile-time or static contract. |

The TypeScript Compiler API's [program and source-file model](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) is the primary-source reference for the AST option. The repository already uses `tsc-ts/api` in its JSDoc checker, avoiding a second parser dependency.

## Recommendation

Keep `NetworkPacket<T>`'s abstract pair as the contract for protocol packets. Use a dedicated AST checker for Prismarine and RakNet packet payloads. It fingerprints the existing one-way packet files, so any source edit removes the exemption; its update command only removes entries after those packets gain both directions. Payload-free packet classes may inherit the base's empty payload methods. Require a round-trip test when adding a packet or changing its wire layout, since method-presence checks cannot establish wire correctness.

## Sources

- [`NetworkPacket.ts`](../../packages/protocol/src/NetworkPacket.ts) — protocol codec hooks are abstract.
- [`DataPacket.ts`](../../packages/prismarine/src/network/packet/DataPacket.ts) — server packet codec hooks default to no-ops.
- [`Packet.ts`](../../packages/raknet/src/protocol/Packet.ts) — RakNet codec hooks default to no-ops; top-level encode/decode call them.
- [`check-packet-codecs.mts`](../../scripts/check-packet-codecs.mts) — AST check and source-fingerprinted legacy baseline.
- [`check-jsdoc.mts`](../../scripts/check-jsdoc.mts) — current AST check and baseline behavior.
- [TypeScript Handbook: abstract classes and members](https://www.typescriptlang.org/docs/handbook/2/classes.html#abstract-classes-and-members) — compile-time enforcement for missing abstract members.
- [TypeScript Wiki: Using the Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) — AST and type-checker APIs; its current notice says examples cover TypeScript 6 and earlier.
