---
title: '@jsprismarine/auth errors'
description: The code, message and meaning of every error @jsprismarine/auth throws.
group: Documents
category: Errors
---

# @jsprismarine/auth errors

These are the errors `@jsprismarine/auth` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.auth -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class          | What its errors mean                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoginRefused` | A login that cannot be attributed to an account. The message is safe to show the player; the cause is the specific reason, and `LoginRefused.detail` carries its message for the log. |

## `AUTH_ACCOUNT_UNVERIFIABLE`

`Could not verify your account right now. Please try again.`

Thrown as `AuthErrors.AccountUnverifiable`, which extends `LoginRefused`.

The issuer's signing keys could not be fetched, so no login can be checked right now.

## `AUTH_CHAIN_NAMES_NO_ACCOUNT`

`The chain Minecraft services issued names no account`

Thrown as `AuthErrors.ChainNamesNoAccount`, which extends `Error`.

The Xbox Live sign-in returned a certificate chain without the account's XUID, identity or
name, so the client cannot say who it is. Sign in again; if it repeats, the account may not
own Minecraft.

## `AUTH_CLIENT_DATA_NOT_SIGNED_BY_ACCOUNT_KEY`

`the client data is not signed by the account key`

Thrown as `AuthErrors.ClientDataNotSignedByAccountKey`, which extends `Error`.

The client data was signed by a key other than the one the token vouches for, so somebody
replaced the client data of a real login.

## `AUTH_CONNECTION_REQUEST_IS_NOT_JSON_OBJECT`

`the connection request is not a JSON object`

Thrown as `AuthErrors.ConnectionRequestIsNotJsonObject`, which extends `Error`.

The login's connection request is not JSON, so it cannot hold the token chain. The client is
modified or broken.

## `AUTH_IDENTITY_DOES_NOT_PROVE_LOGIN_KEY`

`the connection's identity does not prove the login's key`

Thrown as `AuthErrors.IdentityDoesNotProveLoginKey`, which extends `Error`.

The login's chain is real, but the connection did not prove it holds the chain's private key.
The login was recorded from somebody else's session and replayed.

## `AUTH_INVALID_LOGIN`

`Invalid login!`

Thrown as `AuthErrors.InvalidLogin`, which extends `LoginRefused`.

The login failed a signature or a claim check. The cause says which.

## `AUTH_ISSUER_KEYS_COULD_NOT_BE_FETCHED`

`the issuer's keys could not be fetched: {reason}`

Thrown as `AuthErrors.IssuerKeysCouldNotBeFetched`, which extends `Error`.

The server could not download the issuer's public keys, so it cannot check any login until it
can. Check that the server reaches the internet; the reason says what the request hit.

## `AUTH_LOGIN_EXPIRED`

`Your login has expired.`

Thrown as `AuthErrors.LoginExpired`, which extends `LoginRefused`.

The player's login token has expired. The cause says which token.

## `AUTH_NO_MULTIPLAYER_TOKEN`

`Minecraft services issued no multiplayer token for this account`

Thrown as `AuthErrors.NoMultiplayerToken`, which extends `Error`.

Minecraft services signed the account in but returned no multiplayer token, which happens
when the account does not own Minecraft: Bedrock Edition or has multiplayer turned off in its
Xbox privacy settings.

## `AUTH_NO_TOKEN`

`no token`

Thrown as `AuthErrors.NoToken`, which extends `Error`.

The connection request carries no multiplayer token, which happens when the client is not
signed in to Xbox Live.

## `AUTH_PRISMARINE_AUTH_NOT_INSTALLED`

`XboxAuthProvider signs in through prismarine-auth; install it beside @jsprismarine/auth`

Thrown as `AuthErrors.PrismarineAuthNotInstalled`, which extends `Error`.

`XboxAuthProvider` signs in through the optional `prismarine-auth` package, which is not
installed. Add it to the project that uses `@jsprismarine/auth`.

## `AUTH_TOKEN_EXPIRED`

`{what} has expired`

Thrown as `AuthErrors.TokenExpired`, which extends `Error`.

