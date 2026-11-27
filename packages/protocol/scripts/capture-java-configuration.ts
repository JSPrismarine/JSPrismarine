/**
 * Writes `src/java/versions/<release>/configuration.json`: what the pinned vanilla server sends a
 * client in the configuration phase, which the server replays to a Java Edition client.
 *
 * It runs the release's server jar in a scratch directory, offline and on a flat world, logs in
 * with this package's own packets, says it knows the `minecraft:core` pack the server offers, and
 * records the feature flags, the known packs, each registry's entry ids in order and every tag.
 * The order of a registry's entries is what gives each its network id, and the tags name entries by
 * those ids, so both come from the server rather than being rebuilt.
 *
 * A capture-time task, run on a Java version bump:
 * `pnpm --filter @jsprismarine/protocol run capture:java-configuration [--java <release>]`. It needs
 * the jar `pnpm --filter @jsprismarine/bedrock-data run ensure:java-server` caches and a JDK the jar
 * can run on.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { javaServerCacheFolder } from '@jsprismarine/bedrock-data/sources';

import { findJdkHome, jdkBinaryPath } from '../../bedrock-data/utils/java/jdk.ts';
import { readJarVersion } from '../../bedrock-data/utils/java/release.ts';
import {
    ClientboundKnownPacks,
    FeatureFlags,
    FinishConfiguration,
    RegistryData,
    ServerboundKnownPacks,
    UpdateTags
} from '../src/java/packet/configuration.ts';
import { ClientIntent, Intention } from '../src/java/packet/handshake.ts';
import type { JavaPacketDefinition, JavaPayload } from '../src/java/packet/JavaPacket.ts';
import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId, javaPacketId } from '../src/java/packet/JavaPacket.ts';
import type { JavaProtocol } from '../src/java/versions/javaRelease.ts';
import { LoginAcknowledged, LoginStart, LoginSuccess, SetCompression } from '../src/java/packet/login.ts';
import type { JavaConfiguration } from '../src/java/versions/javaConfiguration.ts';
import { compressFrame, decompressFrame } from '../src/java/wire/compression.ts';
import { framed, JavaFrameReader } from '../src/java/wire/frames.ts';

const packageDir = resolve(fileURLToPath(import.meta.url), '../..');
const repoRoot = resolve(packageDir, '../..');
const flag = process.argv.indexOf('--java');
const release = flag === -1 ? javaServerCacheFolder : process.argv[flag + 1];
if (release === undefined) throw new Error('--java needs a release id');

const jar = join(repoRoot, 'node_modules/.cache/jsprismarine/java', release, 'server.jar');
if (!existsSync(jar)) {
    throw new Error(`${jar} is missing; run pnpm --filter @jsprismarine/bedrock-data run ensure:java-server`);
}
const { java_version: jdk, protocol_version: protocol } = await readJarVersion(jar);

// The release's own packet ids, which `dump:java-protocol` writes before it runs this, so a release
// is captured before the server speaks it.
const versionDir = join(packageDir, 'src/java/versions', release);
if (!existsSync(join(versionDir, 'packets.ts'))) {
    throw new Error(
        `${versionDir}/packets.ts is missing; run pnpm --filter @jsprismarine/bedrock-data run dump:java-protocol --java ${release}`
    );
}
// Modules this repository generates, loaded by path because the release is chosen at run time.
const { PACKETS } = await import(pathToFileURL(join(versionDir, 'packets.ts')).href);
const { RELEASE } = await import(pathToFileURL(join(versionDir, 'release.ts')).href);
const RELEASE_PROTOCOL: JavaProtocol = { ...RELEASE, packets: PACKETS };
const java = jdkBinaryPath(findJdkHome({ minimumMajor: jdk }), 'java');

/** A port nothing listens on, for the vanilla server to take. */
const freePort = await new Promise<number>((done) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
        const address = probe.address();
        probe.close(() => done(typeof address === 'object' && address !== null ? address.port : 0));
    });
});

