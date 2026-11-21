---
'@jsprismarine/worldgen': patch
---

A density tree's native program now keeps running while the context sets a structure or blending hook the tree never reaches. Vanilla adds the structure beard and the blending hooks outside the trees under `final_density`'s `interpolated` nodes, so chunks near structures no longer run those trees on their closures. Over the generation corpus, density closures sample noise 0 times where they sampled it 392,670 times.
