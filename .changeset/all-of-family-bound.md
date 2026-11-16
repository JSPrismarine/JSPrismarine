---
'@jsprismarine/entity-goals': patch
---

Fix target and avoid searches that offered no candidates when an `all_of` filter combined two family tests that share no name, such as `monster` and `blaze`. Each test bounds the search on its own, and the intersection of their names is empty.
