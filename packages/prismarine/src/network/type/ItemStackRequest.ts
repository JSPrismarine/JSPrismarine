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
    /** Amount, for the actions that move or remove a number of items. */
    count?: number;
    source?: ItemStackRequestSlotInfo;
    destination?: ItemStackRequestSlotInfo;
    /** `CREATIVE_CREATE`: which entry of the creative menu, as sent in `CreativeContentPacket`. */
    creativeItemNetId?: number;
    /** Times Crafted, for the crafting actions that carry one. */
    repetitions?: number;
    /** `MINE_BLOCK`: the hotbar slot the block was being mined with. */
    hotbarSlot?: number;
    /** The crafting actions: which recipe, as numbered by `CraftingDataPacket`. */
    recipeNetId?: number;
}

/**
 * ItemStackRequest: a batch of actions the client wants applied together and answered together.
 *
 * Wire order: Client Request Id (varint32), Actions (varuint count, then each action),
 * Strings To Filter (varuint count, then strings), StringsToFilterOrigin (int32 LE).
 */
export interface ItemStackRequest {
    /** Client Request Id. The response names the same id. */
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
 * The optional is one presence byte followed by a uint32 LE when present. The 2193 docs
 * page shows Dynamic ID as a plain uint32 and only records the optional from 2207 on, but
 * gophertunnel and the live 1.26.50 client both write the presence byte.
 */
const readFullContainerName = (stream: BinaryStream): FullContainerName => ({
    containerId: stream.readByte(),
    dynamicId: stream.readBoolean() ? stream.readIntLE() : null
});

/**
 * Reads an ItemStackRequestSlotInfo: Full container name, Slot, Net Id Variant.
 *
 * Net Id Variant is an `ItemStackNetIdVariant`, four fixed bytes as int32 LE and not a
 * varint. Every other net id variant in a request has the same shape: the one a mined block
 * names and the recipe net id of a repair.
 */
const readSlotInfo = (stream: BinaryStream): ItemStackRequestSlotInfo => ({
    container: readFullContainerName(stream),
    slotId: stream.readByte(),
    stackNetId: stream.readIntLE()
});

/**
 * Steps over one ingredient of an auto-crafted recipe.
 *
 * This is the client's form of an item descriptor, which differs from the server's. It is a
 * varuint variant index, the same value again as the Descriptor Type byte, the descriptor
 * named by the index, then a uint16 count. The server's form, which `CraftingDataPacket`
 * carries and `RecipeIngredientCodec` writes, spells the kind out as a string and ends in a
 * varint. Nothing here uses the ingredients, so they are read for their length and dropped.
 */
const skipRequestIngredient = (stream: BinaryStream): void => {
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

    stream.readUnsignedShortLE(); // Count.
};

/**
 * Steps over one ItemStackRequestNetworkItemInstanceDescriptor of a deprecated crafting result.
 *
 * Wire order: Item Descriptor (as in a request ingredient), Stack size (int16 LE), Block
 * Runtime Id (varuint), User Data Buffer (varuint length then bytes). Only the Empty and
 * ItemName descriptors are accepted, because a result is a specific item.
 */
const skipRequestItem = (stream: BinaryStream): void => {
    const kind = stream.readUnsignedVarInt();
    stream.readByte(); // Descriptor Type, the same value as the variant index.

    if (kind === ItemDescriptorType.ITEM_NAME) {
        NetworkUtil.readString(stream); // Full Name.
        stream.readVarInt(); // Aux Value.
    } else if (kind !== ItemDescriptorType.EMPTY) {
        throw new Error(`Unknown item descriptor kind ${kind} in a crafting result`);
    }

    stream.readShortLE(); // Stack size.
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
            stream.readByte(); // Results Slot: which of several results was picked.
            return { type };

        case ItemStackRequestActionType.LAB_TABLE_COMBINE:
        case ItemStackRequestActionType.CRAFTING_NON_IMPLEMENTED_DEPRECATED:
            return { type };

        case ItemStackRequestActionType.BEACON_PAYMENT:
            stream.readVarInt(); // Primary Effect.
            stream.readVarInt(); // Secondary Effect.
            return { type };

        case ItemStackRequestActionType.MINE_BLOCK: {
            const hotbarSlot = stream.readVarInt(); // Hotbar Slot.
            stream.readVarInt(); // Predicted Durability.
            stream.readIntLE(); // Net Id Variant, four fixed bytes, see `readSlotInfo`.
            return { type, hotbarSlot };
        }

        case ItemStackRequestActionType.CRAFTING_RECIPE: {
            const recipeNetId = stream.readUnsignedVarInt(); // Recipe Net Id.
            return { type, recipeNetId, repetitions: stream.readByte() }; // Times Crafted.
        }

        case ItemStackRequestActionType.CRAFTING_RECIPE_AUTO: {
            stream.readUnsignedVarInt(); // Recipe Net Id.
            const repetitions = stream.readByte(); // Times Crafted.
            // Ingredients: varuint count, then one request ingredient each.
            for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) skipRequestIngredient(stream);
            return { type, repetitions };
        }

        case ItemStackRequestActionType.CREATIVE_CREATE:
            return {
                type,
                creativeItemNetId: stream.readUnsignedVarInt(), // Creative Item Net Id.
                repetitions: stream.readByte() // Times Crafted.
            };

        case ItemStackRequestActionType.CRAFTING_RECIPE_OPTIONAL:
            stream.readUnsignedVarInt(); // Recipe Net Id.
            stream.readIntLE(); // Filtered String Index: which filter string carries the new name.
            return { type };

        case ItemStackRequestActionType.CRAFT_REPAIR_AND_DISENCHANT: {
            stream.readIntLE(); // Recipe Net Id, a net id variant, four fixed bytes.
            const repetitions = stream.readByte(); // Times Crafted.
            stream.readVarInt(); // Repair Cost.
            return { type, repetitions };
        }

        case ItemStackRequestActionType.CRAFTING_LOOM:
            NetworkUtil.readString(stream); // Pattern Id.
            stream.readByte(); // Times Crafted.
            return { type };

        case ItemStackRequestActionType.CRAFTING_RESULTS_DEPRECATED: {
            // Craft Results: varuint count, then one network item instance descriptor each.
            for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) skipRequestItem(stream);
            stream.readByte(); // Times Crafted.
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
 */
export const readItemStackRequest = (stream: BinaryStream): ItemStackRequest => {
    const requestId = stream.readVarInt(); // Client Request Id.

    const actions: ItemStackRequestAction[] = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
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
