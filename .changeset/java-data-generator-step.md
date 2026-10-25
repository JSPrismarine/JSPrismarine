---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/mapping': patch
'@jsprismarine/items': patch
---

Add the Java data generator step the pipeline was missing. `pnpm --filter
@jsprismarine/bedrock-data run datagen:java` re-checks the fetched server jar's sha1, runs
Mojang's `net.minecraft.data.Main` against it, and writes the vanilla datapack to
`node_modules/.cache/jsprismarine/vanilla-datapack/<version>/` and the data reports to
`node_modules/.cache/jsprismarine/java-reports/<version>/generated/reports/`, the two
directories every Java-data reader already looks in. A re-run is a no-op unless `--force` is
passed.

Nothing produced those directories before, so the data-driven overworld generator failed on
every server start with a message naming `fetch:sources` and `dump:java`, neither of which
writes them. Those messages now name `datagen:java`, and so does the pack stack diagnostic for
a missing Java vanilla datapack.

The mapping and item table generators read `java -version` from stdout, which is empty
because the banner goes to stderr, so their own fallback run of the data generator always
threw "No JDK >= 25 found". They read `java --version` now.
