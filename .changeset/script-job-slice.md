---
'@jsprismarine/script-host': patch
'@jsprismarine/prismarine': patch
---

Give behavior pack `system.runJob` jobs the time a tick leaves, as BDS gives them a slice from its frame-time estimates, rather than a fixed 100 steps. `ScriptWorld.jobSteps` sets a tick's budget, `jobStepsForTick` turns how long the last tick took into steps at `STEPS_PER_MILLISECOND`, and the server admits that time once per input step, so a replay that admits the same times advances every job as far. An idle server gives jobs five times what they had.
