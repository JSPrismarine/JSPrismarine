import NetworkStructure from '../NetworkStructure';
import { string as stringType } from '../wire/fieldTypes';

import type BinaryStream from '@jsprismarine/binaryutils';

/**
 * One entry of a priority map: a block, entity, block tag or entity type family identifier and
 * the targeting priority it gets. Larger numbers win.
 */
export interface CameraAimAssistPriority {
    /** The `key`: a `Block Reference`, `Entity Reference`, block tag or entity type family name. */
    identifier: string;
    /** The `value`, a priority from 0 to 100. */
    priority: number;
}

/**
 * The `CameraAimAssistCategoryPriorities` of one `CameraAimAssistCategoryDefinition`: which
 * blocks and entities aim assist prefers while the category is active.
 *
 * Protocol 2193 wire order:
 * 0. `entities`: varuint32 count, then one {@link CameraAimAssistPriority} per entity identifier.
 * 1. `blocks`: varuint32 count, then one entry per block identifier.
 * 2. `block_tags`: varuint32 count, then one entry per block tag.
 * 3. `entity_type_families`: varuint32 count, then one entry per entity type family.
 * 4. `entity_default`: optional. A presence byte, then a little-endian int32 when present.
 * 5. `block_default`: optional. A presence byte, then a little-endian int32 when present.
 *
 * Each entry is its identifier string (varuint32 byte length then UTF-8) followed by the
 * priority as a little-endian int32.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/camera-aim-assist-category-priorities/}
 */
export default class CameraAimAssistCategoryPriorities extends NetworkStructure {
    /**
     * Creates a priority set. Every parameter has a default so the static `deserialize` can
     * construct an empty instance before reading the stream.
     * @param entities - `entities`, priorities keyed by entity identifier.
     * @param blocks - `blocks`, priorities keyed by block identifier.
     * @param blockTags - `block_tags`, priorities keyed by block tag.
     * @param entityTypeFamilies - `entity_type_families`, priorities keyed by entity type family.
     * @param entityDefault - `entity_default`, the priority for entities missing from `entities`. Omitted when undefined.
     * @param blockDefault - `block_default`, the priority for blocks missing from `blocks`. Omitted when undefined.
     */
    public constructor(
        public entities: CameraAimAssistPriority[] = [],
        public blocks: CameraAimAssistPriority[] = [],
        public blockTags: CameraAimAssistPriority[] = [],
        public entityTypeFamilies: CameraAimAssistPriority[] = [],
        public entityDefault?: number,
        public blockDefault?: number
    ) {
        super();
    }

    private static writePriorities(stream: BinaryStream, priorities: CameraAimAssistPriority[]): void {
        stream.writeUnsignedVarInt(priorities.length);
        for (const entry of priorities) {
            stringType.write(stream, entry.identifier);
            stream.writeIntLE(entry.priority);
        }
    }

    private static readPriorities(stream: BinaryStream): CameraAimAssistPriority[] {
        const priorities: CameraAimAssistPriority[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            priorities.push({ identifier: stringType.read(stream), priority: stream.readIntLE() });
        }
        return priorities;
    }

    private static writeOptionalPriority(stream: BinaryStream, priority: number | undefined): void {
        stream.writeBoolean(priority !== undefined);
        if (priority !== undefined) {
            stream.writeIntLE(priority);
        }
    }

    private static readOptionalPriority(stream: BinaryStream): number | undefined {
        return stream.readBoolean() ? stream.readIntLE() : undefined;
    }

    /** Writes the four maps and the two optional defaults in wire order. */
    public serialize(stream: BinaryStream): void {
        CameraAimAssistCategoryPriorities.writePriorities(stream, this.entities);
        CameraAimAssistCategoryPriorities.writePriorities(stream, this.blocks);
        CameraAimAssistCategoryPriorities.writePriorities(stream, this.blockTags);
        CameraAimAssistCategoryPriorities.writePriorities(stream, this.entityTypeFamilies);
        CameraAimAssistCategoryPriorities.writeOptionalPriority(stream, this.entityDefault);
        CameraAimAssistCategoryPriorities.writeOptionalPriority(stream, this.blockDefault);
    }

    /** Reads the four maps and the two optional defaults in wire order. */
    public deserialize(stream: BinaryStream): void {
        this.entities = CameraAimAssistCategoryPriorities.readPriorities(stream);
        this.blocks = CameraAimAssistCategoryPriorities.readPriorities(stream);
        this.blockTags = CameraAimAssistCategoryPriorities.readPriorities(stream);
        this.entityTypeFamilies = CameraAimAssistCategoryPriorities.readPriorities(stream);
        this.entityDefault = CameraAimAssistCategoryPriorities.readOptionalPriority(stream);
        this.blockDefault = CameraAimAssistCategoryPriorities.readOptionalPriority(stream);
    }
}