The token's `exp` claim is in the past, beyond the clock skew the server allows. The player
rejoins with a fresh login; a server whose clock is far off refuses every login this way.

## `AUTH_TOKEN_HAS_WRONG_CLAIM`

`{what} has the wrong {claim}: {reason}`

Thrown as `AuthErrors.TokenHasWrongClaim`, which extends `Error`.

A claim the server checks does not hold the value it requires. The client sent a login
Minecraft services did not issue for this server.

## `AUTH_TOKEN_IS_NOT_VALID_JWS`

`{what} is not a valid JWS: {reason}`

Thrown as `AuthErrors.TokenIsNotValidJws`, which extends `Error`.

The token is not a well-formed signed JSON web token. The client is modified or the login was
damaged in transit.

## `AUTH_TOKEN_LACKS_ACCOUNT_OR_CLIENT_KEY`

`the token lacks an account or a client key`

Thrown as `AuthErrors.TokenLacksAccountOrClientKey`, which extends `Error`.

The token was valid but did not name the account's XUID, its gamertag or the client's public
key, all of which a Minecraft multiplayer token carries.

## `AUTH_TOKEN_NAMES_ANOTHER_ISSUER`

`{what} names another issuer`

Thrown as `AuthErrors.TokenNamesAnotherIssuer`, which extends `Error`.

The token was not issued by Minecraft services, so the login is forged or comes from another
service.

## `AUTH_TOKEN_NAMES_NO_KEY`

`the token names no key`

Thrown as `AuthErrors.TokenNamesNoKey`, which extends `Error`.

The token's header names no `kid`, so the server cannot tell which of the issuer's keys
signed it.

## `AUTH_TOKEN_NAMES_UNUSABLE_CLIENT_KEY`

`the token names an unusable client key`

Thrown as `AuthErrors.TokenNamesUnusableClientKey`, which extends `Error`.

The client public key the token vouches for is not a key the server can load, so the client
data cannot be checked against it.

## `AUTH_TOKEN_NOT_VALID_YET`

`{what} is not valid yet`

Thrown as `AuthErrors.TokenNotValidYet`, which extends `Error`.

The token's `nbf` claim is in the future. Usually the server's clock is behind; set it right.

## `AUTH_TOKEN_SIGNATURE_DOES_NOT_MATCH`

`{what} signature does not match`

Thrown as `AuthErrors.TokenSignatureDoesNotMatch`, which extends `Error`.

The token's signature does not match the issuer's key, so it was altered or forged.

## `AUTH_TOKEN_USES_REFUSED_ALGORITHM`

`{what} uses a refused algorithm`

Thrown as `AuthErrors.TokenUsesRefusedAlgorithm`, which extends `Error`.

The token is signed with an algorithm other than the RS256 Minecraft services uses, a sign of
a forged login.

## `AUTH_UNKNOWN_TOKEN_KEY`

`unknown token key {kid}`

Thrown as `AuthErrors.UnknownTokenKey`, which extends `Error`.

The token names a signing key the issuer does not publish, so the login is forged or signed
with a key that has been withdrawn.

## `AUTH_UNSUPPORTED_AUTHENTICATION_TYPE`

`authentication type {type}`

Thrown as `AuthErrors.UnsupportedAuthenticationType`, which extends `Error`.

The client logged in without Xbox Live (as a guest or self-signed) while the server is in
online mode. Sign in to Xbox Live, or turn online mode off for a LAN server.

## `AUTH_XBOX_LOGIN_REQUIRED`

`You must be logged in with Xbox Live to join.`

Thrown as `AuthErrors.XboxLoginRequired`, which extends `LoginRefused`.

The login names an account, but the connection does not prove it holds the account's key.

## `AUTH_XBOX_SIGN_IN_REQUIRED`

`Please sign in to Xbox Live to join.`

Thrown as `AuthErrors.XboxSignInRequired`, which extends `LoginRefused`.

The client joined without an Xbox Live token while the server runs in online mode.
<!-- /fact -->
