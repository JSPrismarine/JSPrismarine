import type BinaryStream from '@jsprismarine/binaryutils';
import { ContainerUiId, ItemDescriptorType, ItemStackRequestActionType } from '@jsprismarine/minecraft';
import { NetworkUtil } from '../NetworkUtil';

// Both enums are generated from Mojang's protocol documentation and live in
// `@jsprismarine/minecraft`. They are re-exported here so the handler and the tests can
// import them next to the reader.

/** The kind of each step in a request. On the wire it is the byte after the variant index. */
export { ItemStackRequestActionType };

/**
 * The containers a slot can name, as the Container Name byte of a full container name.
 *
 * Only a few are acted on by this server. The rest still have to be read, because a slot in
 * a container nobody implements keeps the stream aligned for the actions after it.
 */
export { ContainerUiId };

/**
 * The most actions one request carries. The docs cap `Actions` at 100 entries, so a count
 * above that is a malformed request rather than a long one, and reading it would mean
 * allocating for whatever number a stranger wrote.
 */
export const MAX_REQUEST_ACTIONS = 100;

/** FullContainerName: a Container Name byte and, when present, the Dynamic ID of that container. */
export interface FullContainerName {
    /** Container Name, a `ContainerUiId` value written as a uint8. */
    containerId: number;
    /** Dynamic ID, a uint32 that tells apart several open containers of the same kind. Null when absent. */
    dynamicId: number | null;
}

/** ItemStackRequestSlotInfo: which container, which slot, and which stack the client thinks is there. */
export interface ItemStackRequestSlotInfo {
    /** Full container name. */
    container: FullContainerName;
    /** Slot, a uint8 index inside the container. */
    slotId: number;
    /** Net Id Variant, the stack net id the client believes the slot holds. */
    stackNetId: number;
}

/**
 * One action of a request.
 *
 * Every action type is decoded, including the ones nothing acts on. An action cannot be
 * skipped without knowing its length, and its length is only known by reading it. A type
 * left unread does not cost that action, it costs the rest of the packet.
 */
export interface ItemStackRequestAction {
    type: ItemStackRequestActionType;
    /** Amount, for the actions that move or remove a number of items. The docs bound it to 1 to 64. */
    count?: number;
    source?: ItemStackRequestSlotInfo;
    destination?: ItemStackRequestSlotInfo;
    /** `CREATIVE_CREATE`: Creative Item Net Id, which entry of the creative menu, as sent in `CreativeContentPacket`. */
    creativeItemNetId?: number;
    /** Number of requested crafts, for the crafting actions that carry one. */
    repetitions?: number;
    /** `MINE_BLOCK`: Slot, the hotbar slot the block was being mined with. */
    hotbarSlot?: number;
    /** `CRAFTING_RECIPE` and `CRAFTING_RECIPE_AUTO`: Recipe Net Id, as numbered by `CraftingDataPacket`. */
    recipeNetId?: number;
}

/**
 * ItemStackRequest: a batch of actions the client wants applied together and answered together.
 *
 * Wire order: Client Request Id (varint32), Actions (varuint count, then each action),
 * Strings To Filter (varuint count, then strings), StringsToFilterOrigin (int32 LE).
 */
export interface ItemStackRequest {
    /** Client Request Id. A client makes these up negative and odd; the response names the same id. */
    requestId: number;
    /** Actions, in the order the client wants them applied. */
    actions: ItemStackRequestAction[];
    /** Strings To Filter, text the player typed that the server may send to profanity filtering. */
    filterStrings: string[];
    /** StringsToFilterOrigin, a `TextProcessingEventOrigin` value. */
    filterStringCause: number;
}

/**
 * Reads a FullContainerName: the Container Name byte, then the Dynamic ID as an optional.
 *
 * The optional is one presence byte followed by a uint32 LE when present. The 2193 schema
 * lists Dynamic ID as a required uint32 and only records the optional from 2207 on, but
 * gophertunnel at 2193 and the live 1.26.50 client both write the presence byte.
 */
const readFullContainerName = (stream: BinaryStream): FullContainerName => ({
    containerId: stream.readByte(),
    dynamicId: stream.readBoolean() ? stream.readUnsignedIntLE() : null
});

/**
 * Reads an ItemStackNetIdVariant: four fixed bytes, as an int32 LE.
 *
 * Mojang's 2193 note calls this a tagged variant of the three id types, and the schema gives
 * it no fields at all. What the client writes is four bytes: gophertunnel has read them that
 * way since protocol 2168, when the client stopped sending a varint here, and the handler's
 * notes on what a live client sends were taken against this layout. The sign still tells the
 * kinds apart: a positive value is a stack id the server handed out, a negative odd one is a
 * request id the client made up, and a negative even one below -1 is a legacy request id.
 */
const readNetIdVariant = (stream: BinaryStream): number => stream.readIntLE();

