import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Group, User } from './model';
import { emptyUser } from './model';
import type { PermissionView } from './resolve';
import { commandLevelOf, directGroupsOf, hasPermission, levelOf, metaOf, nodesOf, primaryGroupOf } from './resolve';

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
    });

    it("walks a group's parents depth first, behind the group's own nodes", () => {
        const member = view(groups, { groups: [{ group: 'staff' }] });
        expect(hasPermission(member, 'minecraft.command.ban')).toBe(true);
        expect(nodesOf(member)).toEqual(['minecraft.command.kick', 'minecraft.command.ban', 'minecraft.command.help']);
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

    it('answers false for a node nothing names, and stops at a parent cycle', () => {
        const cyclic = { a: group({ parents: ['b'] }), b: group({ parents: ['a'], nodes: nodes('x.y') }) };
        expect(hasPermission(view(cyclic, { groups: [{ group: 'a' }] }), 'x.y')).toBe(true);
        expect(hasPermission(view(cyclic, { groups: [{ group: 'a' }] }), 'x.z')).toBe(false);
        expect(hasPermission(view(groups, { groups: [{ group: 'missing' }] }), 'x.z')).toBe(false);
    });

    it('resolves meta over the same tiers, first value wins', () => {
        const member = view(groups, { groups: [{ group: 'vip' }, { group: 'staff' }] });
        expect(metaOf(member, 'prefix')).toBe('Staff');
        expect(metaOf(member, 'suffix')).toBe('!');
        expect(metaOf(view(groups, { meta: { prefix: 'Me' }, groups: [{ group: 'staff' }] }), 'prefix')).toBe('Me');
        expect(metaOf(member, 'color')).toBeUndefined();
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
