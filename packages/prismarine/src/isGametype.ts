import { Gametype } from '@jsprismarine/minecraft';

/**
 * Whether a number is one of the `Gametype` values, the viewer modes among them, taken as it is.
 * `getGametypeId` reads command and config input, where 3 still means spectator.
 */
export const isGametype = (value: number): value is Gametype => Gametype[value] !== undefined;
