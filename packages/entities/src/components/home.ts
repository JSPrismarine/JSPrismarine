import type { ComponentFactory } from '@jsprismarine/content';

import type { EntityHooks } from '../hooks';
import type { ComponentRecord } from './schemas';
import { recordSchema } from './schemas';

/** `minecraft:home`, which records the entity's spawning position for home-based behavior. */
export const home: ComponentFactory<EntityHooks, ComponentRecord> = {
    name: 'minecraft:home',
    hooks: ['onInitialize'],
    schema: recordSchema,
    create: () => ({
        onInitialize: (entity) => {
            if (entity.homePosition !== undefined) return;
            const position = entity.actuator?.position();
            if (position !== undefined) entity.setHomePosition(position);
        }
    })
};
