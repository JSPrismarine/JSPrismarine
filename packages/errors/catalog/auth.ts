import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from './defineErrors';

/**
 * A login that cannot be attributed to an account. The message is safe to show the player; the
 * cause is the specific reason, and {@link LoginRefused.detail} carries its message for the log.
 */
export abstract class LoginRefused extends JSPrismarineError {
    public override name = 'LoginRefused';

    /** What went wrong, for the server log. */
    public get detail(): string {
        return this.cause instanceof Error ? this.cause.message : '';
    }
}

/** The errors `@jsprismarine/auth` throws. */
export const AuthErrors = defineErrors('auth', {
    /**
     * The Xbox Live sign-in returned a certificate chain without the account's XUID, identity or
     * name, so the client cannot say who it is. Sign in again; if it repeats, the account may not
     * own Minecraft.
     */
    ChainNamesNoAccount: 'The chain Minecraft services issued names no account',
    /**
     * Minecraft services signed the account in but returned no multiplayer token, which happens
     * when the account does not own Minecraft: Bedrock Edition or has multiplayer turned off in its
     * Xbox privacy settings.
     */
    NoMultiplayerToken: 'Minecraft services issued no multiplayer token for this account',
    /**
     * `XboxAuthProvider` signs in through the optional `prismarine-auth` package, which is not
     * installed. Add it to the project that uses `@jsprismarine/auth`.
     */
    PrismarineAuthNotInstalled:
        'XboxAuthProvider signs in through prismarine-auth; install it beside @jsprismarine/auth',

    /** The player's login token has expired. The cause says which token. */
    LoginExpired: { message: 'Your login has expired.', base: LoginRefused },
    /** The login failed a signature or a claim check. The cause says which. */
    InvalidLogin: { message: 'Invalid login!', base: LoginRefused },
    /** The client joined without an Xbox Live token while the server runs in online mode. */
    XboxSignInRequired: { message: 'Please sign in to Xbox Live to join.', base: LoginRefused },
    /** The login names an account, but the connection does not prove it holds the account's key. */
    XboxLoginRequired: { message: 'You must be logged in with Xbox Live to join.', base: LoginRefused },
    /** The issuer's signing keys could not be fetched, so no login can be checked right now. */
    AccountUnverifiable: { message: 'Could not verify your account right now. Please try again.', base: LoginRefused },

    /**
     * The token's `exp` claim is in the past, beyond the clock skew the server allows. The player
     * rejoins with a fresh login; a server whose clock is far off refuses every login this way.
     */
    TokenExpired: '{what} has expired',
    /**
     * The token's `nbf` claim is in the future. Usually the server's clock is behind; set it right.
     */
    TokenNotValidYet: '{what} is not valid yet',
    /**
     * A claim the server checks does not hold the value it requires. The client sent a login
     * Minecraft services did not issue for this server.
     */
    TokenHasWrongClaim: '{what} has the wrong {claim}: {reason}',
    /**
     * The token was not issued by Minecraft services, so the login is forged or comes from another
     * service.
     */
    TokenNamesAnotherIssuer: '{what} names another issuer',
    /**
     * The token is signed with an algorithm other than the RS256 Minecraft services uses, a sign of
     * a forged login.
     */
    TokenUsesRefusedAlgorithm: '{what} uses a refused algorithm',
    /** The token's signature does not match the issuer's key, so it was altered or forged. */
    TokenSignatureDoesNotMatch: '{what} signature does not match',
    /**
     * The token is not a well-formed signed JSON web token. The client is modified or the login was
     * damaged in transit.
     */
    TokenIsNotValidJws: '{what} is not a valid JWS: {reason}',
    /**
     * The login's connection request is not JSON, so it cannot hold the token chain. The client is
     * modified or broken.
     */
    ConnectionRequestIsNotJsonObject: 'the connection request is not a JSON object',
    /**
     * The client logged in without Xbox Live (as a guest or self-signed) while the server is in
     * online mode. Sign in to Xbox Live, or turn online mode off for a LAN server.
     */
    UnsupportedAuthenticationType: 'authentication type {type}',
    /**
     * The connection request carries no multiplayer token, which happens when the client is not
     * signed in to Xbox Live.
     */
    NoToken: 'no token',
    /**
     * The token's header names no `kid`, so the server cannot tell which of the issuer's keys
     * signed it.
     */
    TokenNamesNoKey: 'the token names no key',
    /**
     * The server could not download the issuer's public keys, so it cannot check any login until it
     * can. Check that the server reaches the internet; the reason says what the request hit.
     */
    IssuerKeysCouldNotBeFetched: "the issuer's keys could not be fetched: {reason}",
    /**
     * The token names a signing key the issuer does not publish, so the login is forged or signed
     * with a key that has been withdrawn.
     */
    UnknownTokenKey: 'unknown token key {kid}',
    /**
     * The token was valid but did not name the account's XUID, its gamertag or the client's public
     * key, all of which a Minecraft multiplayer token carries.
     */
    TokenLacksAccountOrClientKey: 'the token lacks an account or a client key',
    /**
     * The client public key the token vouches for is not a key the server can load, so the client
     * data cannot be checked against it.
     */
    TokenNamesUnusableClientKey: 'the token names an unusable client key',
    /**
     * The client data was signed by a key other than the one the token vouches for, so somebody
     * replaced the client data of a real login.
     */
    ClientDataNotSignedByAccountKey: 'the client data is not signed by the account key',
    /**
     * The login's chain is real, but the connection did not prove it holds the chain's private key.
     * The login was recorded from somebody else's session and replayed.
     */
    IdentityDoesNotProveLoginKey: "the connection's identity does not prove the login's key"
});
