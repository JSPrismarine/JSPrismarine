/**
 * When each entity last used an eye of ender on a block, kept only as long as it can matter.
 *
 * A Bedrock client reports one right click on an end portal frame as a block use and as a use in
 * the air, in either tick, and the air use must not throw a second eye. A Java client sends the
 * air use only when the block use did nothing on its side, so the check never refuses one of its
 * clicks: after an eye fills a frame there is no air use to refuse. Keyed by entity runtime id:
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

/** The item whose block use also arrives as an air use. */
export const ENDER_EYE = 'minecraft:ender_eye';

/**
 * How many ticks after an eye of ender was used on a block the same client's click at nothing is
 * still taken for that click's echo: the block use and the air use arrive in either tick.
 */
const EYE_ECHO_TICKS = 2;

/** The eye of ender block uses whose air-use echo is still due, which both use handlers share. */
export const enderEyeEcho = new EyeOfEnderEcho(EYE_ECHO_TICKS);
