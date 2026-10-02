/**
 * AbilityLayerFlag, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs@0e00fe80f4f3c71572ff6429de40146d1f4412fc (Minecraft 1.26.40, protocol 2168; no schema in v1.26.51)
 * Upstream name: AbilitiesIndex
 */
export enum AbilityLayerFlag {
    INVALID = -1,
    BUILD = 0,
    MINE = 1,
    DOORS_AND_SWITCHES = 2,
    OPEN_CONTAINERS = 3,
    ATTACK_PLAYERS = 4,
    ATTACK_MOBS = 5,
    OPERATOR_COMMANDS = 6,
    TELEPORT = 7,
    INVULNERABLE = 8,
    FLYING = 9,
    MAY_FLY = 10,
    INSTABUILD = 11,
    LIGHTNING = 12,
    FLY_SPEED = 13,
    WALK_SPEED = 14,
    MUTED = 15,
    WORLD_BUILDER = 16,
    NO_CLIP = 17,
    PRIVILEGED_BUILDER = 18,
    VERTICAL_FLY_SPEED = 19,
    ABILITY_COUNT = 20
}
