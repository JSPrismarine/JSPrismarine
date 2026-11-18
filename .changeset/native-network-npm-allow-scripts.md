---
'@jsprismarine/native-network': patch
---

The message shown when the library's build is missing tells npm users to run `npm install-scripts approve @jsprismarine/native-network`, then `npm rebuild @jsprismarine/native-network`. npm 12 skips a dependency's install script until the project approves it, so the old `npm rebuild` advice alone did nothing.
