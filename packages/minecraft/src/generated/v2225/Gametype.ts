/**
 * Gametype, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs release v1.26.60 (Minecraft 1.26.60, protocol 2225)
 * Upstream name: GameType
 */
export enum Gametype {
    UNDEFINED = -1,
    SURVIVAL = 0,
    CREATIVE = 1,
    ADVENTURE = 2,
    DEFAULT = 5,
    SPECTATOR = 6,
    WORLD_DEFAULT = 0,
    SURVIVAL_VIEWER = 3,
    CREATIVE_VIEWER = 4
}
