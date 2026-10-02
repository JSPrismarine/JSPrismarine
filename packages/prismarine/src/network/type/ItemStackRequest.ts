import type BinaryStream from '@jsprismarine/binaryutils';
import { ContainerUiId, ItemDescriptorType, ItemStackRequestActionType } from '@jsprismarine/minecraft';
import { NetworkUtil } from '../NetworkUtil';

/**
 * The containers a slot can name.
 *
 * Only the ones this server reasons about are named; the rest travel as plain numbers,
 * because a slot in a container nobody implements still has to be read to keep the stream
 * aligned.
 * @see https://github.com/pmmp/BedrockProtocol/blob/35.0.0%2Bbedrock-1.21.40/src/types/inventory/ContainerUIIds.php
 */
export { ItemStackRequestActionType };

// `ContainerUiId` is generated from Mojang's documentation and lives in
// `@jsprismarine/minecraft`. The copy that used to be here was transcribed from a second
// implementation and had six of the sixty-four - among them neither the cursor, which every
// drag passes through, nor the created-output a creative pick is taken from.
export { ContainerUiId };

// `ItemStackRequestActionType` is generated from Mojang's documentation and lives in
// `@jsprismarine/minecraft`. The copy that used to be here was transcribed from a second
// implementation and was six members short.

/** A container, and which one when several of a kind are open at once. */
export interface FullContainerName {
    containerId: number;
    dynamicId: number | null;
}

/** One end of a move: which container, which slot, and which stack the client thinks is there. */
export interface ItemStackRequestSlotInfo {
    container: FullContainerName;
    slotId: number;
    stackNetId: number;
}

/**
 * One step of a request.
 *
 * Every type is decoded, including the ones nothing acts on. An action cannot be skipped
 * without knowing its length, and its length is only known by reading it - so a type left
 * unread does not cost that action, it costs the rest of the packet.
 */
export interface ItemStackRequestAction {
    type: ItemStackRequestActionType;
    count?: number;
    source?: ItemStackRequestSlotInfo;
    destination?: ItemStackRequestSlotInfo;
    /** `CREATIVE_CREATE`: which entry of the creative menu, as sent in `CreativeContentPacket`. */
    creativeItemNetId?: number;
    repetitions?: number;
    /** `MINE_BLOCK`: the hotbar slot the block was being mined with. */
    hotbarSlot?: number;
    /** The crafting actions: which recipe, as numbered by `CraftingDataPacket`. */
    recipeNetId?: number;
}

/** A batch of steps the client wants applied together, and answered together. */
export interface ItemStackRequest {
    requestId: number;
    actions: ItemStackRequestAction[];
    filterStrings: string[];
    filterStringCause: number;
}

const readFullContainerName = (stream: BinaryStream): FullContainerName => ({
    containerId: stream.readByte(),
    dynamicId: stream.readBoolean() ? stream.readIntLE() : null
});

/**
 * Where a stack is, and which stack the client thinks it is.
 *
 * The stack net id is four fixed bytes - an `ItemStackNetIdVariant`, which the 2168
 * conversion of this packet left uncompressed - not the varint it was up to 748. So is every
 * other net id variant in a request: the one a mined block names, the one a repair names.
 */
const readSlotInfo = (stream: BinaryStream): ItemStackRequestSlotInfo => ({
    container: readFullContainerName(stream),
    slotId: stream.readByte(),
    stackNetId: stream.readIntLE()
});

/**
 * Steps over one ingredient of an auto-crafted recipe.
 *
 * The client's form of an item descriptor, which is not the server's: a selector, the same
 * number again as a byte, the descriptor named by the selector, then a two byte count. The
 * server's form - what `CraftingDataPacket` carries and `RecipeIngredientCodec` writes -
 * spells the kind out as a string instead, and ends in a varint. Nothing here uses the
 * ingredients, so they are read for their length and dropped.
 */
const skipRequestIngredient = (stream: BinaryStream): void => {
    const kind = stream.readUnsignedVarInt();
    stream.readByte(); // The kind again, as the legacy byte.

    switch (kind) {
        case ItemDescriptorType.EMPTY:
            break;
        case ItemDescriptorType.ITEM_NAME:
            NetworkUtil.readString(stream);
            stream.readVarInt(); // Aux value.
            break;
        case ItemDescriptorType.MOLANG:
            NetworkUtil.readString(stream);
            stream.readShortLE(); // MoLang version.
            break;
        case ItemDescriptorType.ITEM_TAG:
            NetworkUtil.readString(stream);
            break;
        default:
            throw new Error(`Unknown item descriptor kind ${kind} in an item stack request`);
    }

    stream.readUnsignedShortLE(); // Count.
};

/**
 * Steps over one item of a deprecated crafting result.
 *
 * Its own shape again: the descriptor of a request ingredient, but with a count of two
 * bytes, a block runtime id and the user data blob after it - and only ever an empty or a
 * named descriptor, because a result is a specific item.
 */
const skipRequestItem = (stream: BinaryStream): void => {
    const kind = stream.readUnsignedVarInt();
    stream.readByte(); // The kind again, as the legacy byte.

    if (kind === ItemDescriptorType.ITEM_NAME) {
        NetworkUtil.readString(stream);
        stream.readVarInt(); // Aux value.
    } else if (kind !== ItemDescriptorType.EMPTY) {
        throw new Error(`Unknown item descriptor kind ${kind} in a crafting result`);
    }

    stream.readShortLE(); // Count.
    stream.readUnsignedVarInt(); // Block runtime id.
    stream.read(stream.readUnsignedVarInt()); // User data: nbt, can place on, can break.
};

