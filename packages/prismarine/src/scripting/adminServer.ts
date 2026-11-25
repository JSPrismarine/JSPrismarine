/**
 * What `@minecraft/server-admin`'s `dedicatedServer` and its functions reach of the server.
 */
import type { ScriptAdminServer } from '@jsprismarine/script-host/host/world';

import type PlayerSession from '../player/PlayerSession';
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
    },
    isOperator: (player) => sessionOf(server, player)?.isOp() === true,
    setOperator: (player, operator) => {
        const session = sessionOf(server, player);
        if (session === undefined) return;
        // A simulated player has no identity to keep in `ops.json`, which BDS logs as
        // "Missing id, won't persist permissions on disk."
        const sent = server.getPermissionManager().setOpNow(session, operator, { persist: !session.isSimulated() });
        void sent?.catch((error: unknown) => server.getLogger().error(error));
    },
    allowList: {
        enabled: () => server.getAllowList().isEnabled(),
        setEnabled: (enabled) => server.getAllowList().setEnabled(enabled),
        entries: () => server.getAllowList().getEntries(),
        contains: (player) => server.getAllowList().contains(player),
        add: (entry) => server.getAllowList().add(entry),
        remove: (player) => server.getAllowList().remove(player),
        clear: () => server.getAllowList().clear(),
        reload: () => server.getAllowList().reload(),
        playerOf: (player) => {
            const session = sessionOf(server, player);
            if (session === undefined) return undefined;
            const { name, xuid } = session.identity;
            // A simulated player has no xuid, so BDS lists it by name alone.
            return { name, ...(xuid ? { xuid } : {}) };
        }
    },
    kick: (player, reason) => {
        const session = sessionOf(server, player);
        // BDS keeps a simulated player in the world when it is kicked, as the `admin-server`
        // scenario recorded; its GameTest removes it.
        if (session === undefined || session.isSimulated()) return;
        void session.kick(reason).catch((error: unknown) => server.getLogger().error(error));
    }
});

/** The session of a player the scripts name by their runtime id. */
const sessionOf = (server: Server, player: string): PlayerSession | undefined =>
    server
        .getSessionManager()
        .getSessions()
        .find((session) => String(session.getRuntimeId()) === player);
