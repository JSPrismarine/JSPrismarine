---
'@jsprismarine/kernel': patch
---

Subscribing a function with `once` and then with `on` no longer leaves it one-shot. The bus keeps one subscription per function and handle, and an `on` in either order now makes that subscription permanent, so the function is called on every event until `off` removes it. Before, `once` followed by `on` called the function for the next event only.
