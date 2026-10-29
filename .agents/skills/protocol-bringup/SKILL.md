---
name: protocol-bringup
description: Bring up a new Bedrock protocol version end to end. Use when adding support for a new Minecraft Bedrock release or protocol number, or when the user says "bring up protocol <n>".
---

# Protocol bring-up

Bringing up protocol N means: pin Mojang's docs and the matching BDS, generate the schemas and
enums, derive the wire delta mechanically, implement it as a delta codec, and prove the result
against a real server of that version. The 2193 → 2225 bring-up is the worked example; its
decisions and measurements are in [docs/research/protocol-2225-delta.md](../../../docs/research/protocol-2225-delta.md)
and [docs/research/bedrock-data-pipeline.md](../../../docs/research/bedrock-data-pipeline.md).
Read both before starting.

Work the steps in order; each later step consumes the one before it. Commit each completed,
validated slice (commit-discipline skill) and add Changesets per [docs/versioning.md](../../../docs/versioning.md).

## 1. Pin the docs release

Find the [Mojang/bedrock-protocol-docs release](https://github.com/Mojang/bedrock-protocol-docs/releases)
for the Minecraft version that speaks protocol N. Download its `metadata.zip`, measure its sha256
(`shasum -a 256`), and confirm every schema inside declares `"x-protocol-version": N` — the
release tag's version string can lag or say `-beta`; `x-protocol-version` decides.

Add a `"<N>"` entry under `versions` in `packages/minecraft/datagen/manifest.json`, shaped like
the existing entries (the 2225 one is the newest model). If the release carries
`x-enum-binary-value` itself, its `values` points back at the same asset.

Done when: the manifest declares N with a measured hash, and the hash matches a fresh download.

## 2. Generate enums and schema snapshot

```sh
pnpm --filter @jsprismarine/minecraft run generate
```

Writes `packages/minecraft/datagen/snapshot/v<N>/enums.json` and `src/generated/v<N>/`.

Done when: generating twice is byte-identical, and nothing under the previous version's
`src/generated/v<old>/` or the unversioned re-exports changed. The previous version stays
`defaultProtocolVersion` until N is complete.

## 3. Mechanical ordinal diff

Derive the wire delta from two primary sources and keep them agreeing:

- Diff every schema JSON between the old and new `metadata.zip`, field by field, through each
  field's `x-ordinal-index`. A moved, inserted or removed ordinal is a layout change; a changed
  enum value row may be a docs correction, so cross-check it (the 2225 note's "enum value
  changed" caveat).
- Sum Mojang's [changelog](https://mojang.github.io/bedrock-protocol-docs/changelog/) sections
  between the two releases, and cross-check against gophertunnel's release for the same version.

Record the delta as a research note under `docs/research/` shaped like
`protocol-2225-delta.md`: new packet ids, layout changes with ordinals, enum changes, and which
of them are on the join path.

Done when: every changed type is listed with its source, and the two sources agree everywhere
they overlap.

## 4. Implement the delta codec

Implement each join-path layout change as a `Codec<N>` registration in `@jsprismarine/protocol`,
following the repository packet rules (root `AGENTS.md`): both wire directions together,
subclasses over copies (`StartGamePacket2225` is the pattern), round-trip tests per changed
packet, and a negative test that a reader at N cannot parse the old bytes where the layout moved.
Run `pnpm run lint:packets`; update the one-way baseline only with
`node scripts/check-packet-codecs.mts --update` after implementing both directions.

Done when: `Codec<N>` carries every join-path change from step 3's note, with round-trip
coverage, and the note's "verified but not implemented" section lists whatever was deliberately
deferred.

## 5. Pin the BDS and teach the client the version

- Add a `"<N>"` entry under `bds.versions` in `packages/bedrock-data/sources.json`:
  `minecraftVersion`, `serverVersion`, the `bin-linux` zip URL, Mojang's sha1 from
  [Bedrock-OSS/BDS-Versions](https://github.com/Bedrock-OSS/BDS-Versions), and the sha256 and
  size measured on download. Then `pnpm --filter @jsprismarine/bedrock-data run fetch:sources --protocol <N>`.
- Add N to the `PROTOCOLS` map in `packages/client/src/Client.ts` with its Minecraft version
  string and the `StartGamePacket` layout it reads. The client is a data-capture and bring-up
  client, so only the packets it decodes need versioning here.

Done when: the fetch verifies the hash, and `pnpm run bringup --protocol <N>` passes its pins
check.

## 6. Run the bring-up tool against real BDS

```sh
pnpm run build
pnpm run bringup --protocol <N>
```

`packages/bedrock-data/utils/bedrock-dump/bringup.ts` boots the pinned server (native on Linux
x86-64, containerized elsewhere — Docker must be running; on macOS registry access may need
`export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"`) and runs
`packages/client/tools/bringup-probe.mjs`, which walks the login and prints a pass/fail per
stage: network settings → login → resource packs → start game → spawn. On a failure it prints
the undecodable packet ids with the reader's offset and the last raw packets — fix that packet
(step 4) and re-run.

Done when: every stage reports PASS and the command exits 0. Reaching spawn validates our
decoders against the real server's bytes and our encoders by the server accepting every step.

## 7. Capture the version's data

```sh
pnpm --filter @jsprismarine/bedrock-data run dump:bedrock --pass packets --protocol <N>
```

Run it twice and compare: commit only files that reproduce byte-for-byte (the 2225 capture's
stability table in the pipeline note is the precedent — `crafting_data.bin` carries per-session
ids and never reproduces). Goldens land under `packages/bedrock-data/src/jsp/v<N>/`. Generate
recipes with `pnpm --filter @jsprismarine/minecraft run generate:recipes`; the `palette` pass is
blocked until its producer reproduces (pipeline note, section 10).

Done when: the stable goldens for N are committed and a re-capture is an empty diff.

## 8. Wire the per-version data

Give sessions at N their own numbers: the `ProtocolCodec` for N carries its `ProtocolItemData`
(the 2225 item-table slice in the delta note is the pattern), and
`pnpm --filter @jsprismarine/bedrock-data run generate` publishes the versioned tables.
Server-side membership questions keep reading the default version's canonical table.

Done when: a session at N is sent N's numbering and the default version's bytes are unchanged
(assert it, as `ItemRegistryPacket.test.ts` does for 2193).

## 9. Parity family

Extend `packages/parity` with a declared, tested family for each new data-driven compatibility
surface (the `registry.items-2225` family is the model). CI fails a declared family with no
test.

Done when: the family has a test against real fixtures and a dashboard row.
