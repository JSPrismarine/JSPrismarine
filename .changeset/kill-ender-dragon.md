---
"@jsprismarine/prismarine": patch
---

Make `/kill` land on the ender dragon. The command now deals the `self_destruct` cause, which the dragon's damage rules admit whole instead of refusing it as an attacker-less generic blow, so `/kill @e[type=!player]` kills the dragon, starts its death animation, and completes the fight.
