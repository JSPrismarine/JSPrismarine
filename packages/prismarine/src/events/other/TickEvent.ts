import { Event } from '../Event';

/**
 * Fired for every tick
 */
export default class TickEvent extends Event {
    private readonly tick;

    public constructor(tick: number) {
        super();
        this.tick = tick;
    }

    public getTick(): number {
        return this.tick;
    }
}
