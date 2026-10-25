import { describe, expect, it } from 'vitest';

import { eventActionNames, isEmptyEventNode, parseEventNode } from './events';

const parse = (value: unknown) => {
    const reported: string[] = [];
    const node = parseEventNode(value, (code, message) => reported.push(`${code}: ${message}`));
    return { node, reported };
};

describe('parseEventNode', () => {
    it('normalizes add and remove to lists of group names', () => {
        const { node } = parse({
            add: { component_groups: ['a', 'b'] },
            remove: { component_groups: ['c'] }
        });

        expect(node.add).toEqual(['a', 'b']);
        expect(node.remove).toEqual(['c']);
    });

    it('reads a trigger written as a name and as an object', () => {
        const { node } = parse({ trigger: 'minecraft:go' });
        const object = parse({ trigger: { event: 'minecraft:go', target: 'other' } });

        expect(node.triggers).toEqual([{ event: 'minecraft:go', target: 'self' }]);
        expect(object.node.triggers).toEqual([{ event: 'minecraft:go', target: 'other', filters: undefined }]);
    });

    it('reports an unknown trigger target and falls back to self', () => {
        const { node, reported } = parse({ trigger: { event: 'minecraft:go', target: 'moon' } });

        expect(node.triggers[0]?.target).toBe('self');
        expect(reported.join('\n')).toContain('moon');
    });

    it('gives a randomize branch with no weight a weight of one', () => {
        const { node } = parse({ randomize: [{ add: { component_groups: ['a'] } }, { weight: 3 }] });

        expect(node.randomize.map((branch) => branch.weight)).toEqual([1, 3]);
        expect(isEmptyEventNode(node.randomize[1]!.node)).toBe(true);
    });

    it('keeps an action it does not model, with its body', () => {
        const { node } = parse({
            play_sound: { sound: 'mob.cow.say' },
            set_home_position: {},
            stop_movement: { stop_horizontal_movement: true }
        });

        expect(node.actions.map((action) => action.name).sort()).toEqual([
            'play_sound',
            'set_home_position',
            'stop_movement'
        ]);
        expect(node.actions.find((action) => action.name === 'play_sound')?.value).toEqual({ sound: 'mob.cow.say' });
    });

    it('reports a malformed branch and leaves it out', () => {
        const { node, reported } = parse({ sequence: 'not an array', add: 7 });

        expect(node.sequence).toEqual([]);
        expect(node.add).toEqual([]);
        expect(reported).toHaveLength(2);
    });

    it('reports a filter that does not follow the grammar', () => {
        const { node, reported } = parse({ filters: { all_of: 'nope' } });

        expect(node.filters).toBeUndefined();
        expect(reported.join('\n')).toContain('all_of');
    });

    it('keeps a set_property string as text for the engine to resolve', () => {
        const { node } = parse({ set_property: { 'test:state': 'crumbling', 'test:flag': false, 'test:n': 3 } });

        expect(node.setProperties).toEqual([
            { name: 'test:state', value: { kind: 'text', text: 'crumbling' } },
            { name: 'test:flag', value: { kind: 'literal', value: false } },
            { name: 'test:n', value: { kind: 'literal', value: 3 } }
        ]);
    });
});

describe('eventActionNames', () => {
    it('finds the actions nested anywhere in the tree', () => {
        const { node } = parse({
            sequence: [{ randomize: [{ weight: 1, play_sound: {} }] }, { first_valid: [{ emit_particle: {} }] }]
        });

        expect(eventActionNames(node).sort()).toEqual(['emit_particle', 'play_sound']);
    });
});
