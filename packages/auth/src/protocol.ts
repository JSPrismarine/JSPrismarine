/**
 * What a Bedrock login says about itself, as both ends of a connection read it. The client
 * providers write these values and the server's verifier checks them, so they live in one place.
 */

/**
 * The first protocol whose servers want a multiplayer token rather than a certificate chain.
 *
 * 1.26.10 moved the identity out of the chain: a server at or past this reads the `Token` field
 * of a connection request, and refuses the old shape by going quiet at the RakNet layer rather
 * than by answering, which is why the version is worth stating rather than discovering.
 */
export const FIRST_TOKEN_PROTOCOL = 944;

/** What a multiplayer token says it is for. A server checks the audience even when it verifies nothing else. */
export const MULTIPLAYER_AUDIENCE = 'api://auth-minecraft-services/multiplayer';

/** Who signs the multiplayer token of a signed-in account, and where the keys that check it are published. */
export const TOKEN_ISSUER = 'https://authorization.franchise.minecraft-services.net/';

/**
 * Mojang's root key, base64 DER. A signed-in client's own chain link names it as the key that
 * signs the next link, and the chain Xbox Live issued continues from there.
 */
export const MOJANG_ROOT_KEY =
    'MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAECRXueJeTDqNRRgJi/vlRufByu/2G0i2Ebt6YMar5QX/R0DIIyrJMcUpruK4QveTfJSTp3Shlq4Gk34cD/4GUWwkv0DVuzeuB+tXija7HBxii03NHDbPAD0AKnLr2wdAp';

/** The connection request's `AuthenticationType`: who vouches for the identity it carries. */
export const AuthenticationType = {
    /** A signed-in Xbox Live account, vouched for by Minecraft services. */
    Full: 0,
    /** A guest of a signed-in player, such as a split-screen second player. */
    Guest: 1,
    /** Nobody: the client signed its identity itself. */
    SelfSigned: 2
} as const;

/** One of the {@link AuthenticationType} values. */
export type AuthenticationType = (typeof AuthenticationType)[keyof typeof AuthenticationType];
