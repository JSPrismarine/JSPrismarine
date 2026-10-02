/**
 * ServerAuthMovementMode, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs@0e00fe80f4f3c71572ff6429de40146d1f4412fc (Minecraft 1.26.40, protocol 2168; no schema in v1.26.51)
 * Upstream name: ServerAuthMovementMode
 */
export enum ServerAuthMovementMode {
    LEGACY_CLIENT_AUTHORITATIVE_V1_DEPRECATED = 0,
    SERVER_AUTHORITATIVE = 1,
    SERVER_AUTHORITATIVE_WITH_REWIND = 2
}