const dir = mkdtempSync(join(tmpdir(), 'jsp-java-configuration-'));
writeFileSync(join(dir, 'eula.txt'), 'eula=true\n');
writeFileSync(
    join(dir, 'server.properties'),
    [
        `server-port=${freePort}`,
        'server-ip=127.0.0.1',
        'online-mode=false',
        'white-list=false',
        'level-type=minecraft\\:flat',
        'generate-structures=false'
    ].join('\n') + '\n'
);
const server = spawn(java, ['-Xmx1G', '-jar', jar, 'nogui'], { cwd: dir, stdio: ['pipe', 'pipe', 'inherit'] });
try {
    await new Promise<void>((ready, failed) => {
        let log = '';
        server.stdout.on('data', (chunk: Buffer) => {
            log += chunk.toString('utf8');
            if (log.includes('Done (')) ready();
        });
        server.once('exit', (code) => failed(new Error(`the vanilla server exited with ${code} before it was ready`)));
    });

    const capture = await captureConfiguration(freePort);
    const out = join(packageDir, 'src/java/versions', release, 'configuration.json');
    // A tag's ids on one line each, or the file is mostly line breaks.
    const json = JSON.stringify(capture, null, 4).replace(
        /\[\s+(-?\d+(?:,\s+-?\d+)*)\s+\]/g,
        (_, ids: string) => `[${ids.split(/,\s+/).join(', ')}]`
    );
    writeFileSync(out, `${json}\n`);
    console.log(
        `Wrote ${release}'s configuration: ${capture.registries.length} registries, ${capture.tags.length} tagged registries`
    );
} finally {
    server.stdin.end('stop\n');
    await new Promise((stopped) => server.once('exit', stopped));
    rmSync(dir, { recursive: true, force: true });
}

/** Logs in offline and records the configuration phase up to `Finish Configuration`. */
async function captureConfiguration(port: number): Promise<JavaConfiguration> {
    const socket = connect(port, '127.0.0.1');
    await new Promise<void>((done) => socket.once('connect', () => done()));
    const reader = new JavaFrameReader();
    const frames: Buffer[] = [];
    let wake: (() => void) | undefined;
    socket.on('data', (chunk: Buffer) => {
        const read = reader.push(chunk);
        if ('malformed' in read) throw new Error(`the vanilla server sent ${read.malformed}`);
        frames.push(...read.frames);
        wake?.();
    });
    let compression: number | undefined;
    const send = <D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>) => {
        const packet = encodeJavaPacket(RELEASE_PROTOCOL, definition, value);
        socket.write(framed(compression === undefined ? packet : compressFrame(packet, compression)));
    };
    const next = async () => {
        while (frames.length === 0) await new Promise<void>((done) => (wake = done));
        const frame = frames.shift()!;
        return readJavaPacketId(compression === undefined ? frame : decompressFrame(frame, compression));
    };
    const expect = async <D extends JavaPacketDefinition>(definition: D): Promise<JavaPayload<D>> => {
        const { id, body } = await next();
        if (id !== javaPacketId(RELEASE_PROTOCOL, definition))
            throw new Error(`expected ${definition.name}, got packet ${id}`);
        return decodeJavaPacket(RELEASE_PROTOCOL, definition, body);
    };

    send(Intention, {
        protocolVersion: protocol,
        serverAddress: '127.0.0.1',
        serverPort: port,
        intent: ClientIntent.Login
    });
    send(LoginStart, { name: 'Capture', profileId: '00000000-0000-0000-0000-000000000000' });
    compression = (await expect(SetCompression)).threshold;
    await expect(LoginSuccess);
    send(LoginAcknowledged, {});

    const capture: JavaConfiguration = { features: [], knownPacks: [], registries: [], tags: [] };
    for (;;) {
        const { id, body } = await next();
        if (id === javaPacketId(RELEASE_PROTOCOL, FeatureFlags))
            capture.features = decodeJavaPacket(RELEASE_PROTOCOL, FeatureFlags, body).features;
        else if (id === javaPacketId(RELEASE_PROTOCOL, ClientboundKnownPacks)) {
            capture.knownPacks = decodeJavaPacket(RELEASE_PROTOCOL, ClientboundKnownPacks, body).packs;
            send(ServerboundKnownPacks, { packs: capture.knownPacks });
        } else if (id === javaPacketId(RELEASE_PROTOCOL, RegistryData)) {
            const { registry, entries } = decodeJavaPacket(RELEASE_PROTOCOL, RegistryData, body);
            capture.registries.push({ registry, entries: entries.map((entry) => entry.id) });
        } else if (id === javaPacketId(RELEASE_PROTOCOL, UpdateTags)) {
            // Vanilla walks hash maps to send these, so the order changes from run to run; sorted,
            // a recapture of the same jar writes the same file. Neither order means anything.
            const byName = (a: { name: string }, b: { name: string }) =>
                a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
            capture.tags = decodeJavaPacket(RELEASE_PROTOCOL, UpdateTags, body)
                .registries.map(({ registry, tags }) => ({ registry, tags: [...tags].sort(byName) }))
                .sort((a, b) => byName({ name: a.registry }, { name: b.registry }));
        } else if (id === javaPacketId(RELEASE_PROTOCOL, FinishConfiguration)) break;
    }
    socket.destroy();
    return capture;
}
