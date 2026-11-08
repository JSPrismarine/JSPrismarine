---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/blocks': patch
---

Concrete powder now sets into concrete of its color when water touches it, as in Java. It never did: the powder fell like sand through the engine's gravity rule but ran the plain-block family, so a powder placed next to water, or falling into it, stayed powder. The new `jsprismarine:concrete_powder` family hardens it when water touches any side but below and when it falls into water.
