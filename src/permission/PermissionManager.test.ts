import PermissionManager from './PermissionManager';

describe('permission', () => {
    describe('PermissionManager', () => {
        it('can().execute() should handle sub-sub-actions', () => {
            const pm = new PermissionManager(null as any);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        getPermissions: () => ['namespace.scope.action']
                    } as any)
                    .execute('namespace.scope.action')
            ).toBe(true);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        getPermissions: () => ['namespace.scope.action']
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        getPermissions: () => [
                            'namespace.scope.action.subaction.whoop'
                        ]
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(false);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        getPermissions: () => ['namespace.scope.*']
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                pm
                    .can({
                        isPlayer: () => true,
                        isOp: () => false,
                        getPermissions: () => ['*']
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(true);
        });

        it('can().execute() should handle console', () => {
            const pm = new PermissionManager(null as any);

            expect(
                pm
                    .can({
                        isPlayer: () => false
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
                        isOp: () => true
                    } as any)
                    .execute('namespace.scope.action.subaction')
            ).toBe(true);
        });

        it('can().execute() should handle no permission', () => {
            const pm = new PermissionManager(null as any);

            expect(pm.can({} as any).execute()).toBe(true);
        });
    });
});
