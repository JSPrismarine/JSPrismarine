---
'@jsprismarine/block-behaviors': patch
---

Place pointed dripstone and sulfur spikes the way Java does. A segment points away from where its placer looks, or the other way when only that side holds it, and the placement is refused with nothing above or below. Segments join into columns that read base, middle, frustum and tip, and two tips that meet merge. A stalactite that loses its ceiling, or the segment it hangs from, now falls with every segment below it and breaks into items where it lands, instead of dropping in place.
