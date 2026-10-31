---
'@jsprismarine/chunkgen': patch
---

Start generation workers with `tsx` when the pipeline module is TypeScript source and the host carries no ES module loader for them to inherit. A server booted under vitest built its pool from a dev checkout's `.ts` pipeline, and every worker rejected its first task with `ERR_MODULE_NOT_FOUND` at the first extensionless import.
