/**
 * CommandPermissionLevel, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs release v1.26.70-preview.24 (Minecraft 1.26.70.24, protocol 2259)
 * Upstream name: CommandPermissionLevel
 */
export enum CommandPermissionLevel {
    ANY = 0,
    GAME_DIRECTORS = 1,
    ADMIN = 2,
    HOST = 3,
    OWNER = 4,
    INTERNAL = 5
}
