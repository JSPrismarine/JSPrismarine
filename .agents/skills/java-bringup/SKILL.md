---
name: java-bringup
description: Bring up a new Java Edition release or snapshot for the vanilla datapack and reports. Use when pinning a new Java release, tracking a Java snapshot as the preview, or when the user says "bring up Java <release>".
---

# Java bring-up

Bringing up Java release R means: pin its server jar, generate its datapack and reports, derive
the delta from the previous release mechanically, implement the delta as gates, regenerate every
derived table, and prove the result through the loaders and the parity suite. The design and its
reasons are in [docs/plans/java-datapack-version-support.md](../../../docs/plans/java-datapack-version-support.md);
read sections 3 and 4 before starting. The Bedrock counterpart is the protocol-bringup skill.

**A preview** (a snapshot or pre-release, pinned so the server is ready when the release ships)
takes the same steps with these differences:

- Mark its `sources.json` entry `"preview": true`. The manifest allows one preview, and refuses a
  preview older than `defaultVersion`.
- Keep one preview only. A new preview replaces the previous one: delete the old entry, its cache
  directories, its delta note and its `datapack.<old>` parity family.
- Re-pin the preview only when the data pack format major changes or Mojang publishes a
  pre-release. A minor-only format bump is backward compatible by Mojang's definition and needs
  no gate: attach its diff to the tracking issue and keep the current pin.
- Step 9 runs only when R is a release.

Work the steps in order; each later step consumes the one before it. Commit each completed,
validated slice (commit-discipline skill) and add Changesets per [docs/guide/versioning.md](../../../docs/guide/versioning.md).

## 1. Pin

