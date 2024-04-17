import { describe, expect, it } from 'vitest';

import { PermissionManager } from './PermissionManager';

describe('permission', () => {
    describe('PermissionManager', () => {
        it('can().execute() should work', () => {
            const pm = new PermissionManager(null as any);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        isConsole: () => false,
                        getPermissions: () => ['namespace.scope.action']
                    } as any)
                    .execute('namespace.scope.action')
            ).toBe(true);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        isConsole: () => false,
                        getPermissions: () => ['namespace.scope.action']
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        isConsole: () => false,
                        getPermissions: () => ['namespace.scope.action.subaction.whoop']
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(false);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        isConsole: () => false,
                        getPermissions: () => ['namespace.scope.*']
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        isConsole: () => false,
                        getPermissions: () => ['*']
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        isConsole: () => false,
                        getPermissions: () => ['othernamespace.scope.action']
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(false);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        isConsole: () => false,
                        getPermissions: () => []
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(false);
        });

        it('can().execute() should handle console', () => {
            const pm = new PermissionManager(null as any);

            expect(
                pm
                    .can({
                        isPlayer: () => false,
                        isConsole: () => true
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(true);
        });

        it('can().execute() should handle op', () => {
            const pm = new PermissionManager(null as any);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => true,
                        isConsole: () => false
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => true,
                        isConsole: () => false
                    } as any)
                    .not()
                    .execute('namespace.scope.action.subaction')
            ).toBe(false);
        });

        it('can().execute() should handle no permission', () => {
            const pm = new PermissionManager(null as any);

            expect(pm.can({} as any).execute()).toBe(true);
        });
    });
});