/**
 * The first selector that does not equal the type it stands for.
 *
 * On the wire an action is a selector - its index among the alternatives - and the list of
 * alternatives skips the two deprecated container actions, 7 and 8, which no client ever
 * sent. So from the lab table onwards the index runs two behind the type it means: selector
 * 7 is the lab table, type 9.
 */
const FIRST_SELECTOR_PAST_THE_GAP = 7;
const SELECTOR_GAP = 2;

/** The action type an action's position in the variant list stands for. */
const actionTypeOf = (variant: number): ItemStackRequestActionType =>
    variant >= FIRST_SELECTOR_PAST_THE_GAP ? variant + SELECTOR_GAP : variant;

/** `count`, then where from, then where to - shared by take and place. */
const readTakeOrPlace = (stream: BinaryStream, type: ItemStackRequestActionType): ItemStackRequestAction => ({
    type,
    count: stream.readByte(),
    source: readSlotInfo(stream),
    destination: readSlotInfo(stream)
});

/** `count`, then where from - shared by destroy and by consuming a crafting input. */
const readDisappear = (stream: BinaryStream, type: ItemStackRequestActionType): ItemStackRequestAction => ({
    type,
    count: stream.readByte(),
    source: readSlotInfo(stream)
});

/**
 * Reads one action, whose type has already been taken off the stream.
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
            stream.readBoolean(); // Randomly - only meaningful for a dropped stack scattering.
            return action;
        }

        case ItemStackRequestActionType.DESTROY:
        case ItemStackRequestActionType.CRAFTING_CONSUME_INPUT:
            return readDisappear(stream, type);

        case ItemStackRequestActionType.CRAFTING_CREATE_SPECIFIC_RESULT:
            stream.readByte(); // Which of several results was picked.
            return { type };

        case ItemStackRequestActionType.LAB_TABLE_COMBINE:
        case ItemStackRequestActionType.CRAFTING_NON_IMPLEMENTED_DEPRECATED:
            return { type };

        case ItemStackRequestActionType.BEACON_PAYMENT:
            stream.readVarInt(); // Primary effect.
            stream.readVarInt(); // Secondary effect.
            return { type };

        case ItemStackRequestActionType.MINE_BLOCK: {
            const hotbarSlot = stream.readVarInt();
            stream.readVarInt(); // Predicted durability.
            stream.readIntLE(); // Stack net id - four fixed bytes, see `readSlotInfo`.
            return { type, hotbarSlot };
        }

        case ItemStackRequestActionType.CRAFTING_RECIPE: {
            const recipeNetId = stream.readUnsignedVarInt();
            return { type, recipeNetId, repetitions: stream.readByte() };
        }

        case ItemStackRequestActionType.CRAFTING_RECIPE_AUTO: {
            // The repetitions used to be sent twice, and the ingredients counted by a byte;
            // since 2168 once, and a varint, like every other list.
            stream.readUnsignedVarInt(); // Recipe net id.
            const repetitions = stream.readByte();
            for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) skipRequestIngredient(stream);
            return { type, repetitions };
        }

        case ItemStackRequestActionType.CREATIVE_CREATE:
            return {
                type,
                creativeItemNetId: stream.readUnsignedVarInt(),
                repetitions: stream.readByte()
            };

        case ItemStackRequestActionType.CRAFTING_RECIPE_OPTIONAL:
            stream.readUnsignedVarInt(); // Recipe net id.
            stream.readIntLE(); // Which filter string carries the new name.
            return { type };

        case ItemStackRequestActionType.CRAFT_REPAIR_AND_DISENCHANT: {
            stream.readIntLE(); // Recipe net id - a net id variant, four fixed bytes.
            const repetitions = stream.readByte();
            stream.readVarInt(); // Repair cost.
            return { type, repetitions };
        }

        case ItemStackRequestActionType.CRAFTING_LOOM:
            NetworkUtil.readString(stream); // Pattern.
            stream.readByte(); // Times crafted.
            return { type };

        case ItemStackRequestActionType.CRAFTING_RESULTS_DEPRECATED: {
            for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) skipRequestItem(stream);
            stream.readByte(); // Iterations.
            return { type };
        }

        default:
            throw new Error(`Unknown item stack request action type ${type}`);
    }
};

/**
 * Reads one request: its id, its steps, and any text the player typed alongside them.
 *
 * Each action opens with two numbers that mean the same thing: a varint selector, which is
 * the action's index among the alternatives, and then the action type as a byte. The
 * selector is what is dispatched on - see {@link actionTypeOf} for why the two differ from
 * the lab table on - and the byte is read and let go.
 */
export const readItemStackRequest = (stream: BinaryStream): ItemStackRequest => {
    const requestId = stream.readVarInt();

    const actions: ItemStackRequestAction[] = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        const type = actionTypeOf(stream.readUnsignedVarInt());
        stream.readByte(); // The type again, as the legacy byte.
        actions.push(readAction(stream, type));
    }

    const filterStrings: string[] = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        filterStrings.push(NetworkUtil.readString(stream));
    }

    return { requestId, actions, filterStrings, filterStringCause: stream.readIntLE() };
};
