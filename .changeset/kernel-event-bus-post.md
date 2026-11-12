---
'@jsprismarine/kernel': minor
---

The kernel's event bus gains `post`, `once`, `off`, `removeAll` and `hasListeners`. `post` calls each listener in subscription order without waiting for any of them. A listener that throws or rejects no longer stops the listeners after it or makes `emit` reject: the bus reports it, and a kernel logs it through its logger. Subscribing the same function to the same event twice through one handle subscribes it once. A listener may return any value. Code that implements `EventBus` itself has to add the new methods.
