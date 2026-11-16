---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

A fox's `minecraft:behavior.find_cover` runs Java's `Fox$SeekShelterGoal`: under open sky in daylight it looks for shelter once every 100 selector updates, at once in a thunderstorm, and walks to the first of ten spots that cannot see the sky and is dark enough, by Java's light cost, that an animal rates it below zero, at Java's 1.25 speed. It used to walk to any spot out of the sun whatever the fox stood in, and Bedrock's cooldown stood in for Java's interval. The navigation view now answers Java's light cost on its own, beside a monster's walk value.
