import type { JavaBehavior, JavaBehaviorKind } from './javaRegistryClasses.ts';
import { javaBehaviorsOf, javaRegisteredClassOf } from './javaRegistryClasses.ts';

/**
 * Java Edition's item classes, read out of the pinned server jar: which class each item id
 * constructs, and which of `Item`'s hooks that class overrides.
 *
 * Much of an item's behavior is in its components, which `items.behavior` reads from the item
 * table. The rest is in its class: a bucket's `use`, flint and steel's `useOn`, shears'
 * `interactLivingEntity`, a bow's `releaseUsing`. Reading the overrides from the class file gives
 * those items rows too.
 */

const ITEM_PACKAGE = 'net/minecraft/world/item/';
const BASE_ITEM = `${ITEM_PACKAGE}Item`;
/**
 * The item that places a block, whose own hooks are the `places-block` aspect. A subclass of it,
 * such as a bed or a sign, still adds the hooks it overrides.
 */
const BLOCK_ITEM = `${ITEM_PACKAGE}BlockItem`;

/** `Items`, whose initializer registers every item. */
const ITEMS = {
    owner: `${ITEM_PACKAGE}Items`,
    // A colored or copper family of items is a `ColorCollection` or `WeatheringCopperCollection`,
    // which are in the block package.
    entryPackages: [ITEM_PACKAGE, 'net/minecraft/world/level/block/'],
    helpers: {
        registerItem: BASE_ITEM,
        registerBlock: BLOCK_ITEM,
        registerSpawnEgg: `${ITEM_PACKAGE}SpawnEggItem`
    },
    fallback: BASE_ITEM
};

/**
 * The binary name of the class a Java item runs, such as
 * `net/minecraft/world/item/FlintAndSteelItem` for `minecraft:flint_and_steel`, or undefined when
 * the registrations name no class for it.
 */
export const javaItemClassOf = (javaId: string): string | undefined => javaRegisteredClassOf(ITEMS, javaId);

/**
 * The behavior kinds a Java item class can add to the plain item, by the hooks of `Item` that
 * carry them. Hooks that only shape how an item looks or reads (`isFoil`, `getName`,
 * `appendHoverText`, `getBarColor`) carry no server behavior and are not listed.
 */
export const JAVA_ITEM_BEHAVIOR_KINDS: readonly JavaBehaviorKind[] = [
    { aspect: 'use', description: 'what using it in the air does', hooks: ['use'] },
    { aspect: 'use-on-block', description: 'what using it on a block does', hooks: ['useOn'] },
    { aspect: 'use-on-entity', description: 'what using it on a mob does', hooks: ['interactLivingEntity'] },
    {
        aspect: 'charged-use',
        description: 'what holding it in use and letting go or finishing does',
        hooks: ['releaseUsing', 'onUseTick', 'finishUsingItem']
    },
    { aspect: 'attack', description: 'what hitting a mob with it does', hooks: ['hurtEnemy', 'postHurtEnemy'] },
    {
        aspect: 'mining',
        description: 'what breaking a block with it does to it',
        hooks: ['mineBlock', 'canDestroyBlock']
    },
    { aspect: 'inventory-tick', description: 'what it does each tick it is carried', hooks: ['inventoryTick'] },
    {
        aspect: 'inventory-click',
        description: 'what clicking it onto or with another stack in an inventory does',
        hooks: ['overrideStackedOnOther', 'overrideOtherStackedOnMe']
    },
    { aspect: 'dropped', description: 'what it does as a dropped item entity', hooks: ['onDestroyed'] }
];

/**
 * The behavior kinds a Java item's class adds to the plain item, or to the plain block item for an
 * item that places a block.
 */
export const javaItemBehaviors = (javaId: string): readonly JavaBehavior[] => {
    const className = javaItemClassOf(javaId);
    return className === undefined ? [] : javaBehaviorsOf(className, [BASE_ITEM, BLOCK_ITEM], JAVA_ITEM_BEHAVIOR_KINDS);
};
