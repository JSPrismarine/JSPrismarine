/**
 * Which slot of a block's own inventory each `Container Name` on an `ItemStackRequest` points at.
 *
 * `network/handler/workstation.ts` answers the same question for the enchanting table and the
 * anvil, whose two slots belong to the player rather than to the block. This module answers it
 * for the blocks that store something: a chest's 27 slots, a furnace's input, fuel and output,
 * a brewing stand's three bottles and its ingredient and fuel.
 *
 * The client does not number a block's slots in one flat run. A chest names its whole range
 * under one container and numbers the slots inside it, while a furnace gives each of its three
 * slots a container of its own. So the table below is a list of segments per screen: a
 * container name, the block slot its first slot is, and how many slots follow. A screen whose
 * range is open ended - every storage screen - declares no count and takes the block's own slot
 * count instead.
 *
 * The block slot numbering is Bedrock's own, because that is what the `Items` list in the block
 * entity is written in and what a vanilla tool reads back: a furnace is input, fuel, output, and
 * a brewing stand is three bottles, then the ingredient, then the fuel.
 */
import { ContainerUiId, WindowTypes } from '@jsprismarine/minecraft';

/** One run of a screen's slots that the client names under a single container. */
interface SlotSegment {
    /**
     * The `Container Name` the client uses for this run.
     *
     * More than one for a storage screen: a barrel and a shulker box each have a name of their
     * own beside `LEVEL_ENTITY_CONTAINER`, and which one a client sends is not worth guessing
     * at, so all of them resolve onto the same slots.
     */
    readonly containers: readonly ContainerUiId[];
    /** The block slot this run starts at. */
    readonly first: number;
    /** How many slots are in the run, or undefined for "the rest of the block's slots". */
    readonly count?: number;
}

/** The container names a plain storage screen answers to, in the order a response prefers. */
const STORAGE_CONTAINERS = [
    ContainerUiId.LEVEL_ENTITY_CONTAINER,
    ContainerUiId.BARREL_CONTAINER,
    ContainerUiId.SHULKER_BOX_CONTAINER
] as const;

/** One whole block's worth of slots under the storage container names. */
const STORAGE: readonly SlotSegment[] = [{ containers: STORAGE_CONTAINERS, first: 0 }];

/** A furnace's three, with the ingredient container differing per furnace kind. */
const furnace = (ingredient: ContainerUiId): readonly SlotSegment[] => [
    { containers: [ingredient], first: 0, count: 1 },
    { containers: [ContainerUiId.FURNACE_FUEL_CONTAINER], first: 1, count: 1 },
    { containers: [ContainerUiId.FURNACE_RESULT_CONTAINER], first: 2, count: 1 }
];

/** How each screen's slots are named, by the screen. A screen absent here stores nothing. */
const SEGMENTS: Partial<Record<WindowTypes, readonly SlotSegment[]>> = {
    [WindowTypes.CONTAINER]: STORAGE,
    [WindowTypes.DISPENSER]: STORAGE,
    [WindowTypes.DROPPER]: STORAGE,
    [WindowTypes.HOPPER]: STORAGE,
    [WindowTypes.DECORATED_POT]: STORAGE,
    [WindowTypes.CRAFTER]: [{ containers: [ContainerUiId.CRAFTER_LEVEL_ENTITY_CONTAINER], first: 0 }],
    [WindowTypes.FURNACE]: furnace(ContainerUiId.FURNACE_INGREDIENT_CONTAINER),
    [WindowTypes.BLAST_FURNACE]: furnace(ContainerUiId.BLAST_FURNACE_INGREDIENT_CONTAINER),
    [WindowTypes.SMOKER]: furnace(ContainerUiId.SMOKER_INGREDIENT_CONTAINER),
    [WindowTypes.BREWING_STAND]: [
        { containers: [ContainerUiId.BREWING_STAND_RESULT_CONTAINER], first: 0, count: 3 },
        { containers: [ContainerUiId.BREWING_STAND_INPUT_CONTAINER], first: 3, count: 1 },
        { containers: [ContainerUiId.BREWING_STAND_FUEL_CONTAINER], first: 4, count: 1 }
    ]
};

/**
 * The slots a player may put something into but never take it out of, by the screen.
 *
 * A furnace's output is the only one in the game: vanilla refuses a stack dropped onto it
 * because what lands there is what the smelt produced. A brewing stand's three bottle slots look
 * like outputs and are not - a player fills them by hand - so they are absent here.
 */
const TAKE_ONLY: Partial<Record<WindowTypes, ReadonlySet<number>>> = {
    [WindowTypes.FURNACE]: new Set([2]),
    [WindowTypes.BLAST_FURNACE]: new Set([2]),
    [WindowTypes.SMOKER]: new Set([2])
};

/** Whether a screen draws slots the block itself stores. */
export const screenStoresSlots = (screen: WindowTypes): boolean => SEGMENTS[screen] !== undefined;

/**
 * The block slot one request names, or null when the request names something else.
 *
 * @param screen - The `Container Type` the client has open.
 * @param containerId - The `Container Name` off the request.
 * @param slotId - The slot within that container, as the client numbers it.
 * @param size - How many slots the block has, which bounds an open-ended segment.
 */
export const blockSlotOf = (screen: WindowTypes, containerId: number, slotId: number, size: number): number | null => {
    const segments = SEGMENTS[screen];
    if (segments === undefined) return null;
    if (!Number.isInteger(slotId) || slotId < 0) return null;

    for (const segment of segments) {
        if (!segment.containers.includes(containerId)) continue;

        const slot = segment.first + slotId;
        const end = segment.count === undefined ? size : Math.min(size, segment.first + segment.count);
        return slot < end ? slot : null;
    }

    return null;
};

/** What the client calls one block slot, which is what an `ItemStackResponse` has to answer in. */
export const blockSlotName = (screen: WindowTypes, slot: number): { containerId: number; slotId: number } => {
    const segments = SEGMENTS[screen] ?? STORAGE;

    for (const segment of segments) {
        if (slot < segment.first) continue;
        if (segment.count !== undefined && slot >= segment.first + segment.count) continue;

        // The first name of the run: a response has to pick one, and `LEVEL_ENTITY_CONTAINER`
        // is the one every storage screen answers to.
        return {
            containerId: segment.containers[0] ?? ContainerUiId.LEVEL_ENTITY_CONTAINER,
            slotId: slot - segment.first
        };
    }

    return { containerId: ContainerUiId.LEVEL_ENTITY_CONTAINER, slotId: slot };
};

/** Whether a slot of a screen refuses anything a player tries to put in it. */
export const isTakeOnlySlot = (screen: WindowTypes, slot: number): boolean => TAKE_ONLY[screen]?.has(slot) === true;
