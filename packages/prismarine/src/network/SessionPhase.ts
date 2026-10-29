/**
 * Where a connection stands in the join exchange. Every connection starts in `handshake`;
 * the handlers that complete each step advance it:
 *
 * - `handshake` → `login`: `RequestNetworkSettingsHandler`, once a codec is negotiated.
 * - `login` → `resourcePacks`: `LoginHandler`, once the login became a player session.
 * - `resourcePacks` → `play`: `ResourcePackClientResponseHandler`, when the client reports
 *   the resource pack exchange `Completed` and the join burst starts.
 *
 * Each packet handler declares the phases it accepts; the dispatcher drops a packet that
 * arrives outside them.
 */
export type SessionPhase = 'handshake' | 'login' | 'resourcePacks' | 'play';
