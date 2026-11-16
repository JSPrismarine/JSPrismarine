---
'@jsprismarine/prismarine': patch
---

Fly vanilla projectiles by Java's gravity and drag. Arrows, tridents, snowballs, eggs, ender pearls, experience bottles, potions, shulker bullets and llama spit took their gravity and inertia from Bedrock's `minecraft:projectile` component, so a trident fell twice as fast as on Java and an ender pearl landed short. Each now follows its Java class: arrows and tridents fall 0.05 per tick after keeping 0.99 of their speed in air (0.6 for an arrow and 0.99 for a trident in water), thrown items fall 0.03 (0.05 for a potion, 0.07 for an experience bottle) and then keep 0.99 in air or 0.8 in water before they move, an untargeted shulker bullet falls 0.04 with no drag, and llama spit falls 0.06 after 0.99 drag. Projectiles from add-ons still follow their component.
