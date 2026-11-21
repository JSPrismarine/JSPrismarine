---
'@jsprismarine/errors': patch
---

Link the errors of `@jsprismarine/prismarine` and `@jsprismarine/protocol` to a page per catalog module in the error reference, such as `errors/prismarine/world`. A catalog names its module after a slash, as in `defineErrors('prismarine/world', { ... })`, and each class gives it as `module`. Codes are unchanged, and the site forwards old `errors/prismarine#<code>` links to the new pages.
