/**
 * When each entity last used an eye of ender on a block, kept only as long as it can matter.
 *
 * The client reports one right click on an end portal frame as a block use and as a use in the
 * air, in either tick, and the air use must not throw a second eye. Keyed by entity runtime id:
 * the echo comes from the same entity in the same world a tick or two later, so the id is
 * exactly as long-lived as the fact. An entry outside the window answers the same as no entry,
 * so each write drops those. That is what removes the entry of a player who leaves, dies or
 * changes dimension right after a click, without a hook on any of them.
 */
export class EyeOfEnderEcho {
    private readonly usedAt = new Map<bigint, number>();

    /**
     * @param windowTicks - How many ticks, either side of the block use, a click at nothing is
     *   still taken for its echo.
     */
    public constructor(private readonly windowTicks: number) {}

    /** Records a block use by the entity with runtime id `runtimeId` at `tick`. */
    public usedOnBlock(runtimeId: bigint, tick: number): void {
        for (const [held, at] of this.usedAt) {
            if (!this.within(at, tick)) this.usedAt.delete(held);
        }
        this.usedAt.set(runtimeId, tick);
    }

    /** Whether a click at nothing at `tick` is the echo of the entity's last block use. */
    public isEcho(runtimeId: bigint, tick: number): boolean {
        const at = this.usedAt.get(runtimeId);
        return at !== undefined && this.within(at, tick);
    }

    /** How many block uses are held. */
    public get size(): number {
        return this.usedAt.size;
    }

    private within(at: number, tick: number): boolean {
        return Math.abs(tick - at) <= this.windowTicks;
    }
}
