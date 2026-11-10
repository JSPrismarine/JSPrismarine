---
"@jsprismarine/prismarine": patch
---

Answer sub chunk requests for all-air sections the way a Bedrock Dedicated Server 1.26.60.6 does, which stops a 1.26.60 client disconnecting with `ClientDisconnection-90` ("Block") after a respawn. An all-air section now carries no bytes and no blob id, whether or not the client cache is on, and a section with no heightmap data repeats its heightmap type as its render heightmap type instead of saying `AllCopied`. The client asks for those sections when the server sends a column it still holds, which happens when a player respawns away from where they died.
