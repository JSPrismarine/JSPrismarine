---
'@jsprismarine/prismarine': minor
---

`InputMode.MotionController` in `network/packet/PlayerAuthInputPacket` is now `InputMode.MotionController_Deprecated`, the name Mojang's datagen snapshot gives member 4. The 1.26.51 docs' member list drops it, but the value is still below `Count` (5), so the member stays. Values are unchanged.
