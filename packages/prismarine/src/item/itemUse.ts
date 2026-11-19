/**
 * The stages of a player's use of an item that lasts, as the server tells them: a meal and a
 * bow's draw begin when the client says so, and end when the meal is finished or the client lets
 * go. Each stage raises `playerItemUseStage` with the ticks left.
 */
import type { Item } from './Item';
import PlayerItemUseStageEvent from '../events/player/PlayerItemUseStageEvent';
import type { ItemUseStage } from '../events/player/PlayerItemUseStageEvent';
import type Server from '../Server';
import type { World } from '../world/World';

/** How long a bow, a crossbow or a trident can be held: Bedrock's `use_duration` for them. */
export const HELD_USE_TICKS = 72_000;

/** A player's use in progress. */
interface ItemUse {
    readonly item: Item;
    readonly duration: number;
    readonly startedAt: number;
}

const uses = new WeakMap<object, ItemUse>();

/** Who uses the item: their runtime id, the world they are in and the server. */
export interface ItemUser {
    readonly runtimeId: bigint;
    getWorld(): World;
    getServer(): Server;
}

const post = (user: ItemUser, stage: ItemUseStage, item: Item | null, ticksLeft: number): void => {
    const { events } = user.getServer().getKernel();
    if (!events.hasListeners('playerItemUseStage')) return;
    events.post(
        'playerItemUseStage',
        new PlayerItemUseStageEvent(user.runtimeId, user.getWorld(), stage, item, ticksLeft)
    );
};

/** A use that lasts begins, with all of its ticks ahead. */
export const startItemUse = (user: ItemUser, item: Item, duration: number, tick: number): void => {
    uses.set(user, { item, duration, startedAt: tick });
    post(user, 'start', item, duration);
};

/**
 * The use in progress ends: `complete` for a meal finished, `release` for a bow let go of, and
 * `stop` for any end. Nothing is raised when no use was in progress.
 */
export const endItemUse = (user: ItemUser, how: 'complete' | 'release' | 'stop', tick: number): void => {
    const use = uses.get(user);
    if (use === undefined) return;
    uses.delete(user);
    const left = how === 'complete' ? 0 : Math.max(0, use.duration - (tick - use.startedAt));
    if (how !== 'stop') post(user, how, use.item, left);
    post(user, 'stop', use.item, left);
};
