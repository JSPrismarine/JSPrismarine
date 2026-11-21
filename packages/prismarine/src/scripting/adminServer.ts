/**
 * What `@minecraft/server-admin`'s `dedicatedServer` and its functions reach of the server.
 */
import type { ScriptAdminServer } from '@jsprismarine/script-host/host/world';

import type Server from '../Server';

/**
 * The admin server of one server, which every level's scripts share.
 * @param server - The server the scripts run on.
 */
export const scriptAdminServer = (server: Server): ScriptAdminServer => ({
    // Outside the script's call: the scripts close as the server stops, which must not happen
    // under the script that asked.
    stopServer: () => {
        queueMicrotask(() => void server.shutdown());
    },
    reloadPermissions: () => {
        void server
            .getPermissionManager()
            .reload()
            .catch((error: unknown) => server.getLogger().error(error));
    }
});
