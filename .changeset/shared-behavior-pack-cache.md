---
'@jsprismarine/server': patch
---

The prebuilt server now keeps the downloaded vanilla Bedrock behavior pack in the user's cache directory instead of `node_modules/.cache/jsprismarine/` in the folder it starts in, so starting it from another folder no longer downloads the 95 MB Bedrock Dedicated Server zip again. It downloads again only when the pack is missing, when an earlier download was interrupted, or when a new build pins another Bedrock Dedicated Server version or digest. A pack an older build already unpacked into the working directory is still used.
