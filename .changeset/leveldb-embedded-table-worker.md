---
'@jsprismarine/leveldb': patch
---

An executable compiled with Bun's `--aot` saves its world again. Its modules keep their `.ts` paths, so the table builder worker asked for the `tsx` loader, which an executable does not carry. The embedded worker now starts without it.
