---
'@jsprismarine/commands': patch
'@jsprismarine/prismarine': patch
---

Read a command line as the Bedrock Dedicated Server does. Any run of spaces separates two arguments, and when no form of a command reads the whole line, the syntax error points at the first word none of them could read. `/time set` takes a whole tick count, negative or not, and refuses a fraction or a unit such as `1d`. `/effect` takes Bedrock's forms, `effect <player> <effect> [seconds] [amplifier] [hideParticles]` and `effect <player> clear [effect]`, beside Java's `effect give` and `effect clear`.
