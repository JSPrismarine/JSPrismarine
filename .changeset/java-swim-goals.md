---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

`minecraft:behavior.random_swim` takes Java's numbers from a guardian's `RandomStrollGoal`, which swims on its water-bound navigation, and from the turtle's `TurtleTravelGoal`, which swims whenever the turtle is in water. A guardian and an elder guardian start a swim on one selector tick in 40 at Java's speed, and a turtle in water travels at once.
