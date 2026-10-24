import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/**
 * The `CameraAimAssistPresetExclusionDefinition` of a preset: the targets aim assist never
 * selects. Each list is a varuint32 count followed by that many strings.
 */
export interface CameraAimAssistPresetExclusions {
    /** `blocks`, one `Block Reference` per excluded block. */
    blocks: string[];
    /** `entities`, one `Entity Reference` per excluded entity. */
    entities: string[];
    /** `block_tags`, excluded block tags. */
    blockTags: string[];
    /** `entity_type_families`, excluded entity type families. */
    entityTypeFamilies: string[];
}

/** One entry of `item_settings`: the category aim assist uses while the player holds the item. */
export interface CameraAimAssistItemSetting {
    /** The `key`, an `Item Reference`. */
    item: string;
    /** The `value`, a `CameraAimAssistCategory Reference` naming a category sent in the same packet. */
    category: string;
}

/**
 * A `CameraAimAssistPresetDefinition`: a named aim assist configuration that
 * `CameraAimAssistPacket` and camera presets refer to by identifier, as
 * `CameraAimAssistPresetsPacket` lists them.
 *
 * Protocol 2193 wire order:
 * 0. `identifier`: string, the namespaced `CameraAimAssist Identifier`, for example "minecraft:aim_assist_default".
 * 1. `exclusion_settings`: the four string lists of {@link CameraAimAssistPresetExclusions} in the
 *    order `blocks`, `entities`, `block_tags`, `entity_type_families`.
 * 2. `liquid_targeting_list`: varuint32 count, then one `Item Reference` string per item that targets liquids while held.
 * 3. `item_settings`: varuint32 count, then one {@link CameraAimAssistItemSetting} per item (two strings each).
 * 4. `default_item_settings`: optional. A presence byte, then a category name when present.
 * 5. `hand_settings`: optional. A presence byte, then a category name when present.
 *
 * Strings are a varuint32 byte length followed by UTF-8.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/camera-aim-assist-preset-definition/}
 */
export default class CameraAimAssistPresetDefinition extends NetworkStructure {
    /**
     * Creates a preset. Every parameter has a default so the static `deserialize` can construct
     * an empty instance before reading the stream.
     * @param identifier - `identifier`, the namespaced preset name.
     * @param exclusions - `exclusion_settings`, the targets to skip.
     * @param liquidTargetingList - `liquid_targeting_list`, items that target liquid blocks while held.
     * @param itemSettings - `item_settings`, the category per held item.
     * @param defaultItemSettings - `default_item_settings`, the category for items missing from `itemSettings`. Omitted when undefined.
     * @param handSettings - `hand_settings`, the category for an empty hand. Omitted when undefined.
     */
    public constructor(
        public identifier = '',
        public exclusions: CameraAimAssistPresetExclusions = {
            blocks: [],
            entities: [],
            blockTags: [],
            entityTypeFamilies: []
        },
        public liquidTargetingList: string[] = [],
        public itemSettings: CameraAimAssistItemSetting[] = [],
        public defaultItemSettings?: string,
        public handSettings?: string
    ) {
        super();
    }

    private static writeStrings(stream: NetworkBinaryStream, values: string[]): void {
        stream.writeUnsignedVarInt(values.length);
        for (const value of values) {
            stream.writeString(value);
        }
    }

    private static readStrings(stream: NetworkBinaryStream): string[] {
        const values: string[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            values.push(stream.readString());
        }
        return values;
    }

    private static writeOptionalString(stream: NetworkBinaryStream, value: string | undefined): void {
        stream.writeBoolean(value !== undefined);
        if (value !== undefined) {
            stream.writeString(value);
        }
    }

    private static readOptionalString(stream: NetworkBinaryStream): string | undefined {
        return stream.readBoolean() ? stream.readString() : undefined;
    }

    /** Writes the six fields in wire order. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.identifier);
        CameraAimAssistPresetDefinition.writeStrings(stream, this.exclusions.blocks);
        CameraAimAssistPresetDefinition.writeStrings(stream, this.exclusions.entities);
        CameraAimAssistPresetDefinition.writeStrings(stream, this.exclusions.blockTags);
        CameraAimAssistPresetDefinition.writeStrings(stream, this.exclusions.entityTypeFamilies);
        CameraAimAssistPresetDefinition.writeStrings(stream, this.liquidTargetingList);

        stream.writeUnsignedVarInt(this.itemSettings.length);
        for (const setting of this.itemSettings) {
            stream.writeString(setting.item);
            stream.writeString(setting.category);
        }

        CameraAimAssistPresetDefinition.writeOptionalString(stream, this.defaultItemSettings);
        CameraAimAssistPresetDefinition.writeOptionalString(stream, this.handSettings);
    }

    /** Reads the six fields in wire order. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.identifier = stream.readString();
        this.exclusions = {
            blocks: CameraAimAssistPresetDefinition.readStrings(stream),
            entities: CameraAimAssistPresetDefinition.readStrings(stream),
            blockTags: CameraAimAssistPresetDefinition.readStrings(stream),
            entityTypeFamilies: CameraAimAssistPresetDefinition.readStrings(stream)
        };
        this.liquidTargetingList = CameraAimAssistPresetDefinition.readStrings(stream);

        const itemSettings: CameraAimAssistItemSetting[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            itemSettings.push({ item: stream.readString(), category: stream.readString() });
        }
        this.itemSettings = itemSettings;

        this.defaultItemSettings = CameraAimAssistPresetDefinition.readOptionalString(stream);
        this.handSettings = CameraAimAssistPresetDefinition.readOptionalString(stream);
    }
}
