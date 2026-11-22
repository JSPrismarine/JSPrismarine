---
'@jsprismarine/prismarine': patch
'@jsprismarine/server': patch
---

Java Edition players can log in with `online-mode` on under the Bun executables. Bun refuses RSA PKCS #1 v1.5 padding for private decryption, so the login read nothing from the encryption response; the server now decrypts the raw block and checks the padding itself.
