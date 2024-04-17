/**
 * Gametype.
 * @remarks A.k.a. Gamemode.
 */
export enum Gametype {
    UNDEFINED = -1,
    SURVIVAL,
    CREATIVE,
    ADVENTURE,
    DEFAULT,
    SPECTATOR,
    WORLD_DEFAULT = SURVIVAL
}

export type GametypeName = 'Survival' | 'Creative' | 'Adventure' | 'Spectator';

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
            throw new Error('Unknown gametype');
    }
}

export function getGametypeId(mode: GametypeName | string | number): Gametype {
    mode = mode.toString().trim().toLowerCase();

    if (mode === Gametype.SURVIVAL.toString() || 'survival'.startsWith(mode)) {
        return Gametype.SURVIVAL;
    } else if (mode === Gametype.CREATIVE.toString() || 'creative'.startsWith(mode)) {
        return Gametype.CREATIVE;
    } else if (mode === Gametype.ADVENTURE.toString() || 'adventure'.startsWith(mode)) {
        return Gametype.ADVENTURE;
    } else if (mode === Gametype.SPECTATOR.toString() || 'spectator'.startsWith(mode)) {
        return Gametype.SPECTATOR;
    }

    throw new Error('Unknown gametype');
}
