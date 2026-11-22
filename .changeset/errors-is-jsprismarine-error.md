---
'@jsprismarine/errors': minor
---

Add `isJSPrismarineError(value)` to `@jsprismarine/errors/JSPrismarineError`. It returns true for every catalog error, including one that another installed copy of the package built, and narrows the value to an error with `code`, `docs` and `params`.
