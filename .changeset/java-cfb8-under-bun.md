---
'@jsprismarine/prismarine': patch
'@jsprismarine/server': patch
---

Java Edition players can log in with `online-mode` on under the Bun executables. Bun has no `aes-128-cfb8`, the cipher a Java connection switches to once its login agrees on a secret, so the login ended with "Unknown cipher". The server now builds CFB8 from AES-ECB where the runtime lacks it, and keeps Node's own CFB8 where it has one.
