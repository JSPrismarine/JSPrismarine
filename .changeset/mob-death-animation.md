---
'@jsprismarine/prismarine': patch
---

Keep a dead mob in the world for Java's 20 ticks of death animation before removing it, as `LivingEntity.tickDeath` does. Its loot falls at once, its health reads 0, behavior pack scripts read it as valid until it leaves, `@e` selectors pass over it, and a mob saved mid-death loads back dying with its `deathTime`.
