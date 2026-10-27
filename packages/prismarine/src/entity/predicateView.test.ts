import { describe, expect, it } from 'vitest';

import { definitionOf } from '../content/ContentOptions';
import { buildContentTags } from '../content/tags';
import { entityPredicateView } from './predicateView';

describe('entityPredicateView', () => {
    it('maps Java entity type tag members to Bedrock identifiers', () => {
        const tags = buildContentTags(
            new Map([
                [
                    'entity_type/minecraft:undead',
                    definitionOf('tags', 'entity_type/minecraft:undead', {
                        values: ['minecraft:zombified_piglin']
                    })
                ]
            ])
        );

        const view = entityPredicateView(
            {
                getType: () => 'minecraft:zombie_pigman',
                getPosition: () => ({ getX: () => 1, getY: () => 2, getZ: () => 3 })
            },
            { tags }
        );

        expect(view.typeTags).toEqual(['minecraft:undead']);
    });
});