Find R in Mojang's piston-meta version manifest and open its version JSON. Copy the server
download's `url` and `sha1`, download it, and measure its sha256 (`shasum -a 256`) and size. Add
an entry under `javaServer.versions` in `packages/bedrock-data/sources.json`, shaped like the
existing ones; a snapshot also gets `"preview": true`. A release that is not yet the default gets
`"bedrockProtocol": <n>`, the pinned `bds` protocol of the same game drop, which its mapping and
item tables map onto; the manifest refuses the entry without it. Then:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources --java <R>
```

Done when: the fetch verifies the hash, and `pnpm run bringup:java --java <R> --quick` passes its
pins stage.

## 2. Generate

```sh
pnpm --filter @jsprismarine/bedrock-data run datagen:java --java <R>
pnpm run bringup:java --java <R>
```

`datagen:java` writes `vanilla-datapack/<R>/` and `java-reports/<R>/generated/reports/` under
`node_modules/.cache/jsprismarine/`. The bring-up tool's generate and reproducibility stages
check the witness files and regenerate into scratch space to compare. The later stages fail
until step 4 is done; read only the first three here.

Done when: the reproducibility stage passes (every file byte-identical across two runs), and
`vanilla-datapack/<R>/version.json` names R with the data pack format and data version Mojang
lists for it.

## 3. Mechanical diff

```sh
pnpm --filter @jsprismarine/bedrock-data run java:diff <old> <R> --out docs/research/java-<R>-delta.md
```

`<old>` is the release R is measured against: `defaultVersion` for a preview. The output is the
skeleton of the delta note. Turn it into `docs/research/java-<R>-delta.md`, shaped like
[protocol-2225-delta.md](../../../docs/research/protocol-2225-delta.md), with these sections:

- **Which release this is**: the release id, data pack format, data version and JDK from both
  `version.json` records, and where the pin came from.
- **How the delta was derived**: the `java:diff` command and the changelog it was checked against.
- **Renamed and moved directories**: each rename under `data/minecraft/`, with the registry that
  reads it.
- **Grammar changes**: each added or removed JSON key per registry directory, read against real
  files to say whether it is a rename, a new optional field or a removal, and which package owns
  the grammar.
- **New registry entries**: new types in `feature_type`, `loot_function_type` and the other
  registries the derived-list tests check, and which handler each needs.
- **Blocks, items and entity types**: the new ones, with block state counts, and whether each has
  a Bedrock counterpart.
- **Verified but not implemented**: what step 4 leaves for later, with an issue each.
- **Sources**: Mojang's changelog for R and every other page relied on.

Done when: every changed directory, key and registry entry in the `java:diff` output is listed in
the note with its source, and the note agrees with Mojang's changelog everywhere they overlap.

## 4. Gates

For each grammar change in the note, add one `SINCE_` constant in the package that owns the
grammar, named for the change and compared against the target's data pack format major (plan
section 3, "Gates in the parsers"). Give each change a two-sided test: the old spelling parses
under the old target and the new spelling under the new one. Handle each new type the
`unhandledJavaTypes.test.ts` suites name, or add it to the package's reviewed `unhandled` list.

```sh
pnpm run bringup:java --java <R> --quick
```

Done when: the strict load and corpus stages pass, so R's vanilla datapack loads with no error
diagnostic and the corpus suites in `loot`, `recipes`, `predicates`, `advancements`, `features`
and `structures` pass against R.

## 5. Derived data

```sh
pnpm --filter @jsprismarine/bedrock-data run dump:java --java <R>
pnpm --filter @jsprismarine/bedrock-data run dump:java-goals --java <R>
pnpm --filter @jsprismarine/mapping run generate:tables --java <R>
pnpm --filter @jsprismarine/mapping run generate:block-properties --java <R>
pnpm --filter @jsprismarine/mapping run generate:block-support --java <R>
pnpm --filter @jsprismarine/mapping run generate:block-states --java <R>
pnpm --filter @jsprismarine/items run generate:item-types --java <R>
pnpm --filter @jsprismarine/bedrock-data run dump:java-protocol --java <R>
```

`dump:java-protocol` writes everything a Java client connecting with R needs under
`packages/protocol/src/java/versions/<R>/`: the protocol number, packet ids, block states, static
registries, English and, by running R's server, its configuration phase. It then regenerates
`javaReleases.ts` and `newest.ts` from every release directory, leaving snapshots out, so a
release becomes the one the server speaks without hand edits. It needs a JDK the jar runs on.
Code that serves Java clients imports `@jsprismarine/protocol/java/versions/newest`, never a
release's own directory.

Regenerate the worldgen vectors for R as well. A new Java identifier with no Bedrock counterpart
goes into the reviewed loss list before the generator will emit.

Done when: running each generator a second time leaves an empty diff.

## 6. Transcriptions

```sh
pnpm --filter @jsprismarine/bedrock-data run java:transcriptions --java <R>
pnpm --filter @jsprismarine/bedrock-data run java:sources --update --java <R>
PARITY_UPDATE_BEHAVIOR_GAPS=1 pnpm exec vitest run packages/parity/src/java.transcriptions.test.ts
```

The first command fingerprints every member a `@javaSource` tag names in the default release's
jar and in R's, and writes a "Transcriptions to re-read" section into
`docs/research/java-<R>-delta.md`: each changed member with the diff of its listing and the code
that tags it, each removed or renamed member with the closest member R has, and the methods of
other classes that tagged members call whose bytecode changed. `bringup:java` runs the same thing
as its transcriptions stage. The second stamps R's fingerprint for every member R did not change
and lists the ones it did. The third records each changed member as a `deferred` row with R's id
in `packages/parity/goldens/behavior-gaps.json`.

For each changed member, read the diff against the code that tags it. When the copy still
matches, or once it has a `SINCE_` gate for R, restamp with
`java:sources --update --java <R> --reviewed <spelling>` and run the third command again to drop
its row. Read the advisory callees and tag the ones a copy depends on.

Done when: every changed member is either restamped or has a deferred row, and each removed or
renamed tag is fixed or has an issue.

## 7. Prove it

```sh
pnpm run bringup:java --java <R>
```

The nine stages are pins, generate, reproducibility, strict load, corpus, noise chunks, server
boot, command tree and transcriptions. The noise chunks stage generates chunk 0, 0 of the Overworld, the Nether
and the End from R's data. The server boot starts a flat-world server through the client-e2e
harness with `content-java-version` set to R, and the command tree stage checks that it built its
vanilla command tree. A failed stage prints its first 20
diagnostics or differing files; fix those and re-run.

Done when: every stage reports PASS and the command exits 0.

## 8. Parity family

Declare a family `datapack.<R>` in `packages/parity/src/families.ts` and add a test that loads
R's vanilla datapack through the public loader and asserts registry counts and corpus results
against R's own reports. The default release keeps its existing families; the preview gets its
own row, so the dashboard shows both. CI fails a declared family with no test.

Each Java packet definition names its vanilla codec with `@javaSource`, so with R's jar cached
the `java.transcriptions` family lists each packet whose layout R changed. Read each against its
definition and change the layout before R becomes the newest release.

`dump:java-protocol` makes R the newest release when R is not a snapshot: it rewrites
`NEWEST_JAVA_RELEASE` in `javaReleases.ts` and the imports of `newest.ts` to R's directory. Only
after that, run `pnpm --filter @jsprismarine/parity exec vitest run src/protocol.java-client.test.ts`,
which measures whatever release `NEWEST_JAVA_RELEASE` names. Its first test lists each packet R
added that no behavior claims, and each claimed packet R dropped:

- For a new packet, add it to the `needs` of the behavior it serves in that file's `BEHAVIORS`,
  or to a new behavior.
- For a dropped packet, remove it from the `needs` or `equivalents` that name it, and add the
  packet R replaced it with, if any, to the same behavior. A recorded gap cannot stand in for a
  stale claim.

Then record the rows the server now lacks with `PARITY_UPDATE_BEHAVIOR_GAPS=1` and point each new
gap at its area's issue.

Done when: the family's test passes against R's real data and the dashboard shows its row, and
`protocol.java-client` passes.

## 9. Flip the default

Only when R is a release. Set `javaServer.defaultVersion` to R and remove R's `bedrockProtocol`,
which the default derives. Delete the preview entry and its cache directories, and the previous
default's entry unless it stays pinned with a `bedrockProtocol` of its own. Then regenerate the
checked-in re-exports under `packages/bedrock-data/src/jsp/java/`, which name the default release:

```sh
pnpm --filter @jsprismarine/bedrock-data run generate
```

Run `pnpm run docs:facts`, update `blending.json` and the guide pages that name the release the
server runs. Every `java.transcriptions` row of R in `behavior-gaps.json` has to be read and
restamped before the flip, since the family then checks R's fingerprints and fails on a change.

Done when: `pnpm run test` passes with the old release's directories gone, and a search for the
old release id outside dated notes finds only gates named for a change.
