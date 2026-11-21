import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Group, User } from './model';
import { emptyUser } from './model';
import type { PermissionView } from './resolve';
import {
    commandLevelOf,
    directGroupsOf,
    hasPermission,
    levelOf,
    metaOf,
    nodesOf,
    primaryGroupOf,
    wouldCycle
} from './resolve';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const PAST = '2026-11-21T11:00:00Z';
const FUTURE = '2026-11-22T12:00:00Z';

const group = (changes: Partial<Group> = {}): Group => ({ weight: 0, parents: [], nodes: [], meta: {}, ...changes });
const nodes = (...names: string[]) => names.map((node) => ({ node }));

/** A view over these groups, for a user with these changes, at noon on the plan's day. */
const view = (groups: Record<string, Group>, user: Partial<User> = {}, isOp = false): PermissionView => ({
    user: { ...emptyUser('Steve'), ...user },
    isOp,
    groupOf: (name) => groups[name],
    now: NOW
});

describe('permission resolution', () => {
    const groups = {
        default: group({ nodes: nodes('minecraft.command.help') }),
        operator: group({ weight: 100, nodes: nodes('*') }),
        vip: group({
            weight: 10,
            nodes: nodes('minecraft.command.me', '-minecraft.command.kick'),
            meta: { prefix: 'VIP' }
        }),
        staff: group({
            weight: 50,
            parents: ['moderator'],
            nodes: nodes('minecraft.command.kick'),
            meta: { prefix: 'Staff' }
        }),
        moderator: group({ weight: 20, nodes: nodes('minecraft.command.ban'), meta: { prefix: 'Mod', suffix: '!' } })
    };

    it("lets a user's own node beat any group's", () => {
        expect(hasPermission(view(groups, { nodes: nodes('-minecraft.command.help') }), 'minecraft.command.help')).toBe(
            false
        );
        expect(
            hasPermission(
                view(groups, { nodes: nodes('minecraft.command.kick'), groups: [{ group: 'vip' }] }),
                'minecraft.command.kick'
            )
        ).toBe(true);
    });

    it('lets a heavier group beat a lighter one, whatever order the memberships list them in', () => {
        const member = view(groups, { groups: [{ group: 'vip' }, { group: 'staff' }] });
        expect(hasPermission(member, 'minecraft.command.kick')).toBe(true);
        expect(directGroupsOf(member)).toEqual(['staff', 'vip', 'default']);
        // A denial in the lighter group never overrides the heavier group's grant: tiers decide one at a time.
        expect(
            hasPermission(view(groups, { groups: [{ group: 'staff' }, { group: 'vip' }] }), 'minecraft.command.kick')
        ).toBe(true);
    });

    it('visits groups of equal weight in name order, so a grant and a denial at one weight resolve the same on every run', () => {
        const tied = {
            default: group(),
            alpha: group({ weight: 5, nodes: nodes('minecraft.command.kick') }),
            beta: group({ weight: 5, nodes: nodes('-minecraft.command.kick') })
        };
        const listedBetaFirst = view(tied, { groups: [{ group: 'beta' }, { group: 'alpha' }] });
        expect(directGroupsOf(listedBetaFirst)).toEqual(['alpha', 'beta', 'default']);
        expect(hasPermission(listedBetaFirst, 'minecraft.command.kick')).toBe(true);
        // The same nodes under names in the other order give the denial the first tier.
        const swapped = {
            default: group(),
            alpha: group({ weight: 5, nodes: nodes('-minecraft.command.kick') }),
            beta: group({ weight: 5, nodes: nodes('minecraft.command.kick') })
        };
        expect(
            hasPermission(view(swapped, { groups: [{ group: 'beta' }, { group: 'alpha' }] }), 'minecraft.command.kick')
        ).toBe(false);
        // Within one tier the negation rule decides before any name: a group that grants a node and
        // inherits a parent that denies it is denied, whatever the two are called.
        const inherited = {
            default: group(),
            alpha: group({ weight: 5, parents: ['zulu'], nodes: nodes('minecraft.command.kick') }),
            zulu: group({ nodes: nodes('-minecraft.command.kick') })
        };
        expect(hasPermission(view(inherited, { groups: [{ group: 'alpha' }] }), 'minecraft.command.kick')).toBe(false);
    });

    it("walks a group's parents depth first, behind the group's own nodes", () => {
        const member = view(groups, { groups: [{ group: 'staff' }] });
        expect(hasPermission(member, 'minecraft.command.ban')).toBe(true);
        expect(nodesOf(member)).toEqual(['minecraft.command.kick', 'minecraft.command.ban', 'minecraft.command.help']);

        // Depth first: the first parent's own parent is read before the second parent, so its
        // denial wins over the second parent's grant of the same node.
        const deep = {
            default: group(),
            team: group({ weight: 10, parents: ['first', 'second'] }),
            first: group({ parents: ['grand'] }),
            grand: group({ nodes: nodes('-minecraft.command.tp') }),
            second: group({ nodes: nodes('minecraft.command.tp') })
        };
        expect(hasPermission(view(deep, { groups: [{ group: 'team' }] }), 'minecraft.command.tp')).toBe(false);
    });

    it('gives an inherited node the weight of the direct group that inherits it', () => {
        // `light` is a parent of the heavy `staff`, so its grant decides before the lighter direct `vip` denies.
        const inherited = {
            default: group(),
            staff: group({ weight: 50, parents: ['light'] }),
            light: group({ weight: 1, nodes: nodes('minecraft.command.kick') }),
            vip: group({ weight: 10, nodes: nodes('-minecraft.command.kick') })
        };
        const member = view(inherited, { groups: [{ group: 'vip' }, { group: 'staff' }] });
        expect(hasPermission(member, 'minecraft.command.kick')).toBe(true);
        // Own and inherited nodes share the tier, so a negation among them wins a tie.
        const tied = {
            default: group(),
            a: group({ weight: 5, parents: ['b'], nodes: nodes('x.y') }),
            b: group({ nodes: nodes('-x.y') })
        };
        expect(hasPermission(view(tied, { groups: [{ group: 'a' }] }), 'x.y')).toBe(false);
    });

    it('lets a specific node beat a wildcard in the same tier, and a longer scope beat a shorter one', () => {
        const scoped = {
            default: group({ nodes: nodes('minecraft.*', '-minecraft.command.*', 'minecraft.command.me') })
        };
        expect(hasPermission(view(scoped), 'minecraft.command.me')).toBe(true);
        expect(hasPermission(view(scoped), 'minecraft.command.kick')).toBe(false);
        expect(hasPermission(view(scoped), 'minecraft.other')).toBe(true);
        expect(hasPermission(view(scoped), 'jsprismarine.command.tps')).toBe(false);
    });

    it('lets `scope.*` name the scope itself, below an exact node for it', () => {
        const wild = { default: group({ nodes: nodes('minecraft.command.*') }) };
        expect(hasPermission(view(wild), 'minecraft.command')).toBe(true);
        expect(hasPermission(view(wild), 'minecraft')).toBe(false);
        const denied = { default: group({ nodes: nodes('-minecraft.command.*', 'minecraft.command') }) };
        expect(hasPermission(view(denied), 'minecraft.command')).toBe(true);
        expect(hasPermission(view(denied), 'minecraft.command.kick')).toBe(false);
        expect(
            hasPermission(view({ default: group({ nodes: nodes('-minecraft.command.*') }) }), 'minecraft.command')
        ).toBe(false);
    });

    it('lets a negation win a tie, and a bare scope cover its children as the checks always have', () => {
        const tied = {
            default: group({
                nodes: nodes('minecraft.command.kick', '-minecraft.command.kick', 'jsprismarine.command')
            })
        };
        expect(hasPermission(view(tied), 'minecraft.command.kick')).toBe(false);
        expect(hasPermission(view(tied), 'jsprismarine.command.tps')).toBe(true);
    });

    it('skips an expired node and an expired membership, and keeps ones that have not expired', () => {
        const member = view(groups, {
            nodes: [
                { node: 'minecraft.command.stop', expires: PAST },
                { node: 'minecraft.command.op', expires: FUTURE }
            ],
            groups: [
                { group: 'staff', expires: PAST },
                { group: 'vip', expires: FUTURE }
            ]
        });
        expect(hasPermission(member, 'minecraft.command.stop')).toBe(false);
        expect(hasPermission(member, 'minecraft.command.op')).toBe(true);
        expect(hasPermission(member, 'minecraft.command.kick')).toBe(false);
        expect(directGroupsOf(member)).toEqual(['vip', 'default']);
    });

    it('gives everyone default and an operator the operator group, which grants everything', () => {
        expect(hasPermission(view(groups), 'minecraft.command.help')).toBe(true);
        expect(hasPermission(view(groups), 'minecraft.command.stop')).toBe(false);
        expect(hasPermission(view(groups, {}, true), 'minecraft.command.stop')).toBe(true);
        expect(primaryGroupOf(view(groups, {}, true))).toBe('operator');
        expect(primaryGroupOf(view(groups, { groups: [{ group: 'vip' }] }))).toBe('vip');
        expect(primaryGroupOf(view({}))).toBe('default');
    });

    it('answers false for a node nothing names, and ends on a parent cycle a hand-edited file slipped past the loader', () => {
        const cyclic = {
            default: group(),
            a: group({ parents: ['b'] }),
            b: group({ parents: ['a'], nodes: nodes('x.y') })
        };
        expect(hasPermission(view(cyclic, { groups: [{ group: 'a' }] }), 'x.y')).toBe(true);
        expect(hasPermission(view(cyclic, { groups: [{ group: 'a' }] }), 'x.z')).toBe(false);
        expect(metaOf(view(cyclic, { groups: [{ group: 'a' }] }), 'prefix')).toBeUndefined();
        expect(hasPermission(view(groups, { groups: [{ group: 'missing' }] }), 'x.z')).toBe(false);
    });

    it('says whether a parent would make a group its own ancestor', () => {
        const chain = new Map([
            ['a', group({ parents: ['b'] })],
            ['b', group({ parents: ['c'] })],
            ['c', group()]
        ]);
        const groupOf = (name: string) => chain.get(name);
        expect(wouldCycle('c', 'a', groupOf)).toBe(true);
        expect(wouldCycle('a', 'a', groupOf)).toBe(true);
        expect(wouldCycle('a', 'c', groupOf)).toBe(false);
        expect(wouldCycle('c', 'other', groupOf)).toBe(false);
    });

    it('leaves a membership in a group the file no longer has out of the groups held and the primary group', () => {
        const member = view(groups, { groups: [{ group: 'gone' }, { group: 'vip' }] });
        expect(directGroupsOf(member)).toEqual(['vip', 'default']);
        expect(primaryGroupOf(view(groups, { groups: [{ group: 'gone' }] }))).toBe('default');
    });

    it('resolves meta over the same tiers, first value wins', () => {
        const member = view(groups, { groups: [{ group: 'vip' }, { group: 'staff' }] });
        expect(metaOf(member, 'prefix')).toBe('Staff');
        expect(metaOf(member, 'suffix')).toBe('!');
        expect(metaOf(view(groups, { meta: { prefix: 'Me' }, groups: [{ group: 'staff' }] }), 'prefix')).toBe('Me');
        expect(metaOf(member, 'color')).toBeUndefined();
        // Only a key the file sets, never one the prototype has.
        expect(metaOf(member, 'toString')).toBeUndefined();
        // A parent's meta follows its group's own, with the direct group's weight.
        const inherited = {
            default: group(),
            staff: group({ weight: 50, parents: ['light'] }),
            light: group({ weight: 1, meta: { prefix: 'L' } }),
            vip: group({ weight: 10, meta: { prefix: 'V' } })
        };
        expect(metaOf(view(inherited, { groups: [{ group: 'vip' }, { group: 'staff' }] }), 'prefix')).toBe('L');
    });

    it('reads the level meta as 0 to 4, and gives an operator at least 4', () => {
        const leveled = { default: group({ meta: { level: '2' } }) };
        expect(commandLevelOf(view(leveled))).toBe(CommandPermissionLevel.ADMIN);
        expect(commandLevelOf(view(leveled, {}, true))).toBe(CommandPermissionLevel.OWNER);
        expect(commandLevelOf(view({ default: group({ meta: { level: '7' } }) }))).toBe(CommandPermissionLevel.ANY);
        expect(commandLevelOf(view({ default: group({ meta: { level: 'two' } }) }))).toBe(CommandPermissionLevel.ANY);
        expect(commandLevelOf(view(groups))).toBe(CommandPermissionLevel.ANY);
        expect([levelOf('0'), levelOf('4'), levelOf('5'), levelOf(undefined)]).toEqual([0, 4, undefined, undefined]);
    });
});
