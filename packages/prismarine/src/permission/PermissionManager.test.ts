import { describe, expect, it } from 'vitest';

import Console from '../Console';
import { canExecute } from './PermissionManager';

describe('permission', () => {
    describe('PermissionManager', () => {
        it('can().execute() should work', () => {
            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['namespace.scope.action']
                }).execute('namespace.scope.action')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['namespace.scope.action']
                }).execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['namespace.scope.action.subaction.whoop']
                }).execute('namespace.scope.action.subaction')
            ).toBe(false);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['namespace.scope.*']
                }).execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['*']
                }).execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['othernamespace.scope.action']
                }).execute('namespace.scope.action.subaction')
            ).toBe(false);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => []
                }).execute('namespace.scope.action.subaction')
            ).toBe(false);
        });

        it('can().execute() should handle op', () => {
            expect(
                canExecute({
                    isOp: () => true,
                    getPermissions: () => []
                }).execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => true,
                    getPermissions: () => []
                })
                    .not()
                    .execute('namespace.scope.action.subaction')
            ).toBe(false);
        });

        it('can().execute() should allow the console', () => {
            const console: Console = Object.create(Console.prototype);

            expect(canExecute(console).execute('namespace.scope.action')).toBe(true);
        });

        it('can().execute() should handle no permission', () => {
            expect(canExecute({ isOp: () => false, getPermissions: () => [] }).execute()).toBe(true);
        });
    });
});
