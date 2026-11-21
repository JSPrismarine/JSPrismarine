import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';
import { Metadata } from '@jsprismarine/protocol/bedrock/wire/structures/Metadata';
import { describe, expect, it } from 'vitest';

import { shownEntityStateOf } from './shownEntityState';

describe('shownEntityStateOf', () => {
    it('reads each state from its Bedrock flag, in either flag long', () => {
        const metadata = new Metadata(false);
        metadata.setGenericFlag(ActorFlags.SNEAKING);
        metadata.setGenericFlag(ActorFlags.ONFIRE);
        metadata.setGenericFlag(ActorFlags.SLEEPING);

        expect(shownEntityStateOf(metadata)).toEqual({
            onFire: true,
            sneaking: true,
            sprinting: false,
            swimming: false,
            invisible: false,
            gliding: false,
            sleeping: true
        });
    });
});
