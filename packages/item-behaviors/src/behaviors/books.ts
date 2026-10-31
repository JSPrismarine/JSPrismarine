/**
 * Items whose use opens something, plays something, or holds something.
 *
 * Four families with nothing in common but their shape: a use that hands the
 * client a screen, a sound, or a container. Each is short, and each is one of
 * the families no component in either edition expresses.
 */
import type { ItemHooks } from '@jsprismarine/items';
import { instrument, recipes } from '@jsprismarine/items';

import type { ItemBehaviorSpec } from '../behavior';
import { canPerform, consumeOne, onCooldown, withCooldown } from '../behavior';

/** How long a goat horn's cooldown runs, from `InstrumentItem`, in ticks. */
export const GOAT_HORN_COOLDOWN_TICKS = 140;

/** The screen a writable book opens. */
export const BOOK_EDIT_SCREEN = 'minecraft:book_edit';

/** The screen a written book opens. */
export const BOOK_READ_SCREEN = 'minecraft:book_read';

/** The screen a bundle opens, which Bedrock draws as the bundle interaction. */
export const BUNDLE_SCREEN = 'minecraft:bundle';

/** A book and quill, which opens its editor. */
export const writableBookBehavior: ItemBehaviorSpec = {
    name: 'vanilla:writable_book',
    hooks: ['onUse'],
    create: (context) => {
        if (!('minecraft:writable_book_content' in context.components)) return {};

        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            context.world.perform({ kind: 'open-screen', source, screen: BOOK_EDIT_SCREEN, item: itemStack.copy() });
            return {};
        };

        return { onUse };
    }
};

/**
 * A written book, which opens for reading, and the knowledge book, which
 * grants the recipes in `minecraft:recipes` and is consumed.
 */
export const writtenBookBehavior: ItemBehaviorSpec = {
    name: 'vanilla:written_book',
    hooks: ['onUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            const unlocked = itemStack.params(recipes);
            if (unlocked !== undefined) {
                if (!canPerform(context.world, 'open-screen')) return {};
                context.world.perform({
                    kind: 'open-screen',
                    source,
                    screen: 'minecraft:recipe_unlock',
                    item: itemStack.copy(1)
                });
                return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
            }

            context.world.perform({ kind: 'open-screen', source, screen: BOOK_READ_SCREEN, item: itemStack.copy() });
            return {};
        };

        return { onUse };
    }
};

/**
 * A goat horn, which plays the instrument `minecraft:instrument` names and
 * then waits out its cooldown.
 *
 * The component writes the instrument either as an id or inline with its own
 * `sound_event`, `use_duration` and `range`, so both forms are read.
 */
export const goatHornBehavior: ItemBehaviorSpec = {
    name: 'vanilla:goat_horn',
    hooks: ['onUse'],
    create: (context) => {
        if (!('minecraft:instrument' in context.components)) return {};

        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            if (onCooldown(context.world, itemStack, source)) return undefined;

            const named = itemStack.params(instrument);
            const sound =
                typeof named === 'string'
                    ? named.replace('minecraft:', 'minecraft:item.goat_horn.sound.')
                    : 'minecraft:item.goat_horn.sound.0';

            context.world.perform({
                kind: 'play-sound',
                sound,
                position: context.world.stateOf(source).position
            });
            context.world.perform({
                kind: 'start-cooldown',
                source,
                group: 'minecraft:goat_horn',
                ticks: GOAT_HORN_COOLDOWN_TICKS
            });
            return withCooldown(context.world, itemStack, source, { cooldownTicks: GOAT_HORN_COOLDOWN_TICKS });
        };

        return { onUse };
    }
};

/** A bundle, which opens as a container rather than doing anything to the world. */
export const bundleBehavior: ItemBehaviorSpec = {
    name: 'vanilla:bundle',
    hooks: ['onUse'],
    create: (context) => {
        if (!('minecraft:bundle_contents' in context.components)) return {};

        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            context.world.perform({ kind: 'open-screen', source, screen: BUNDLE_SCREEN, item: itemStack.copy() });
            return {};
        };

        return { onUse };
    }
};

/** Every behavior this file declares. */
export const BOOK_BEHAVIORS: readonly ItemBehaviorSpec[] = [
    writableBookBehavior,
    writtenBookBehavior,
    goatHornBehavior,
    bundleBehavior
];
