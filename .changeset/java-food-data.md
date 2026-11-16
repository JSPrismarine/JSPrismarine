---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

Run a player's hunger by Java's `FoodData`. A fresh player starts on 5 saturation instead of 20. Exhaustion adds up to a cap of 40, and each tick spends 4 of it on one point of saturation or food once it is above 4, where it used to spend everything at once and at exactly 4. The player exhaustion attribute's maximum is now 40.
