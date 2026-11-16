---
'@jsprismarine/prismarine': patch
---

Merge a generated chunk's feature patches in the generation worker instead of on the server thread. The `full` status now only gathers a chunk's own feature writes and the eight inbound patches. With a stage pool, one worker task lays them over the terrain tile, which the worker already holds from the feature passes, and runs the block pass. The server thread sends the Bedrock form of every block the merge can produce with the task, since the translation tables stay with it. On a 6 by 6 block of chunks through the generation host, a `full` task posts 74.6 KB on average, where the block pass alone used to post the merged slots and column tops, 197.6 KB.
