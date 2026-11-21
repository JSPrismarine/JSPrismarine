---
'@jsprismarine/prismarine': patch
---

Let go of a generated chunk's terrain once nothing can read it. The generator kept the holders around each generated chunk in a 512-entry LRU so neighboring chunks would not rebuild their terrain, and an LRU keeps a view's finished interior as long as its frontier. A holder is now released as soon as every chunk within two of it, the only chunks that read its terrain or feature pass, has finished. Over a 7 by 7 block, 112 holders stay where 121 did, and no terrain tile is built twice; at view distance 10 the interior is 289 of the 625 holders the view touches.
