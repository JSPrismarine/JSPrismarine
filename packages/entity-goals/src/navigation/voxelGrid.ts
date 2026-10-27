import type { EntityPosition } from '@jsprismarine/entities';

import type { DoorState, NavigationView } from './view';

/**
 * A {@link NavigationView} over a small hand-written world.
 *
 * It exists so the path finder and the movement goals can be tested against
 * voxel scenarios written as text, and so a server integrating the package has
 * a reference for what each view member is supposed to answer.
 */

/** What one character of a {@link voxelGrid} layer stands for. */
export interface VoxelKind {
    readonly identifier: string;
    readonly passable: boolean;
    readonly solid: boolean;
    readonly water?: boolean;
    readonly lava?: boolean;
    readonly door?: DoorState;
    readonly damaging?: boolean;
    readonly sunlit?: boolean;
    readonly portal?: boolean;
    readonly climbable?: boolean;
}

/**
 * The characters {@link voxelGrid} reads.
 *
 * `.` air, `#` stone, `~` water, `!` lava, `D` a closed door, `d` an open
 * door, `I` a closed iron door, `*` fire, `L` a ladder, `o` a nether portal,
 * `s` air the sky reaches.
 */
export const VOXEL_KINDS: Readonly<Record<string, VoxelKind>> = {
    '.': { identifier: 'minecraft:air', passable: true, solid: false },
    '#': { identifier: 'minecraft:stone', passable: false, solid: true },
    '~': { identifier: 'minecraft:water', passable: true, solid: false, water: true },
    '!': { identifier: 'minecraft:lava', passable: true, solid: false, lava: true },
    D: { identifier: 'minecraft:wooden_door', passable: true, solid: false, door: { open: false, iron: false } },
    d: { identifier: 'minecraft:wooden_door', passable: true, solid: false, door: { open: true, iron: false } },
    I: { identifier: 'minecraft:iron_door', passable: true, solid: false, door: { open: false, iron: true } },
    '*': { identifier: 'minecraft:fire', passable: true, solid: false, damaging: true },
    L: { identifier: 'minecraft:ladder', passable: true, solid: false, climbable: true },
    o: { identifier: 'minecraft:portal', passable: true, solid: false, portal: true },
    s: { identifier: 'minecraft:air', passable: true, solid: false, sunlit: true }
};

/** The block outside the written world, which the path finder treats as unloaded. */
const voidKind: VoxelKind = { identifier: 'minecraft:air', passable: false, solid: false };

/**
 * Builds a view from layers of text.
 *
 * @param layers - One entry per y from 0 upward; within a layer one string per
 *   z from 0 upward, and one character per x from 0 upward.
 * @returns A view that answers every member, with unwritten positions treated
 *   as impassable so a scenario does not need walls around it.
 *
 * @example
 * ```typescript
 * const view = voxelGrid([['###', '###'], ['...', '...']]);
 * ```
 */
export const voxelGrid = (layers: readonly (readonly string[])[]): NavigationView => {
    const kindAt = (position: EntityPosition): VoxelKind => {
        const row = layers[Math.floor(position.y)]?.[Math.floor(position.z)];
        const character = row?.[Math.floor(position.x)];
        return character === undefined ? voidKind : (VOXEL_KINDS[character] ?? voidKind);
    };

    return {
        blockAt: (position) => kindAt(position).identifier,
        isPassable: (position) => kindAt(position).passable,
        isSolid: (position) => kindAt(position).solid,
        isWater: (position) => kindAt(position).water === true,
        isLava: (position) => kindAt(position).lava === true,
        doorAt: (position) => kindAt(position).door,
        isDamaging: (position) => kindAt(position).damaging === true,
        isSunlit: (position) => kindAt(position).sunlit === true,
        isPortal: (position) => kindAt(position).portal === true,
        isClimbable: (position) => kindAt(position).climbable === true,
        isLadder: (position) => kindAt(position).identifier === 'minecraft:ladder'
    };
};
