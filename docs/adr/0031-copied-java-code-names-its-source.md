# Copied Java code names its source

Status: accepted

Much of the server's Java behavior is code someone read out of the pinned server jar and wrote again
in TypeScript, because Java keeps it in code rather than data: block rules, mob brains, fluid flow,
portals. Mojang ships the jar without obfuscation since 26.1, so the class, method and field names
are stable enough to point at. A copy that only cites Java in a comment goes stale without anyone
noticing. Tagging `block-behaviors` found three comments naming members 26.3 no longer has. So the
code that copies a Java member names it with a JSDoc tag, and the parity suite checks each tag
against the pinned jar.

## The tags

- `@javaSource Class.member` goes on the declaration that copies the member: a function, a method,
  or a constant whose value Java's code decides. The class is a simple name when one class in the
  jar has it, a binary name (`net/minecraft/...`) otherwise, and an overloaded method adds its
  descriptor.
- `@javaSee Class.member` goes on a comment that names a Java member without copying it, such as
  an interface member that describes what its host does, or a library call like
  `RandomSource.nextInt`.
- `@javaVerified vectors|read|extracted` sits beside `@javaSource` when something stronger than a
  re-read checks the copy: test vectors Java computed, a parity row that reads the bytecode, or a
  value generated from the jar.

A copy points at the member it copies, not at the comparison that tested it. The parity suite reads
Java to compare with it, so its own citations are neither kind and the checks skip it.

## What is checked

`packages/parity/goldens/java-sources.json` maps each `@javaSource` spelling to the member it
resolves to, and records a fingerprint of the member's bytecode for each Java release. The
`java.transcriptions` parity family fails when a tagged member is gone or its fingerprint changed,
and when a `@javaSee` member no longer resolves. `lint:java-sources` checks the tags against the
golden without the jar, and fails a JSDoc comment that cites ``Java's `Class.member` `` with
neither tag, past a per-file baseline that only shrinks.

The fingerprint hashes a listing of the member's instructions with constant pool references
resolved to names and branch targets numbered by instruction, so a recompile of the same source
keeps it. It includes the private methods and lambdas of the same class that the member reaches,
since those are part of what the copy follows. A static field set in the static initializer lists
the whole initializer, since a narrower slice can miss what decides the value. Calls into other
classes count by name only.

## Considered options

- **A runtime registry**, such as a `javaSource('...')` call at module load. It would let a test
  ask which members a module copies, but it costs an import in every file and cannot mark a
  constant without wrapping it. A tag costs nothing at run time and sits where the citations were.
- **A fingerprint that follows calls into other classes.** It would catch a change inside
  `Entity.move` for every copy that calls it, and it would flag nearly every copy on every
  release. Changes in callees no tag names are a report for the Java bring-up instead (#3704).
- **One golden per package.** It keeps a package's review in its own directory, but spreads a
  release's re-read list across a dozen files.

## Consequences

A Java release that changes a copied member fails the parity suite until someone reads the new
bytecode against the copy, fixes the copy if Java's behavior changed, and restamps the member with
`pnpm --filter @jsprismarine/bedrock-data run java:sources --update --reviewed <spelling>`. A
restamp without `--reviewed` is refused, so a bulk update cannot hide a change. That holds for the
first stamp of a new release too: a fingerprint is a change when no release the golden records
for the member has it. A new citation of Java in a JSDoc comment fails the lint until it carries
one of the two tags.

The [Java transcriptions plan](../plans/java-transcriptions.md) records the design and the
remaining slices.
