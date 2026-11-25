import type { Logger } from '@jsprismarine/logger';
import { DisconnectReason } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { InetAddress } from '@jsprismarine/raknet';
import { describe, expect, it } from 'vitest';

import { AccountLinks } from '../../identity/AccountLinks';
import type Server from '../../Server';
import SessionManager from '../../SessionManager';
import { testKernel } from '../../testing/kernel.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import type ClientConnection from '../ClientConnection';
import { InputQueue } from '../../input/InputQueue';
import type PlayerSession from '../../player/PlayerSession';
import { javaDisconnectReason, javaPlayersOf } from './javaPlayers';

const XUID = '2535400000000001';
const JAVA_UUID = '0f1e2d3c-4b5a-4968-8776-655443322110';

/** Lets every promise that can settle without a timer settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('network', () => {
    describe('java', () => {
        describe('javaPlayers', () => {
            it("replaces the Bedrock session of the account a linked Java account plays as, before reading the player's spawn", async () => {
                const links = new AccountLinks(
                    {
                        load: async () => [
                            {
                                account: { kind: 'java', uuid: JAVA_UUID },
                                primary: { kind: 'xbox', xuid: XUID },
                                primaryName: 'Steve',
                                primaryXuid: XUID
                            }
                        ],
                        save: async () => {}
                    },
                    () => true
                );
                await links.load();

                const events: string[] = [];
                const sessions = new SessionManager();
                const bedrockSession = stub<PlayerSession>({
                    isConnected: () => true,
                    kick: async (_reason, code) =>
                        void events.push(code === DisconnectReason.LOGGED_IN_OTHER_LOCATION ? 'replaced' : 'kicked'),
                    identity: {
                        name: 'Steve',
                        xuid: XUID,
                        uuid: '00000000-0000-4000-8000-0000000000aa',
                        subject: { kind: 'xbox', xuid: XUID }
                    }
                });
                sessions.add(1, stub<ClientConnection>({ getPlayerSession: () => bedrockSession }));

                // The join stops at the spawn: what follows builds the player, which this test does not need.
                const world = stub<World>({
                    getSpawnPosition: () => {
                        events.push('spawn read');
                        return new Promise<Vector3>(() => {});
                    }
                });
                const server = stub<Server>({
                    getKernel: () => testKernel(undefined, links),
                    getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} }),
                    getSessionManager: () => sessions,
                    getWorldManager: () =>
                        stub<WorldManager>({ getEntryWorld: () => world, returningLevelOf: () => undefined })
                });

                void javaPlayersOf(server, new InputQueue(() => false)).join(
                    { id: JAVA_UUID, name: 'Alex', properties: [] },
                    true,
                    2,
                    new InetAddress('127.0.0.1', 50_000),
                    () => {},
                    async () => {}
                );
                await settle();

                expect(events).toEqual(['replaced', 'spawn read']);
            });

            it('holds a Java player inputs under its connection, which a replacing login removes it behind', async () => {
                const inputs = new InputQueue(() => true);
                const sources: unknown[] = [];
                const hold = inputs.hold.bind(inputs);
                inputs.hold = (source, apply) => {
                    sources.push(source);
                    return hold(source, apply);
                };
                const connection = stub<ClientConnection>({});
                const session = stub<PlayerSession>({ getConnection: () => connection });
                const players = javaPlayersOf(stub<Server>({ getLogger: () => stub<Logger>({}) }), inputs);
                const movement = {
                    position: new Vector3(0, 0, 0),
                    pitch: 0,
                    yaw: 0,
                    headYaw: 0,
                    onGround: true,
                    handledTeleport: false
                };

                void players.move(session, movement);
                void players.intent(session, { kind: 'selectHotbarSlot', slot: 1 });

                expect(sources).toEqual([connection, connection]);
            });

            it("tells a Java client replaced by another login vanilla's duplicate login message", () => {
                expect(
                    javaDisconnectReason('Logged in from another location', DisconnectReason.LOGGED_IN_OTHER_LOCATION)
                ).toEqual({
                    translate: 'multiplayer.disconnect.duplicate_login'
                });
                expect(javaDisconnectReason('Kicked by an operator', DisconnectReason.KICKED)).toBe(
                    'Kicked by an operator'
                );
            });
        });
    });
});
