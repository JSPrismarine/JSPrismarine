---
'@jsprismarine/entity-goals': patch
---

Hold a `look_at_player` or `look_at_entity` look for as long as Java does. The look counted its drawn 40 to 80 ticks down only on selector ticks, every other tick, so it lasted twice as long; it now counts in Java's `adjustedTickDelay` form and ends once the subject walks out of the look distance.
