---
'@jsprismarine/structures': minor
'@jsprismarine/errors': patch
---

Read `.mcstructure` files in `format_version` 2, which keep one block layer as an int array rather than a list, as The Sift's structures do. `MCSTRUCTURE_FORMAT_VERSION` is replaced by `MCSTRUCTURE_FORMAT_VERSIONS`, the versions `readMcStructure` takes.
