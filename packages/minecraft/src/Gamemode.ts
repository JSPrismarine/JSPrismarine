/**
 * Gamemode enum (aka Gamemode).
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

export function getGametypeName(mode: Gametype): string {
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
            throw new Error('Unknown gamemode');
    }
}

export function getGametypeId(mode: string): Gametype {
    switch (mode.toLowerCase()) {
        case 'survival':
        case '0':
            return Gametype.SURVIVAL;
        case 'creative':
        case '1':
            return Gametype.CREATIVE;
        case 'adventure':
        case '2':
            return Gametype.ADVENTURE;
        case 'spectator':
        case '3':
            return Gametype.SPECTATOR;
        default:
            throw new Error('Unknown gametype');
    }
}
