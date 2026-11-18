---
'@jsprismarine/console': patch
---

The status bar no longer repeats TPS, players, tick time, memory and uptime while the side pane shows them. Its filters name what they do (`info and up`, `all sources`) and the focus hint reads `Esc to scroll` or `Esc to type`. The namespace column is 15 characters wide, so names such as `contentPayloads` fit, and a wrapped line hangs under its own indent, so the tail of a stack frame lines up under its `at`.
