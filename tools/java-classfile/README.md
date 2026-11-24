# @jsprismarine/java-classfile

Parses Java class files and fingerprints their methods, for the readers and checks that compare
against the pinned server jar. Nothing here loads or runs a class; the jar is read as data.

- `classFile` parses a class file: its constant pool, fields, methods and their code.
- `instructions` decodes a method's code into instructions with resolved operands.
- `fingerprint` lists a Java method or field in a normalized form and hashes the listing.

The Java transcriptions plan ([docs/plans/java-transcriptions.md](../../docs/plans/java-transcriptions.md))
explains the fingerprint and the checks built on it.

## Commands

```bash
pnpm --filter @jsprismarine/java-classfile run test
```

The tests read class files compiled from `fixtures/*/Sponge.java`. After changing a fixture's
source, compile it again with a JDK 25 or newer:

```bash
javac --release 25 -g -d fixtures/v1 fixtures/v1/Sponge.java
```
