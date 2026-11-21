---
'@jsprismarine/script-host': patch
---

A pack that depends on an alpha version of a script module, such as `@minecraft/server` `3.0.0-alpha` or the word `alpha`, is refused with a message that says why: no published metadata describes the alpha APIs, so the server has nothing to serve. It used to get the invalid-version message, which reads as a typo. `resolveDependency` reports it as the new `alpha` reason.
