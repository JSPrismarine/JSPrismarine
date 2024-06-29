import { GametypeInvalidError } from '@jsprismarine/errors';

/**
 * Gametype.
 * @remarks Also known as `Gamemode`.
 * @group Gametype
 */
export enum Gametype {
    UNDEFINED = -1,
    SURVIVAL = 0,
    CREATIVE = 1,
    ADVENTURE = 2,
    DEFAULT = 0,
    SPECTATOR = 3,
    WORLD_DEFAULT = SURVIVAL
}

/**
 * Gametype name.
 * @group Gametype
 */
export type GametypeName = 'Survival' | 'Creative' | 'Adventure' | 'Spectator';

/**
 * Get Gametype name.
 * @param {Gametype} mode - The Gametype to get the name of.
 * @returns {GametypeName} The Gametype name.
 * @throws {GametypeInvalidError} Thrown if the Gametype is invalid.
 * @group Gametype
 * @example
 * ```typescript
 * const gametype = getGametypeName(Gametype.SURVIVAL);
 * console.log(gametype); // 'Survival'
 * ```
 */
export function getGametypeName(mode: Gametype): GametypeName {
    switch (mode) {
        case Gametype.SURVIVAL:
            return 'Survival';
        case Gametype.CREATIVE:
            return 'Creative';
        case Gametype.ADVENTURE:
            return 'Adventure';
        case Gametype.SPECTATOR:
            return 'Spectator';
        default:
            throw new GametypeInvalidError();
    }
}

/**
 * Get Gametype from name.
 * @param {GametypeName | string | number} mode - The Gametype to get the ID of.
 * @returns {Gametype} The Gametype ID.
 * @throws {GametypeInvalidError} Thrown if the Gametype is invalid.
 * @group Gametype
 * @example
 * ```typescript
 * const gametype = getGametypeId('survival');
 * console.log(gametype); // 0
 * ```
 */
export function getGametypeId(mode: GametypeName | string | number): Gametype {
    const type = mode.toString().trim().toLowerCase();

    switch (true) {
        case type === '0' || 'survival'.startsWith(type):
            return Gametype.SURVIVAL;
        case type === '1' || 'creative'.startsWith(type):
            return Gametype.CREATIVE;
        case type === '2' || 'adventure'.startsWith(type):
            return Gametype.ADVENTURE;
        case type === '3' || 'spectator'.startsWith(type):
            return Gametype.SPECTATOR;
        default:
            throw new GametypeInvalidError(mode.toString());
    }
}
