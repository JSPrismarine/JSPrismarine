/**
 * AbilityLayerFlag, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs@0e00fe80f4f3c71572ff6429de40146d1f4412fc (Minecraft 1.26.40, protocol 2168)
 * Upstream name: AbilitiesIndex
 *
 * NOT VERSIONED. No `bedrock-protocol-docs` release describes this enum: a schema
 * exists only for a type some packet field is declared with, and this one travels as
 * a plain integer. The members below come from the last `enums.html` Mojang
 * published, for Minecraft 1.26.40, and every protocol this package generates
 * reads them unchanged: 2193, 2225.
 *
 * Treat them as approximate above protocol 2168. A member added since then is
 * missing, and a member removed since then is still here. No source this package will
 * take numbers from publishes this enum per version, so that is a known gap and not
 * something to correct in the generated file.
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
