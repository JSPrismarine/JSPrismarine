import { describe, expect, it } from 'vitest';

import {
    CONTAINER_PLATFORM,
    CONTAINER_WORKDIR,
    DEFAULT_CONTAINER_IMAGE,
    EMULATION_SLOWDOWN,
    PUBLISHED_UDP_PORTS,
    RUNNER_ENV,
    containerName,
    containerRunArgs,
    createLauncher,
    describeImageFailure,
    parseRunnerPreference,
    probeContainerRuntime,
    selectRunner
} from './runner.ts';
import type { ContainerRuntime, ProbeCommand, ProbeOutcome, RunnerInputs } from './runner.ts';

/** A probe that answers from a table, and records what it was asked. */
const scriptedProbe = (
    answers: Readonly<Record<string, ProbeOutcome>>
): { run: ProbeCommand; calls: { command: string; args: readonly string[] }[] } => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const run: ProbeCommand = (command, args) => {
        calls.push({ command, args });
        return answers[command] ?? { status: null, stdout: '', stderr: `spawn ${command} ENOENT` };
    };
    return { run, calls };
};

const docker: ContainerRuntime = { command: 'docker', version: '29.9.2' };

const inputs = (overrides: Partial<RunnerInputs> = {}): RunnerInputs => ({
    platform: 'linux',
    arch: 'x64',
    preference: 'auto',
    ...overrides
});

describe('parseRunnerPreference', () => {
    it('defaults to auto when nothing is set', () => {
        expect(parseRunnerPreference(undefined)).toBe('auto');
        expect(parseRunnerPreference('')).toBe('auto');
        expect(parseRunnerPreference('  ')).toBe('auto');
    });

    it('accepts the two kinds and the CLI names a maintainer thinks in', () => {
        expect(parseRunnerPreference('native')).toBe('native');
        expect(parseRunnerPreference('Container')).toBe('container');
        expect(parseRunnerPreference('docker')).toBe('container');
        expect(parseRunnerPreference('podman')).toBe('container');
    });

    it('names the accepted values when the variable holds something else', () => {
        expect(() => parseRunnerPreference('vm')).toThrow(/auto, native or container/);
        expect(() => parseRunnerPreference('vm')).toThrow(RUNNER_ENV.cli);
    });
});

