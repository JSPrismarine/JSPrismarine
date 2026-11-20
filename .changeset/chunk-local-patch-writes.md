---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

Carry a feature patch's block writes across the generation worker boundary as positions within the patch's chunk and 16-bit palette slots: 6 bytes a write instead of 16. Feature results and `full` merge tasks post less to the generation host.