/** Reads an ItemStackRequestSlotInfo: Full container name, Slot, Net Id Variant. */
const readSlotInfo = (stream: BinaryStream): ItemStackRequestSlotInfo => ({
    container: readFullContainerName(stream),
    slotId: stream.readByte(),
    stackNetId: readNetIdVariant(stream)
});

/**
 * Steps over one Item Descriptor in the form a request carries.
 *
 * This is the client's form of a descriptor, which differs from the server's. It is a Cereal
 * variant: a varuint variant index, the same value again as the Descriptor Type byte, then
 * the fields of the descriptor the index names. `Empty` has none; `ItemName` is Full Name
 * (string) and Aux Value (varint); `Molang` is Tag Expression (string) and Molang Version
 * (int16 LE); `ItemTag` is Item Tag (string). The server's form, which `CraftingDataPacket`
 * carries and `RecipeIngredientCodec` writes, spells the kind out as a string instead.
 * Nothing here uses the descriptor, so it is read for its length and dropped.
 * @throws when the variant index names no descriptor, because from there the stream cannot be trusted.
 */
const skipRequestDescriptor = (stream: BinaryStream): void => {
    const kind = stream.readUnsignedVarInt();
    stream.readByte(); // Descriptor Type, the same value as the variant index.

    switch (kind) {
        case ItemDescriptorType.EMPTY:
            break;
        case ItemDescriptorType.ITEM_NAME:
            NetworkUtil.readString(stream); // Full Name.
            stream.readVarInt(); // Aux Value.
            break;
        case ItemDescriptorType.MOLANG:
            NetworkUtil.readString(stream); // Tag Expression.
            stream.readShortLE(); // Molang Version.
            break;
        case ItemDescriptorType.ITEM_TAG:
            NetworkUtil.readString(stream); // Item Tag.
            break;
        default:
            throw new Error(`Unknown item descriptor kind ${kind} in an item stack request`);
    }
};

/** Steps over one RecipeIngredient of an auto craft: Item Descriptor, then StackSize as a uint16 LE. */
const skipRequestIngredient = (stream: BinaryStream): void => {
    skipRequestDescriptor(stream);
    stream.readUnsignedShortLE(); // StackSize.
};

/**
 * Steps over one ItemStackRequestNetworkItemInstanceDescriptor of a deprecated crafting result.
 *
 * Wire order: Item Descriptor (as in an ingredient), Stack size (uint16 LE), Block Runtime Id
 * (varuint), User Data Buffer (varuint length then bytes).
 */
const skipRequestItem = (stream: BinaryStream): void => {
    skipRequestDescriptor(stream);
    stream.readUnsignedShortLE(); // Stack size.
    stream.readUnsignedVarInt(); // Block Runtime Id.
    stream.read(stream.readUnsignedVarInt()); // User Data Buffer: nbt, can place on, can break.
};

/**
 * The first variant index that does not equal the action type it stands for.
 *
 * On the wire an action opens with a varuint variant index, its position in the oneOf list
 * of action types. That list leaves out the two deprecated container actions, types 7 and
 * 8, which no client ever sent. So from the lab table on the index runs two behind the
 * type: index 7 is the lab table, type 9.
 */
const FIRST_SELECTOR_PAST_THE_GAP = 7;
const SELECTOR_GAP = 2;

/** The action type an action's position in the variant list stands for. */
const actionTypeOf = (variant: number): ItemStackRequestActionType =>
    variant >= FIRST_SELECTOR_PAST_THE_GAP ? variant + SELECTOR_GAP : variant;

/** Amount, Source, Destination. Shared by take and place. */
const readTakeOrPlace = (stream: BinaryStream, type: ItemStackRequestActionType): ItemStackRequestAction => ({
    type,
    count: stream.readByte(),
    source: readSlotInfo(stream),
    destination: readSlotInfo(stream)
});

/** Amount, Source. Shared by destroy and by consuming a crafting input. */
const readDisappear = (stream: BinaryStream, type: ItemStackRequestActionType): ItemStackRequestAction => ({
    type,
    count: stream.readByte(),
    source: readSlotInfo(stream)
});

/**
 * Reads one action's payload. The variant index and the Action type byte have already been
 * taken off the stream.
 * @throws when the type is unknown, because from there the stream cannot be trusted.
 */
