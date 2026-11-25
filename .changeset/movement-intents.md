---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

Java Edition players' sprinting, sneaking and jumps now count as Bedrock players' do. Other players see them crouch and sprint, a jump tires them, and scripts hear their jump and sneak buttons through `playerButtonInput`. Both editions now report a move, a jump, a sprint, a sneak, a flight and getting into or out of bed as the same intents, run by one handler each. `@jsprismarine/protocol` adds the Java `Player Command` and `Player Input` packets.
