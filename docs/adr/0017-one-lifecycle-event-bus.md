# One lifecycle event bus replaces the legacy emitter

Status: accepted

The change log ([ADR 0012](0012-the-change-log-is-the-history.md)) and the staged guards ([ADR 0013](0013-vetoable-actions-are-staged.md)) replace the simulation events. The lifecycle events that remain, such as connect, disconnect, spawn, command and recipe registration, and the raknet events, move to the kernel's scoped event bus. The legacy `EventEmitter`, its separate plugin event bus and the awaited `tick` event are deleted. A scheduled callback in the style of the Script API's `system.run` runs at a fixed point of a tick and never when it was scheduled. The Script API host design picks the point. Bedrock's typings say such a callback "will generally run the code at the end of the same tick where the event occurred", which the input step of the next tick would not match. Chat becomes a guarded action under ADR 0013.

The two buses order listeners differently. The legacy emitter calls every listener at once through `Promise.all`, and the kernel bus awaits them one at a time in subscription order. The kernel bus is typed, orders listeners by subscription, and detaches a module's listeners when that module stops, so it keeps a single ordering rule.
