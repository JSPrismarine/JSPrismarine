# Java transcriptions

Much of the server's Java behavior is code a maintainer read out of the pinned server jar and wrote
again in TypeScript: the entity brains, block growth, the sponge's search, the explosion rays, the
chunk blender. This plan gives each of those transcriptions a declared link to the Java method or
field it copies, records a fingerprint of that method's bytecode, and checks the fingerprint
against the pinned jar. When a Java release changes a method, the check names every transcription
that copies it, with the bytecode diff, instead of leaving a comment that no longer says what Java
does.

Written 2026-11-25 against Java 26.3 as the default release and 26.4 as the preview.

## Where this starts

Mojang ships the server jar without obfuscation since 26.1
([java-code-only-behavior.md](../research/java-code-only-behavior.md)), so class, method and field
names are stable enough to cite. The repository uses Java code in four ways today, with very
different upgrade costs.

| Kind | Example | What happens on a new release |
| --- | --- | --- |
| Extracted | `dump:java-goals` writes `src/jsp/java/<R>/entity_goals.json` from `registerGoals` bytecode | Regenerate. The diff is the delta. |
| Read at test time | `packages/parity/src/javaEntityClasses.ts` reads `Mob.canBeLeashed` and the parity row compares | The row fails when Java changes the rule. |
| Vectors | The worldgen vectors Java computes and the tests compare against | Regenerate the vectors; tests fail where the port differs. |
| Transcribed | `SpongeBlock.removeWaterBreadthFirstSearch` in `block-behaviors/src/families/containers.ts` | Nothing. The comment stays true or silently goes stale. |

The first three already notice a release change. The fourth is most of the code. On 2026-11-25,
`git grep` finds 1138 source comments of the form ``Java's `Class.member` `` across 11 packages:
510 in `prismarine`, 229 in `entity-brains`, 137 in `entity-goals`, 86 in `features`, 61 in
`block-behaviors` and fewer elsewhere. Constants are often typed in by hand with "read out of the
pinned 26.3 server jar" beside them (`entity-brains/src/behavior/common.ts`,
`block-behaviors/src/rules/growth.ts`). Section 9 of
[java-datapack-version-support.md](java-datapack-version-support.md) already names the gap: a
delta note should list the classes whose bytecode changed so the maintainer knows which
transcriptions to re-read. Nothing produces that list yet, and nothing maps a changed class back to
the code that copies it.

Two class-file readers exist. `packages/bedrock-data/utils/java-goals/classFile.ts` serves the goal
dump, and `packages/parity/src/javaClassFile.ts` (655 lines) serves the parity rows. Both parse
constant pools and decode instructions.

## The abstraction

A **Java source** is one Java method or field that TypeScript code copies. Code declares it with a
JSDoc tag on the declaration that does the copying:

```ts
/**
 * Water within six steps, up to 65 blocks.
 * @javaSource SpongeBlock.removeWaterBreadthFirstSearch
 */
const removeWater = (...) => { ... };

/** @javaSource Sniffer.SNIFFER_BABY_START_AGE */
export const BABY_START_AGE = -48000;
```

A JSDoc tag rather than a runtime wrapper, for these reasons:

- It costs nothing at run time and works on a constant, a function, a class or a single method.
- The code already cites Java in JSDoc, so the tag sits where the citation is, and a codemod can
  turn most citations into tags (slice 3).
- A tag can be read without importing the module, so the check runs without loading the server.

The tag takes a simple class name when exactly one class in the jar has it, and a binary name
(`net/minecraft/world/level/block/SpongeBlock.removeWaterBreadthFirstSearch`) otherwise. An
overloaded method takes its descriptor: `Mob.setTarget(Lnet/minecraft/world/entity/LivingEntity;)V`.
The checker resolves the short form and fails on an ambiguous one. A nested class uses `$`:
`Fox$FoxPanicGoal.canUse`.

An optional second tag says how strongly the copy is checked, when it is more than a fingerprint:

```ts
/**
 * @javaSource Blender.blendOffsetAndFactor
 * @javaVerified vectors vectors/blending.json
 */
```

The kinds are `vectors` (a test compares against outputs Java computed), `read` (a parity row reads
the bytecode itself) and `extracted` (the value is generated from the jar). A tag without
`@javaVerified` is a plain transcription. The kind does not change the check; the dashboard counts
by kind, so the share of plain transcriptions is visible and can shrink.

## The fingerprint

The fingerprint is a SHA-256 of a normalized listing of the source, computed from the class file.
Normalization keeps what the code does and drops what recompiling the same source can change:

