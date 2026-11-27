---
"@jsprismarine/auth": minor
"@jsprismarine/errors": patch
---

Fix online-mode sign-in through prismarine-auth. `XboxAuthProvider` now hands the token source the identity key as base64 SPKI DER, which Minecraft services reads from the request body; the `KeyObject` it passed before serialized as `{}` and every sign-in failed with 400 INVALID_JSON. `XboxTokenSource.getMinecraftBedrockToken` takes that string, so a custom token source changes its parameter type. The provider also finds prismarine-auth's exports under `default`, as tsx loads them, and throws `PrismarineAuthUnrecognized` when neither shape has them.
