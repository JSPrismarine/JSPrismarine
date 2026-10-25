/**
 * Activities: the named states a brain can be in, and the keys of its behavior table.
 *
 * Java registers 26 in `minecraft:activity`. A brain is in exactly one non-core activity at a time
 * plus every core activity, and `core` is the only core activity any vanilla mob declares.
 */

/** An activity. Equality is by name, as Java's `Activity.equals` is. */
export interface Activity {
    /** The registered name without its namespace, such as `admire_item`. */
    readonly name: string;
}

function activity(name: string): Activity {
    return { name };
}

/** The 26 entries of `minecraft:activity` in the 26.3 server jar, in registration order. */
export const Activities = {
    /** Always active alongside the current activity; never chosen by itself. */
    CORE: activity('core'),
    IDLE: activity('idle'),
    WORK: activity('work'),
    PLAY: activity('play'),
    REST: activity('rest'),
    MEET: activity('meet'),
    PANIC: activity('panic'),
    RAID: activity('raid'),
    PRE_RAID: activity('pre_raid'),
    HIDE: activity('hide'),
    FIGHT: activity('fight'),
    CELEBRATE: activity('celebrate'),
    ADMIRE_ITEM: activity('admire_item'),
    AVOID: activity('avoid'),
    RIDE: activity('ride'),
    PLAY_DEAD: activity('play_dead'),
    LONG_JUMP: activity('long_jump'),
    RAM: activity('ram'),
    TONGUE: activity('tongue'),
    SWIM: activity('swim'),
    LAY_SPAWN: activity('lay_spawn'),
    SNIFF: activity('sniff'),
    INVESTIGATE: activity('investigate'),
    ROAR: activity('roar'),
    EMERGE: activity('emerge'),
    DIG: activity('dig')
} as const;

/** Every registered activity, in registration order. */
export const ALL_ACTIVITIES: readonly Activity[] = Object.values(Activities);

/** Looks an activity up by its registered name. */
export function activityByName(name: string): Activity | undefined {
    return ALL_ACTIVITIES.find((candidate) => candidate.name === name);
}
