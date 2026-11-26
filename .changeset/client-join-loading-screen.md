---
'@jsprismarine/client': patch
---

Report the join loading screen opening and closing, as a retail client does. The Bedrock Dedicated Server ignores a player's `PlayerAuthInput` until that screen closes, so a scripted client could not walk on it or go through a portal ([#3722](https://github.com/JSPrismarine/JSPrismarine/issues/3722)).
