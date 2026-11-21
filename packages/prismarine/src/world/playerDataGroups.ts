/**
 * Groups of levels whose players share parts of their record, which `player-data-groups` in
 * `config.json` names. Each level keeps a record of its own; a player moving between two levels of
 * a group takes the parts the group shares along, and leaves the rest of the record where it was
 * ([ADR 0029](../../../../docs/adr/0029-worlds-are-levels-the-server-manages.md)). A minigame
 * network shares the inventory between its lobby and its arenas this way.
 */
import { AttributeIds } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';

import type { WorldPlayerData } from '../config/JsonConfigTypes';
import { isRecord } from '../utils/isRecord';

/** The parts of a player's record a group can share, by the name the config gives each. */
export const PLAYER_DATA_PARTS = [
    'inventory',
    'armor',
    'offhand',
    'enderChest',
    'health',
    'hunger',
    'experience',
    'gamemode',
    'abilities',
    'spawnPoint',
    'position'
] as const;

/** One of {@link PLAYER_DATA_PARTS}. */
export type PlayerDataPart = (typeof PLAYER_DATA_PARTS)[number];

/** A group of levels and the parts of the record their players share. */
export interface PlayerDataGroup {
    /** The group's name in the config. */
    readonly name: string;
    /** The levels in the group, by name, compared case-insensitively. */
    readonly levels: readonly string[];
    readonly share: ReadonlySet<PlayerDataPart>;
}

/** Whether a value names one of {@link PLAYER_DATA_PARTS}. */
const isPlayerDataPart = (value: unknown): value is PlayerDataPart => PLAYER_DATA_PARTS.some((part) => part === value);

/**
 * Reads `player-data-groups`. A group whose `levels` or `share` is not a list is left out and
 * named in `problems`, and so is each entry of `share` that names no part.
 * @param value - The setting's value.
 */
export const readPlayerDataGroups = (
    value: unknown
): { readonly groups: readonly PlayerDataGroup[]; readonly problems: readonly string[] } => {
    const groups: PlayerDataGroup[] = [];
    const problems: string[] = [];
    if (value === undefined) return { groups, problems };
    if (!isRecord(value)) return { groups, problems: ['player-data-groups is not an object'] };
    for (const [name, group] of Object.entries(value)) {
        if (!isRecord(group) || !Array.isArray(group.levels) || !Array.isArray(group.share)) {
            problems.push(`player-data-groups.${name} needs a list of levels and a list of parts to share`);
            continue;
        }
        const levels = group.levels.filter((level): level is string => typeof level === 'string');
        const share = new Set<PlayerDataPart>();
        for (const part of group.share) {
            if (isPlayerDataPart(part)) share.add(part);
            else
                problems.push(
                    `player-data-groups.${name} shares ${JSON.stringify(part)}, which is no part of a record`
                );
        }
        groups.push({ name, levels, share });
    }
    return { groups, problems };
};

/** The parts two levels share: those of every group that holds both of them. */
export const sharedParts = (
    groups: readonly PlayerDataGroup[],
    from: string,
    to: string
): ReadonlySet<PlayerDataPart> => {
    const holds = (group: PlayerDataGroup, level: string) =>
        group.levels.some((name) => name.toLowerCase() === level.toLowerCase());
    const parts = new Set<PlayerDataPart>();
    for (const group of groups) {
        if (holds(group, from) && holds(group, to)) for (const part of group.share) parts.add(part);
    }
    return parts;
};

/** The attributes each part carries in a record's attribute table. */
const PART_ATTRIBUTES: Partial<Record<PlayerDataPart, readonly string[]>> = {
    health: [AttributeIds.Health, AttributeIds.Absorption],
    hunger: [AttributeIds.PlayerHunger, AttributeIds.PlayerSaturation, AttributeIds.PlayerExhaustion],
    experience: [AttributeIds.PlayerLevel, AttributeIds.PlayerExperience]
};

/**
 * A level's record with the shared parts taken from the record the player carries now.
 * @param carried - The player's record in the level they leave, as they are now.
 * @param arriving - Their record in the level they arrive in.
 * @param parts - The parts the two levels share.
 */
export const withSharedParts = (
    carried: Partial<WorldPlayerData>,
    arriving: Partial<WorldPlayerData>,
    parts: ReadonlySet<PlayerDataPart>
): Partial<WorldPlayerData> => {
    if (parts.size === 0) return arriving;
    const record: Partial<WorldPlayerData> = { ...arriving };
    const inventory = { ...(arriving.inventory ?? { items: [], handSlot: 0, armor: [], offhand: [], enderChest: [] }) };
    if (parts.has('inventory')) {
        inventory.items = carried.inventory?.items ?? [];
        inventory.handSlot = carried.inventory?.handSlot ?? 0;
    }
    if (parts.has('armor')) inventory.armor = carried.inventory?.armor ?? [];
    if (parts.has('offhand')) inventory.offhand = carried.inventory?.offhand ?? [];
    if (parts.has('enderChest')) inventory.enderChest = carried.inventory?.enderChest ?? [];
    record.inventory = inventory;

    if (parts.has('health')) record.health = carried.health;
    if (parts.has('hunger')) {
        record.food = carried.food;
        record.saturation = carried.saturation;
    }
    if (parts.has('experience')) record.experience = carried.experience;
    const attributes = { ...arriving.attributes };
    for (const [part, names] of Object.entries(PART_ATTRIBUTES)) {
        if (!isPlayerDataPart(part) || !parts.has(part)) continue;
        for (const name of names) {
            const attribute = carried.attributes?.[name];
            if (attribute === undefined) delete attributes[name];
            else attributes[name] = attribute;
        }
    }
    if (arriving.attributes !== undefined || carried.attributes !== undefined) record.attributes = attributes;

    if (parts.has('gamemode') && carried.gamemode !== undefined) record.gamemode = carried.gamemode;
    if (parts.has('abilities')) record.flying = carried.flying;
    if (parts.has('spawnPoint')) record.spawn = carried.spawn;
    if (parts.has('position') && carried.position !== undefined) {
        record.position = carried.position;
        record.dimension = carried.dimension;
    }
    return record;
};
