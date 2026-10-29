---
'@jsprismarine/bedrock-data': minor
---

Arrange the Java Edition world generation data as a prerequisite of `pnpm dev`, so a clean clone
needs nothing beyond `pnpm install && pnpm dev`.

The default overworld is built from Mojang's published world generation data, which `pnpm install`
did not fetch. Starting a fresh checkout therefore reached the first chunk and threw, naming two
commands to run by hand. The new `ensure:worldgen` script runs those two steps itself, and only
when the cache is missing something: on a complete cache it compares file names and exits in a
fraction of a second without touching the network, so an offline checkout with a warm cache still
starts.

It stays out of `prepare`, `start` and CI. The server jar is a 62 MB download that only somebody
starting a server needs, and builds and tests arrange their own data.

Failures that a script cannot fix now print one actionable line rather than a stack trace, naming
the override environment variable and the flat-world option for a machine that will not have a JDK.
The JDK is looked for before the jar is downloaded, so a machine without Java finds out
immediately.

`findJdkHome` also searches the `java` on `PATH`, having previously looked only at `JSP_JAVA_HOME`,
`JAVA_HOME` and macOS's `java_home`. A Linux install with a JDK on `PATH` but no `JAVA_HOME` set
was not finding it.
