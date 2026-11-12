---
'@jsprismarine/packs': patch
---

`readZip` bounds what an archive may expand to. Each entry must inflate to exactly the size its central directory declares, at most `MAX_ZIP_ENTRY_BYTES`, and a load may expand to at most `MAX_ZIP_TOTAL_BYTES` in all; both are defined in `packages/packs/src/zip.ts`. Both are checked before anything is allocated. Entries whose records overlap or run past the archive are refused, so a small archive can no longer name one compressed stream many times over. `readZip` takes an optional `{ maxEntryBytes, budget }`, and `createZipBudget` makes a budget that an `.mcaddon` shares with the `.mcpack` archives nested in it. `expandSource` takes that budget as an optional fourth argument.
