---
'@jsprismarine/prismarine': patch
---

Route block property reads through the Java-sourced per-state table in `@jsprismarine/mapping`:
`Block`'s hardness, break time, blast resistance, light emission, light filter and flammability now
come from the Java 26.3 dump keyed by Bedrock state name, covering every palette block rather than
the registered classes, and explosions decide what breaks from real blast resistance instead of a
hand-kept name set. Blocks without a Java source keep their class values. Unbreakable blocks
(hardness `-1`) now report an infinite break time.
