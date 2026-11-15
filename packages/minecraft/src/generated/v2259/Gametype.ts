/**
 * Gametype, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs release v1.26.70-preview.24 (Minecraft 1.26.70.24, protocol 2259)
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