- Instructions with every constant-pool reference resolved to its symbol: the member and
  descriptor an `invoke*` or field instruction names, the value an `ldc` pushes, the class a `new`
  or `checkcast` names.
- Branch targets relabeled as instruction indices rather than byte offsets.
- Synthetic lambdas the method references through `invokedynamic`, inlined after the method and
  renamed by order of first use, since `javac` numbers `lambda$name$N` across the whole class.
- Private methods of the same class the method calls, inlined the same way, transitively. A
  private helper is part of the method in every way that matters to a copy of it.
- Exception tables, with their ranges relabeled.
- Not the `LineNumberTable`, `LocalVariableTable`, `StackMapTable` or constant-pool order.

A field with a `ConstantValue` attribute fingerprints its value. A static field set in `<clinit>`
fingerprints the instructions between the previous `putstatic` and its own, which is the
expression that computes it, such as `UniformInt.of(5, 20)`.

Calls to other classes count by name only. A change inside `Entity.move` does not flag every method
that calls it. The bring-up report lists those separately (section "On a new release").

## Where the fingerprints live

`packages/parity/goldens/java-sources.json` maps each tag spelling to the member it resolves to,
and records each member once, by its resolved binary name, with a fingerprint per release:

```json
{
    "names": {
        "SpongeBlock.removeWaterBreadthFirstSearch": "net/minecraft/world/level/block/SpongeBlock.removeWaterBreadthFirstSearch(Lnet/minecraft/world/level/Level;Lnet/minecraft/core/BlockPos;)Z"
    },
    "sources": {
        "net/minecraft/world/level/block/SpongeBlock.removeWaterBreadthFirstSearch(Lnet/minecraft/world/level/Level;Lnet/minecraft/core/BlockPos;)Z": {
            "26.3": "sha256:06af..."
        }
    }
}
```

The `names` map is what lets the lint check run without the jar: a tag whose spelling is not in it
has never been stamped. A source holds a fingerprint for the default release and, once slice 4
lands, the preview. The TypeScript sites that cite it are not recorded; the checks find them from
the tags each run, so moving code needs no golden update.

## Checks