const readAction = (stream: BinaryStream, type: ItemStackRequestActionType): ItemStackRequestAction => {
    switch (type) {
        case ItemStackRequestActionType.TAKE:
        case ItemStackRequestActionType.PLACE:
            return readTakeOrPlace(stream, type);

        case ItemStackRequestActionType.SWAP:
            return { type, source: readSlotInfo(stream), destination: readSlotInfo(stream) };

        case ItemStackRequestActionType.DROP: {
            const action = { type, count: stream.readByte(), source: readSlotInfo(stream) };
            stream.readBoolean(); // Randomly. Only meaningful for a dropped stack scattering.
            return action;
        }

        case ItemStackRequestActionType.DESTROY:
        case ItemStackRequestActionType.CRAFTING_CONSUME_INPUT:
            return readDisappear(stream, type);

        case ItemStackRequestActionType.CRAFTING_CREATE_SPECIFIC_RESULT:
            stream.readByte(); // Results Index: which of several results was picked.
            return { type };

        case ItemStackRequestActionType.LAB_TABLE_COMBINE:
        case ItemStackRequestActionType.CRAFTING_NON_IMPLEMENTED_DEPRECATED:
            return { type }; // Dataless: only the action type byte is serialized.

        case ItemStackRequestActionType.BEACON_PAYMENT:
            stream.readVarInt(); // Primary Effect Id.
            stream.readVarInt(); // Secondary Effect Id.
            return { type };

        case ItemStackRequestActionType.MINE_BLOCK: {
            const hotbarSlot = stream.readVarInt(); // Slot.
            stream.readVarInt(); // Predicted Durability.
            readNetIdVariant(stream); // Net Id Variant.
            return { type, hotbarSlot };
        }

        case ItemStackRequestActionType.CRAFTING_RECIPE: {
            const recipeNetId = stream.readUnsignedVarInt(); // Recipe Net Id.
            return { type, recipeNetId, repetitions: stream.readByte() }; // Number of requested crafts.
        }

        case ItemStackRequestActionType.CRAFTING_RECIPE_AUTO: {
            const recipeNetId = stream.readUnsignedVarInt(); // Recipe Net Id.
            const repetitions = stream.readByte(); // Number of requested crafts.
            // Ingredients: varuint count, then one request ingredient each.
            for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) skipRequestIngredient(stream);
            return { type, recipeNetId, repetitions };
        }

        case ItemStackRequestActionType.CREATIVE_CREATE:
            return {
                type,
                creativeItemNetId: stream.readUnsignedVarInt(), // Creative Item Net Id.
                repetitions: stream.readByte() // Number of requested crafts.
            };

        case ItemStackRequestActionType.CRAFTING_RECIPE_OPTIONAL:
            stream.readUnsignedVarInt(); // Recipe Net Id.
            stream.readIntLE(); // Filtered String Index: which filter string carries the new name.
            return { type };

        case ItemStackRequestActionType.CRAFT_REPAIR_AND_DISENCHANT: {
            readNetIdVariant(stream); // Recipe Net Id, a net id variant rather than a recipe net id.
            const repetitions = stream.readByte(); // Number of requested crafts.
            stream.readVarInt(); // Repair Cost.
            return { type, repetitions };
        }

        case ItemStackRequestActionType.CRAFTING_LOOM:
            NetworkUtil.readString(stream); // Pattern Name Id.
            stream.readByte(); // Num Crafts.
            return { type };

        case ItemStackRequestActionType.CRAFTING_RESULTS_DEPRECATED: {
            // Craft Results: varuint count, then one network item instance descriptor each.
            for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) skipRequestItem(stream);
            stream.readByte(); // Num Crafts.
            return { type };
        }

        default:
            throw new Error(`Unknown item stack request action type ${type}`);
    }
};

/**
 * Reads one ItemStackRequest: Client Request Id, Actions, Strings To Filter,
 * StringsToFilterOrigin.
 *
 * Each action opens with two numbers that mean the same thing: a varuint variant index,
 * which is the action's position in the oneOf list, and then the Action type as a byte. The
 * variant index is what is dispatched on, see {@link actionTypeOf} for why the two differ
 * from the lab table on, and the byte is read and dropped.
 * @throws when the action count is above {@link MAX_REQUEST_ACTIONS}, or an action or
 * descriptor type is unknown.
 */
export const readItemStackRequest = (stream: BinaryStream): ItemStackRequest => {
    const requestId = stream.readVarInt(); // Client Request Id.

    const actionCount = stream.readUnsignedVarInt();
    if (actionCount > MAX_REQUEST_ACTIONS) {
        throw new RangeError(
            `Item stack request ${requestId} names ${actionCount} actions; the docs allow at most ${MAX_REQUEST_ACTIONS}`
        );
    }

    const actions: ItemStackRequestAction[] = [];
    for (let i = 0; i < actionCount; i++) {
        const type = actionTypeOf(stream.readUnsignedVarInt()); // Variant index.
        stream.readByte(); // Action type, the same action as a byte.
        actions.push(readAction(stream, type));
    }

    const filterStrings: string[] = []; // Strings To Filter.
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        filterStrings.push(NetworkUtil.readString(stream));
    }

    return { requestId, actions, filterStrings, filterStringCause: stream.readIntLE() }; // StringsToFilterOrigin.
};
