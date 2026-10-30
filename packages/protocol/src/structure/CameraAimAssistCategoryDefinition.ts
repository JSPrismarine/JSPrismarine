import NetworkStructure from '../NetworkStructure';
import { string as stringType } from '../wire/fieldTypes';
import CameraAimAssistCategoryPriorities from './CameraAimAssistCategoryPriorities';

import type BinaryStream from '@jsprismarine/binaryutils';

/**
 * A `CameraAimAssistCategoryDefinition`: a named set of targeting priorities that a
 * `CameraAimAssistPresetDefinition` refers to by name, as `CameraAimAssistPresetsPacket`
 * lists them.
 *
 * Protocol 2193 wire order:
 * 0. `name`: string, the `CameraAimAssistCategory Identifier` presets look the category up by.
 * 1. `priorities`: a {@link CameraAimAssistCategoryPriorities}.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/camera-aim-assist-category-definition/}
 */
export default class CameraAimAssistCategoryDefinition extends NetworkStructure {
    /**
     * Creates a category. Both parameters have a default so the static `deserialize` can
     * construct an empty instance before reading the stream.
     * @param name - `name`, the identifier presets refer to.
     * @param priorities - `priorities`, the block and entity priorities of the category.
     */
    public constructor(
        public name = '',
        public priorities: CameraAimAssistCategoryPriorities = new CameraAimAssistCategoryPriorities()
    ) {
        super();
    }

    /** Writes the name, then the priorities. */
    public serialize(stream: BinaryStream): void {
        stringType.write(stream, this.name);
        this.priorities.serialize(stream);
    }

    /** Reads the name, then the priorities. */
    public deserialize(stream: BinaryStream): void {
        this.name = stringType.read(stream);
        this.priorities = new CameraAimAssistCategoryPriorities();
        this.priorities.deserialize(stream);
    }
}
