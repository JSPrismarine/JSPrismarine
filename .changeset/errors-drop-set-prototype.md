---
'@jsprismarine/errors': patch
---

The error classes no longer call `Object.setPrototypeOf` in their constructors. That fixed `instanceof` for code compiled to ES5, and the package targets ESNext, where a subclass of `Error` already gets its own prototype.
