---
"@jsprismarine/prismarine": patch
---

Refactor `Server` to extend our custom `EventEmitter`.
So, instead of using the `getEventManager()` function to get something emittable;
you now just do a simple `server.emit('id', event);`.
