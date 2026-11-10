---
"@jsprismarine/entities": patch
---

`minecraft:movement.jump` reads its `jump_delay`. The component's params carry `jumpDelay`, the wait between two hops in seconds as a `[min, max]` pair, which the slime family declares and a host needs to hop them at Bedrock's cadence. The other movement flavors are unchanged.
