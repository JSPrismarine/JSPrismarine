/**
 * CommandPermissionLevel, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs release v1.26.60 (Minecraft 1.26.60, protocol 2225)
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
