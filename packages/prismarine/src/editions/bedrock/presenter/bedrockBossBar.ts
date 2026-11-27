import BossEventPacket, {
    BossBarColor,
    BossBarOverlay,
    BossEventUpdateType
} from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';

import type {
    BossBarChange,
    ShownBossBar,
    ShownBossBarColor,
    ShownBossBarStyle
} from '../../../player/presenter/SessionPresenter';

/** Each boss bar color and the Bedrock color that draws it. */
const COLORS: readonly (readonly [ShownBossBarColor, BossBarColor])[] = [
    ['pink', BossBarColor.Pink],
    ['blue', BossBarColor.Blue],
    ['red', BossBarColor.Red],
    ['green', BossBarColor.Green],
    ['yellow', BossBarColor.Yellow],
    ['purple', BossBarColor.Purple],
    ['rebeccaPurple', BossBarColor.RebeccaPurple],
    ['white', BossBarColor.White]
];

/** Each boss bar style and the Bedrock overlay that draws it. */
const OVERLAYS: readonly (readonly [ShownBossBarStyle, BossBarOverlay])[] = [
    ['progress', BossBarOverlay.Progress],
    ['notched6', BossBarOverlay.Notched6],
    ['notched10', BossBarOverlay.Notched10],
    ['notched12', BossBarOverlay.Notched12],
    ['notched20', BossBarOverlay.Notched20]
];

/** The Bedrock event each change goes out as. */
const BEDROCK_EVENT = {
    add: BossEventUpdateType.Add,
    remove: BossEventUpdateType.Remove,
    progress: BossEventUpdateType.UpdatePercent,
    name: BossEventUpdateType.UpdateName
} as const satisfies Record<BossBarChange, BossEventUpdateType>;

/**
 * The edition-neutral name of a Bedrock boss bar color, which `BossBar`'s options take.
 * @param color - The Bedrock color.
 * @returns Its name, or pink, the wire default, for a number Bedrock does not define.
 */
export const shownBossBarColorOf = (color: BossBarColor): ShownBossBarColor =>
    COLORS.find(([, bedrock]) => bedrock === color)?.[0] ?? 'pink';

/**
 * The edition-neutral name of a Bedrock boss bar overlay, which `BossBar`'s options take.
 * @param overlay - The Bedrock overlay.
 * @returns Its name, or one undivided bar for a number Bedrock does not define.
 */
export const shownBossBarStyleOf = (overlay: BossBarOverlay): ShownBossBarStyle =>
    OVERLAYS.find(([, bedrock]) => bedrock === overlay)?.[0] ?? 'progress';

/**
 * A boss bar change as Bedrock's `BossEvent`. Every event fills every field, as the flat layout
 * since protocol 2193 requires, with `Filtered Name` empty.
 * @param change - What changed.
 * @param bar - The bar after the change.
 * @returns The packet.
 */
export const bossEventOf = (change: BossBarChange, bar: ShownBossBar): BossEventPacket => {
    const packet = new BossEventPacket();
    packet.targetActorId = bar.actorUniqueId;
    packet.eventType = BEDROCK_EVENT[change];
    packet.name = bar.title;
    packet.filteredName = '';
    packet.healthPercent = bar.progress;
    packet.color = COLORS.find(([name]) => name === bar.color)?.[1] ?? BossBarColor.Pink;
    packet.overlay = OVERLAYS.find(([name]) => name === bar.style)?.[1] ?? BossBarOverlay.Progress;
    return packet;
};
