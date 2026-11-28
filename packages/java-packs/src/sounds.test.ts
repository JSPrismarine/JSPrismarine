import { describe, expect, it } from 'vitest';

import { convertSoundDefinitions, javaSoundPath } from './sounds';

describe('convertSoundDefinitions', () => {
    it('reads the current shape, keeping what Java has and noting what it drops', () => {
        const converted = convertSoundDefinitions({
            format_version: '1.20.20',
            sound_definitions: {
                'Furniture.Chair_Creak': {
                    category: 'block',
                    min_distance: 2,
                    max_distance: 24.6,
                    sounds: [
                        'sounds/furniture/creak1',
                        {
                            name: 'sounds/furniture/Creak2',
                            volume: 0.5,
                            pitch: 1.2,
                            weight: 3.4,
                            stream: true,
                            is3D: false
                        }
                    ]
                },
                empty: { sounds: [] }
            }
        });

        expect(Object.fromEntries(converted.events)).toEqual({
            'furniture.chair_creak': {
                sounds: [
                    { name: 'bedrock:furniture/creak1', attenuation_distance: 25 },
                    {
                        name: 'bedrock:furniture/creak2',
                        volume: 0.5,
                        pitch: 1.2,
                        weight: 3,
                        stream: true,
                        attenuation_distance: 25
                    }
                ]
            }
        });
        expect(converted.files).toEqual([
            { bedrock: 'sounds/furniture/creak1', java: 'furniture/creak1' },
            { bedrock: 'sounds/furniture/Creak2', java: 'furniture/creak2' }
        ]);
        expect(converted.lossy).toEqual(['Furniture.Chair_Creak']);
    });

    it('reads the older shape of events at the root', () => {
        const converted = convertSoundDefinitions({ 'mob.cow.say': { sounds: ['sounds/mob/cow/say1'] } });

        expect([...converted.events.keys()]).toEqual(['mob.cow.say']);
        expect(converted.lossy).toEqual([]);
    });

    it('makes a sound path a Java one under sounds/', () => {
        expect(javaSoundPath('sounds/Mob/My Cow')).toBe('mob/my_cow');
        expect(javaSoundPath('custom/thing')).toBe('custom/thing');
    });
});
