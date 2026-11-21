import type { Level } from '../../world/Level';
import { Event } from '../Event';

/**
 * A step of a level's lifecycle, which `WorldManager` announces
 * ([ADR 0029](../../../../../docs/adr/0029-worlds-are-levels-the-server-manages.md)).
 */
export default class LevelEvent extends Event {
    public constructor(private readonly level: Level) {
        super();
    }

    /** The level the step is about. */
    public getLevel(): Level {
        return this.level;
    }
}
