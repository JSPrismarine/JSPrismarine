import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Client, Server } from 'nethernet';
import { describe, expect, it } from 'vitest';

import { adaptPeerConnections, configurePeerConnections } from './peerConnections';

/** What a peer connection class built from a backend was constructed with and called with. */
interface Recorded {
    configuration: Record<string, unknown>;
    created: string[];
}

/** Stands in for werift's `RTCPeerConnection`. */
class WeriftPeer {
    public readonly record: Recorded;

    public constructor(configuration: Record<string, unknown>) {
        this.record = { configuration, created: [] };
    }

    public createDataChannel(label: string): string {
        this.record.created.push(`werift:${label}`);
        return label;
    }
}

/** Stands in for `nethernet`'s subclass, whose override misfires on werift 0.27. */
class NetherNetPeer extends WeriftPeer {
    public override createDataChannel(label: string): string {
        this.record.created.push(`nethernet:${label}`);
        return label;
    }
}

/** Builds a peer from the backend the holder ends up with, as `nethernet` does. */
const build = (holder: { webrtc: { RTCPeerConnection: unknown } }, configuration: Record<string, unknown> = {}) => {
    const Peer = holder.webrtc.RTCPeerConnection;
    if (typeof Peer !== 'function') throw new Error('no peer connection class');
    const peer: unknown = Reflect.construct(Peer, [configuration]);
    if (!(peer instanceof WeriftPeer)) throw new Error('not a werift peer');
    return peer;
};

describe('adaptPeerConnections', () => {
    it("turns werift's default STUN server off and keeps the caller's configuration", () => {
        const holder = { webrtc: { RTCPeerConnection: NetherNetPeer } };
        adaptPeerConnections(holder);

        expect(build(holder, { iceServers: [] }).record.configuration).toStrictEqual({
            iceServers: [],
            iceUseDefaultStunServer: false
        });
    });

    it("creates data channels with werift's own method, not nethernet's override", () => {
        const holder = { webrtc: { RTCPeerConnection: NetherNetPeer } };
        adaptPeerConnections(holder);
        const peer = build(holder);

        peer.createDataChannel('UnreliableDataChannel');

        expect(peer.record.created).toStrictEqual(['werift:UnreliableDataChannel']);
    });

    it('leaves a backend without the override alone', () => {
        const holder = { webrtc: { RTCPeerConnection: WeriftPeer } };
        adaptPeerConnections(holder);

        expect(holder.webrtc.RTCPeerConnection).toBe(WeriftPeer);
    });

    it('refuses a backend already wrapped, which would hide nethernet’s class', () => {
        const holder = { webrtc: { RTCPeerConnection: NetherNetPeer } };
        configurePeerConnections(holder, { icePortRange: [1, 2] });

        expect(() => adaptPeerConnections(holder)).toThrow('before configuring');
    });

    it('lets a real nethernet server and client build peers', () => {
        const server = new Server();
        const client = new Client(server.networkId, '127.0.0.1');

        expect(() => {
            adaptPeerConnections(server);
            adaptPeerConnections(client);
        }).not.toThrow();
    });
});

describe('configurePeerConnections', () => {
    it('adds the configuration to every peer the holder builds, on top of an adapted backend', () => {
        const holder = { webrtc: { RTCPeerConnection: NetherNetPeer } };
        adaptPeerConnections(holder);
        configurePeerConnections(holder, { icePortRange: [47_200, 47_299] });

        expect(build(holder, { iceServers: [] }).record.configuration).toStrictEqual({
            iceServers: [],
            icePortRange: [47_200, 47_299],
            iceUseDefaultStunServer: false
        });
    });
});

describe('the werift nethernet runs', () => {
    it('is a release with the SCTP fixes NetherNet players on a long path need', () => {
        // nethernet pins werift 0.24.4; the workspace override lifts it. Without 0.27.0's fix for
        // werift #806, SCTP stops sending for good after a retransmission timeout that follows a
        // gap ack, which a long or lossy path makes likely.
        const fromNetherNet = createRequire(createRequire(import.meta.url).resolve('nethernet'));
        let directory = path.dirname(fromNetherNet.resolve('werift'));
        const isWerift = (candidate: string) => {
            const manifest = path.join(candidate, 'package.json');
            return existsSync(manifest) && readFileSync(manifest, 'utf8').includes('"name": "werift"');
        };
        while (!isWerift(directory)) {
            if (path.dirname(directory) === directory) throw new Error('nethernet resolves no werift');
            directory = path.dirname(directory);
        }
        const { version } = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as {
            version: string;
        };
        const [major = 0, minor = 0] = version.split('.').map(Number);

        expect(major > 0 || minor >= 27, `nethernet runs werift ${version}`).toBe(true);
    });
});
