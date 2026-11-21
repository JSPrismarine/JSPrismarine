---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/auth': patch
---

A Java Edition player joins the world as a player: a session like a Bedrock player's, whose chat, commands, movement and loading go through the same handlers, with chunks that follow them as they walk and a Java presenter for messages, their own position and game mode. Bedrock players see them with a default skin. `PlayerSession` and `createConnectedPlayer` take an optional presenter; `@jsprismarine/protocol` gains Java chat packets and translated text components; `@jsprismarine/auth` exports `DefaultSkin`.
