---
'@jsprismarine/blocks': patch
---

Cactus and sugar cane now grow, and torch flowers and lily of the valley behave as plants. The family table sent `minecraft:cactus` and `minecraft:reeds` to families with no growth rule, matched `torchflower` and `torchflower_crop` to the torch family because their names contain "torch", and left `minecraft:lily_of_the_valley` in the plain-block family with no ground support check.