**`pnpm run lint:java-sources`** runs in `lint:custom` and needs no jar. It reads the JSDoc
comments of every `packages/*/src/**/*.ts` file outside tests, generated output and the parity
suite, which reads Java code to compare with it rather than copying it, and fails when
a tag is malformed, when a tag's spelling has no entry in the golden, or when a golden entry has no
tag left. It also counts prose citations (``Java's `X.y` ``) in JSDoc comments that carry no
`@javaSource`, per file, against `scripts/java-sources-baseline.json`. The count may fall and never
rise, the way `lint:landmines` works, and `--update-baseline` lowers it.

**The `java.transcriptions` parity family** reads the pinned jar, which the CI unit shards already
restore from cache. One tracker row per tag spelling:

- It passes when the spelling resolves to the member the golden names and its fingerprint for the
  default release matches the golden.
- It fails when the fingerprint differs, the spelling resolves elsewhere, or the member is gone.
  The message names the TypeScript sites and both fingerprints.
- A preview mismatch is reported as `deferred` with the preview's id, not a failure, until the
  preview becomes the default (slice 4). This is the existing behavior-gaps mechanism, so the
  dashboard shows it without new UI.
- Without the jar in the cache the row is "not measured", as other jar-reading rows are.

`pnpm --filter @jsprismarine/bedrock-data run java:sources --update` stamps fingerprints for the
default release, or
for `--java <R>`, after a maintainer has re-read the changed sources. It never restamps a source
whose fingerprint changed without `--reviewed <spelling>` for each one, so a bulk update cannot hide
a change. `--list <spelling>` prints the listing the fingerprint hashes; listing a source under two
releases' `--java` and diffing the output shows what changed.

## On a new release

The [java-bringup skill](../../.agents/skills/java-bringup/SKILL.md) gains a step after "Derived
data". `pnpm run bringup:java --java <R>` adds a `transcriptions` stage that fingerprints every
source against R and writes a "Transcriptions to re-read" section into
`docs/research/java-<R>-delta.md`:

- Each changed source, the TypeScript sites that tag it, and the normalized bytecode diff. The old
  listing comes from the previous release's jar, which is still pinned during a bring-up, so the
  golden holds only hashes.
- Each removed or renamed source. A rename shows as a removal plus the closest new member by
  descriptor and instruction similarity, as a hint.
- Each changed method that a changed or unchanged source calls in another class and that no tag
  names. These are advisory. A maintainer reads them and either tags them or notes why they do not
  matter to the copy.

The maintainer then re-reads each changed source. Either the TypeScript already matches, and the
source is stamped with `--reviewed`, or the behavior changed. A changed behavior gets a `SINCE_`
gate when both releases must keep working (the preview case), or a plain edit when only the new
default matters, and its own regression test either way.

## Slices

1. **One class-file reader.** Done. `tools/java-classfile` holds the parser, the instruction
   decoder, the listing and the fingerprint, tested over `fixtures/v1` and `fixtures/v2`, two
   compilations of one small class that differ in a private helper and an added lambda.
   `bedrock-data`'s goal dump and `parity` read class files through it, and the goal dump's capture
   test still matches the committed `entity_goals.json`.
2. **Tag, golden and checks.** Done. `@javaSource`, `@javaSee` and `@javaVerified` are in the API docs
   build's block tags, `scripts/check-java-sources.mts` lints the tags without the jar,
   `bedrock-data`'s `java:sources` stamps the golden and prints listings, and the
   `java.transcriptions` family checks the golden against the jar. `block-behaviors` carries 32
   tags on 31 members. Tagging it found three citations that no longer named a 26.3 member:
   `FarmBlock` is `FarmlandBlock`, `SpreadingSnowyBlock.canBeGrass` is `canStayAlive`, and pointed
   dripstone's `canSurvive` moved up to `SpeleothemBlock`. Its four citations that name a member
   without copying it carry `@javaSee`, so its baseline is empty. The experience orb code that
   landed in `prismarine` while this slice was open carries five more `@javaSource` tags. A
   hand-edited golden hash fails the row, naming the TypeScript site and both fingerprints.
3. **Convert the citations** ([#3703](https://github.com/JSPrismarine/JSPrismarine/issues/3703)). A codemod reads each ``Java's `X.y` `` citation in a JSDoc comment,
   resolves it in the jar, and adds the tag when it resolves to one member. Run it a package
   at a time, review the ambiguous and unresolved ones by hand, and lower the baseline after each.
   Constants typed in by hand with a "read from the jar" comment are tagged on the constant. A
   citation that names a member without copying it, such as an interface member that describes
   what its host does, gets `@javaSee`. Done when the baseline is empty for `entity-brains`,
   `entity-goals` and `features`. `prismarine` follows; it is the largest and does not block
   slice 4.
4. **Bring-up stage** ([#3704](https://github.com/JSPrismarine/JSPrismarine/issues/3704)). Add the `transcriptions` stage, the delta-note section with listing diffs,
   and the preview fingerprints, and update the java-bringup skill. Exercise it on the
   pinned 26.4 preview against 26.3. Done when the 26.4 delta note lists every changed tagged source
   and the parity rows for the preview show as `deferred`.
5. **Promote heavy copies** ([#3705](https://github.com/JSPrismarine/JSPrismarine/issues/3705)). With counts by kind on the dashboard, open an issue for each
   transcription large enough to deserve vectors or extraction instead of a re-read, starting with
   the ones the 26.4 bring-up flagged.

## Decisions

All four were accepted as recommended on 2026-11-25.

1. **A JSDoc tag, not a runtime registry.** A `javaSource('...')` call registered at module load
   would let tests ask which sources a module copies, but costs an import in every file and does
   not attach to a constant without wrapping it.
2. **The fingerprint reaches same-class code only.** Inlining private same-class callees and
   lambdas catches most real changes without flagging every caller of `Entity.move`. Changed
   callees in other classes go to the advisory list.
3. **One golden in `packages/parity/goldens/`**, beside `behavior-gaps.json` and the family that
   reads it, rather than one per package, which would spread the bring-up report over a dozen
   files.
4. **An ADR after slice 2.** Done:
   [ADR 0031](../adr/0031-copied-java-code-names-its-source.md) records the tags and the checks,
   with `@javaSee` for a comment that names a Java member without copying it, which came out of
   tagging `block-behaviors`.

## Risks

- A `javac` upgrade between releases can change code generation for unchanged source, for example
  string concatenation or switch lowering, and flag many sources at once. The diff shows a
  code-shape change, and the review is mechanical, but it is a large one-off review. The
  normalization can absorb a known pattern once it has been seen.
- A source can be stamped as reviewed without being read. `--reviewed` per source and the diff in
  the delta note make that a deliberate act, which is as far as tooling can go.
- A copy can drift from Java inside a callee no tag names. The advisory list covers callees of
  tagged sources; code that copies Java with no tag at all is covered only by the citation baseline,
  which counts prose citations and cannot see uncited code.
