import type { Module } from '@jsprismarine/kernel';

import { PermissionManager } from '../permission/PermissionManager';
import type { PermissionManagerServer } from '../permission/PermissionManager';
import { permissionsToken } from './tokens';

/**
 * Provides the {@link PermissionManager} as `prismarine:permissions`. Starting
 * the module loads the ops and permissions files; stopping it clears them.
 *
 * @param server - The slice of the server the permission manager reads.
 * @returns The module to register on the kernel.
 */
export const permissionsModule = (server: PermissionManagerServer): Module => {
    const permissions = new PermissionManager(server);
    return {
        id: 'prismarine:permissions',
        register: (ctx) => {
            ctx.provide(permissionsToken, permissions);
        },
        start: () => permissions.enable(),
        stop: () => permissions.disable()
    };
};
