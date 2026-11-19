import type { Level } from '../../world/Level';
import { Event } from '../Event';

/**
 * Fired once a game rule of a level was set, by a command, a script or the settings screen.
 * Script `world.afterEvents.gameRuleChange` subscribers hear it in the tick's script flush.
 */
export default class GameRuleChangedEvent extends Event {
    public constructor(
        private readonly level: Level,
        private readonly rule: string,
        private readonly value: boolean | number
    ) {
        super();
    }

    /** The level whose rule changed. */
    public getLevel(): Level {
        return this.level;
    }

    /** The rule as the wire names it, such as `doDayLightCycle`. */
    public getRule(): string {
        return this.rule;
    }

    /** The value the rule has now. */
    public getValue(): boolean | number {
        return this.value;
    }
}
