---
'@jsprismarine/prismarine': minor
'@jsprismarine/server': minor
---

`java-enabled` is now on by default, so a new server lets Java Edition clients join on TCP `java-port`, 25565, beside Bedrock. A server whose `config.json` already sets `java-enabled` keeps its setting. Set it to `false` to keep port 25565 free. The Docker image exposes 25565/tcp.