describe('probeContainerRuntime', () => {
    it('asks the daemon rather than PATH, so a stopped daemon is not a runtime', () => {
        const { run, calls } = scriptedProbe({
            docker: {
                status: 1,
                stdout: '',
                stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock.'
            }
        });

        const result = probeContainerRuntime(['docker'], run);

        expect(calls[0]?.args).toContain('{{.Server.Version}}');
        expect(result).toEqual({
            failures: [
                { command: 'docker', problem: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock.' }
            ]
        });
    });

    it('returns the first CLI that answers and keeps its reported version', () => {
        const { run } = scriptedProbe({
            docker: { status: 1, stdout: '', stderr: 'daemon down' },
            podman: { status: 0, stdout: '5.3.1\n', stderr: '' }
        });

        expect(probeContainerRuntime(['docker', 'podman'], run)).toEqual({
            runtime: { command: 'podman', version: '5.3.1' }
        });
    });

    it('stops probing once one answers', () => {
        const { run, calls } = scriptedProbe({ docker: { status: 0, stdout: '29.9.2', stderr: '' } });
        probeContainerRuntime(['docker', 'podman'], run);
        expect(calls.map((call) => call.command)).toEqual(['docker']);
    });

    it('reports a CLI that is not installed without claiming a version', () => {
        const { run } = scriptedProbe({});
        const result = probeContainerRuntime(['docker'], run);
        expect(result).toEqual({ failures: [{ command: 'docker', problem: 'spawn docker ENOENT' }] });
    });

    it('falls back to a status when the CLI said nothing', () => {
        const { run } = scriptedProbe({ docker: { status: 125, stdout: '', stderr: '' } });
        const result = probeContainerRuntime(['docker'], run);
        expect(result).toEqual({
            failures: [{ command: 'docker', problem: '`docker version` exited with status 125' }]
        });
    });

    it('does not promise a version the CLI left empty', () => {
        const { run } = scriptedProbe({ docker: { status: 0, stdout: '\n', stderr: '' } });
        expect(probeContainerRuntime(['docker'], run)).toEqual({
            runtime: { command: 'docker', version: 'unknown version' }
        });
    });
});

describe('selectRunner', () => {
    it('prefers the host CPU where the pinned binary runs, even with a runtime available', () => {
        expect(selectRunner(inputs({ containerRuntime: docker }))).toEqual({ kind: 'native' });
    });

    it('falls back to a container on a host the binary cannot run on', () => {
        expect(selectRunner(inputs({ platform: 'darwin', arch: 'arm64', containerRuntime: docker }))).toEqual({
            kind: 'container',
            runtime: docker,
            emulated: true
        });
    });

    it('does not call a container on a Linux arm64 host anything but emulated', () => {
        expect(selectRunner(inputs({ platform: 'linux', arch: 'arm64', containerRuntime: docker }))).toMatchObject({
            emulated: true
        });
    });

    it('runs a container unemulated on an x86-64 host that asked for one', () => {
        expect(selectRunner(inputs({ preference: 'container', containerRuntime: docker }))).toMatchObject({
            kind: 'container',
            emulated: false
        });
    });

    it('refuses native on a host the binary cannot run on, and says what to unset', () => {
        expect(() => selectRunner(inputs({ platform: 'darwin', arch: 'arm64', preference: 'native' }))).toThrow(
            /darwin\/arm64/
        );
        expect(() => selectRunner(inputs({ platform: 'darwin', arch: 'arm64', preference: 'native' }))).toThrow(
            new RegExp(`Unset ${RUNNER_ENV.runner}`)
        );
    });

    it('refuses a forced container with no runtime, repeating what each CLI said', () => {
        expect(() =>
            selectRunner(
                inputs({
                    preference: 'container',
                    probeFailures: [{ command: 'docker', problem: 'Cannot connect to the Docker daemon' }]
                })
            )
        ).toThrow(/docker: Cannot connect to the Docker daemon/);
    });

    it('names both remedies when neither runner is possible', () => {
        const fail = (): unknown =>
            selectRunner(
                inputs({
                    platform: 'darwin',
                    arch: 'arm64',
                    probeFailures: [{ command: 'docker', problem: 'daemon is not running' }]
                })
            );

        expect(fail).toThrow(/daemon is not running/);
        expect(fail).toThrow(/Docker Desktop/);
        expect(fail).toThrow(/capture\.yml/);
    });

    it('says no CLI is on PATH when nothing was even probed', () => {
        expect(() => selectRunner(inputs({ platform: 'darwin', arch: 'arm64' }))).toThrow(/none of docker, podman/);
    });
});

describe('containerRunArgs', () => {
    const base = {
        image: 'docker.io/library/ubuntu:24.04',
        name: 'jsp-bedrock-capture-7',
        runRoot: '/cache/bds-run/1.26.51.1',
        command: ['./bedrock_server']
    };

    it('runs one interactive foreground container that removes itself', () => {
        const args = containerRunArgs(base);
        expect(args.slice(0, 6)).toEqual(['run', '--rm', '--init', '-i', '--name', 'jsp-bedrock-capture-7']);
        // A pty would change how the engine buffers the lines `run.ts` reads.
        expect(args).not.toContain('-t');
        expect(args.at(-1)).toBe('./bedrock_server');
    });

    it('mounts the staged run directory as the working directory', () => {
        const args = containerRunArgs(base);
        expect(args).toContain(`/cache/bds-run/1.26.51.1:${CONTAINER_WORKDIR}`);
        expect(args[args.indexOf('-w') + 1]).toBe(CONTAINER_WORKDIR);
    });

    it('adds extra mounts, read-only when asked', () => {
        const args = containerRunArgs({
            ...base,
            mounts: [
                { host: '/out', container: '/out' },
                { host: '/cache/bds/1.26.51.1', container: '/pinned', readOnly: true }
            ]
        });
        expect(args).toContain('/out:/out');
        expect(args).toContain('/cache/bds/1.26.51.1:/pinned:ro');
    });

    it('publishes UDP ports on loopback only', () => {
        const args = containerRunArgs({ ...base, udpPorts: [19132] });
        expect(args).toContain('127.0.0.1:19132:19132/udp');
    });

    it('requests the image platform only when one is given', () => {
        expect(containerRunArgs(base)).not.toContain('--platform');
        expect(containerRunArgs({ ...base, platform: CONTAINER_PLATFORM })).toContain(CONTAINER_PLATFORM);
    });

    it('passes the user and the environment through', () => {
        const args = containerRunArgs({ ...base, user: '1000:1000', env: { LD_LIBRARY_PATH: '.' } });
        expect(args[args.indexOf('--user') + 1]).toBe('1000:1000');
        expect(args).toContain('LD_LIBRARY_PATH=.');
    });

    it('puts every option before the image, as the CLI requires', () => {
        const args = containerRunArgs({ ...base, platform: CONTAINER_PLATFORM, user: '1000:1000', udpPorts: [19132] });
        const image = args.indexOf(base.image);
        expect(image).toBeGreaterThan(0);
        expect(args.slice(image + 1)).toEqual(['./bedrock_server']);
        for (const option of ['--platform', '--user', '-v', '-w', '-p']) {
            expect(args.indexOf(option)).toBeLessThan(image);
        }
    });
});

describe('createLauncher', () => {
    it('starts the staged binary itself on the native path and has nothing to clean up', () => {
        const launcher = createLauncher({ kind: 'native' });
        expect(launcher.kind).toBe('native');
        expect(launcher.launch('/cache/run')).toEqual({ command: '/cache/run/bedrock_server', args: [] });
        expect(() => launcher.cleanup()).not.toThrow();
    });

    it('starts the same staged copy through the CLI on the container path', () => {
        const launcher = createLauncher(
            { kind: 'container', runtime: docker, emulated: true },
            { containerName: 'jsp-test' }
        );
        const { command, args } = launcher.launch('/cache/run');

        expect(command).toBe('docker');
        expect(args).toContain(DEFAULT_CONTAINER_IMAGE);
        expect(args).toContain(CONTAINER_PLATFORM);
        expect(args).toContain('/cache/run:/bds');
        expect(args.at(-1)).toBe('./bedrock_server');
    });

    it('publishes the UDP ports only for the pass whose client connects', () => {
        const launcher = createLauncher({ kind: 'container', runtime: docker, emulated: true });
        const published = launcher.launch('/cache/run', { clientConnects: true }).args;
        for (const port of PUBLISHED_UDP_PORTS) expect(published).toContain(`127.0.0.1:${port}:${port}/udp`);
        // A port a pass never uses is one more way for it to fail on `port is already allocated`.
        expect(launcher.launch('/cache/run').args).not.toContain('-p');
        expect(launcher.launch('/cache/run', { clientConnects: false }).args).not.toContain('-p');
    });

    it('pulls the image only when the host does not already have it', () => {
        const { run, calls } = scriptedProbe({ docker: { status: 0, stdout: '', stderr: '' } });
        createLauncher({ kind: 'container', runtime: docker, emulated: true }, { run }).ensureImage();
        expect(calls).toEqual([{ command: 'docker', args: ['image', 'inspect', DEFAULT_CONTAINER_IMAGE] }]);
    });

    it('pulls for the emulated platform when the image is missing', () => {
        let first = true;
        const run: ProbeCommand = (command, args) => {
            calls.push({ command, args });
            const outcome: ProbeOutcome = { status: first ? 1 : 0, stdout: '', stderr: '' };
            first = false;
            return outcome;
        };
        const calls: { command: string; args: readonly string[] }[] = [];
        createLauncher({ kind: 'container', runtime: docker, emulated: true }, { run }).ensureImage();
        expect(calls[1]?.args).toEqual(['pull', '--platform', CONTAINER_PLATFORM, DEFAULT_CONTAINER_IMAGE]);
    });

    it('reports a failed pull against the image rather than as a stalled pass', () => {
        const { run } = scriptedProbe({ docker: { status: 1, stdout: '', stderr: 'no such host' } });
        const launcher = createLauncher({ kind: 'container', runtime: docker, emulated: true }, { run });
        expect(() => launcher.ensureImage()).toThrow(/no such host/);
        expect(() => launcher.ensureImage()).toThrow(new RegExp(RUNNER_ENV.image));
    });

    it('warns that an emulated run is slow, and does not warn when it is not', () => {
        expect(createLauncher({ kind: 'container', runtime: docker, emulated: true }).description).toMatch(
            /emulating linux\/amd64/
        );
        expect(createLauncher({ kind: 'container', runtime: docker, emulated: false }).description).not.toMatch(
            /emulating/
        );
    });

    it('stretches the stage budgets only when the run is emulated', () => {
        expect(createLauncher({ kind: 'native' }).timeoutScale).toBe(1);
        expect(createLauncher({ kind: 'container', runtime: docker, emulated: false }).timeoutScale).toBe(1);
        expect(createLauncher({ kind: 'container', runtime: docker, emulated: true }).timeoutScale).toBe(
            EMULATION_SLOWDOWN
        );
        expect(EMULATION_SLOWDOWN).toBeGreaterThan(1);
    });

    it('honors an image override', () => {
        const launcher = createLauncher(
            { kind: 'container', runtime: docker, emulated: false },
            { image: 'debian:13-slim' }
        );
        expect(launcher.launch('/cache/run').args).toContain('debian:13-slim');
        expect(launcher.launch('/cache/run').args).not.toContain(DEFAULT_CONTAINER_IMAGE);
    });

    it('force-removes the container it named, so a killed CLI leaks nothing', () => {
        const { run, calls } = scriptedProbe({});
        createLauncher(
            { kind: 'container', runtime: docker, emulated: false },
            { containerName: 'jsp-test', run }
        ).cleanup();
        expect(calls).toEqual([{ command: 'docker', args: ['rm', '--force', 'jsp-test'] }]);
    });

    it('names the container after the process, so two captures do not collide', () => {
        expect(containerName(4242)).toBe('jsp-bedrock-capture-4242');
    });
});

describe('describeImageFailure', () => {
    it('reads a missing credential helper as the PATH problem it is, not a broken install', () => {
        const message = describeImageFailure('docker', 'ubuntu:24.04', {
            status: 1,
            stdout: '',
            stderr: 'error getting credentials - err: exec: "docker-credential-desktop": executable file not found'
        });
        expect(message).toContain("docker-credential-desktop is not on this shell's PATH");
        expect(message).toContain('docker pull ubuntu:24.04');
        expect(message).toContain('/Applications/Docker.app/Contents/Resources/bin');
    });

    it('repeats whatever the CLI said for any other failure', () => {
        const message = describeImageFailure('podman', 'ubuntu:24.04', {
            status: 125,
            stdout: '',
            stderr: 'manifest unknown'
        });
        expect(message).toContain('manifest unknown');
        expect(message).not.toContain('PATH');
        expect(message).toContain(RUNNER_ENV.image);
    });
});
