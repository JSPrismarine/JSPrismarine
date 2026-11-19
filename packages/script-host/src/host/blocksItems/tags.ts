/**
 * The tags of the objects the block, item and container members make, beside the shared ones in
 * `serverObjects.ts`. This area's tags are 4001 to 4999, clear of the signal tags, which count up
 * from 100, and of the ranges the other areas' tags take.
 */
export const BLOCK_ITEM_TAG = {
    /** A `BlockVolume` or `ListBlockVolume`; its state is a {@link VolumeState}. */
    volume: 4001,
    /** A `BlockLocationIterator`; its state is the locations it has left. */
    locationIterator: 4002,
    /** A block component; its state names the component and its block. */
    blockComponent: 4003,
    /** An item component; its state is the component's id, and the stack it reads is linked to it. */
    itemComponent: 4004,
    /** An enchantment type; its state is the enchantment's id. */
    enchantmentType: 4005,
    /** A potion effect type; its state is the effect's id. */
    potionEffectType: 4006,
    /** A potion delivery type; its state is the delivery's id. */
    potionDeliveryType: 4007,
    /** A block state type; its state is the state's name. */
    blockStateType: 4008
} as const;
