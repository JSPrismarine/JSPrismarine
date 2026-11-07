---
'@jsprismarine/prismarine': patch
---

Grass, ferns, flowers and leaf litter no longer replace tree trunks. Each chunk's decoration is drawn without the trees its neighbors place, and the replay of one chunk's writes believed a trunk's base block was still air and put ground cover over it. The replay now leaves anything that is not air, water or another plant alone when the write is ground cover.
