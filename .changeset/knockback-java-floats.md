---
'@jsprismarine/prismarine': patch
---

A blow's knockback uses Java's numbers: a push of `0.4F` widened to a double, the `1.0E-5F` shortest direction compared with the squared length, and `Vec3.normalize`'s `Math.sqrt`, so a knocked-back body's velocity matches Java's to the bit.
