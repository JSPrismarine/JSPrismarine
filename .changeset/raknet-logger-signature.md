---
'@jsprismarine/raknet': minor
---

The `Logger` type now declares each method as `(...message: string[]) => void` instead of `Function`. Socket bind, send, buffer and worker failures now log a message with the error text and keep the context tag as the second argument. Before, they passed the `Error` itself, which the string-joining logger printed without a stack and with the tag run into the message.
