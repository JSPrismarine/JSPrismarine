/**
 * Decides what the capture starts, and how.
 *
 * Mojang publishes Bedrock Dedicated Server as a Linux x86-64 ELF binary (and a Windows one
 * `sources.json` does not pin). The capture used to refuse every other host outright, which left
 * an Apple Silicon maintainer unable to refresh a golden or add a protocol version. A Linux
 * x86-64 container closes that gap: the same binary, the same four passes, the same files on the
 * host, with the host's own CPU only when it can run the thing.
 *
 * Two decisions worth keeping in view.
 *
 * **No image carries the server.** The container mounts the staged run directory, which already
 * holds the copy {@link stageServer} made of the fetched archive, and runs `./bedrock_server`
 * out of it. The image is a stock distribution base with nothing added. Nothing this repository
 * builds, caches or pushes ever contains Mojang's binary, which is the same posture the
 * gitignored fetch cache takes, and no third-party "BDS image" has to be trusted.
 *
 * **The container is a process, not a service.** `run.ts` drives the server over stdin and
 * stdout: the dump pack exfiltrates rows as `DUMP <table> <json>` on the content log, and every
 * pass that keeps a world ends by writing `stop` and waiting. So the run is foreground,
 * interactive (`-i`), removed on exit (`--rm`), named so a lost CLI can still be cleaned up, and
 * its exit status is the server's because that is what `docker run` returns.
 *
 * Everything here is either a pure function over described inputs or takes its one effect as a
 * parameter, so the selection, the failure messages and the argument vector are unit-tested on a
 * host that has no container daemon at all.
 */
import { SERVER_BINARY } from './server.ts';

/** Platform the pinned Bedrock Dedicated Server zip runs on natively. */
export const NATIVE_PLATFORM = 'linux';

/** Architecture the pinned Bedrock Dedicated Server zip runs on natively. */
export const NATIVE_ARCH = 'x64';

/** The `--platform` value a container has to request for the pinned binary. */
export const CONTAINER_PLATFORM = 'linux/amd64';

/** Where the staged run directory is mounted inside the container. */
export const CONTAINER_WORKDIR = '/bds';

/**
 * Image the container runner uses unless {@link RUNNER_ENV.image} overrides it.
 *
 * A stock Ubuntu LTS, because the server is dynamically linked against the glibc and libstdc++
 * of the distribution Mojang builds it on, and because the tag is fully qualified so a host with
 * a rewritten default registry resolves the same image. Nothing is added to it: the server comes
 * from the bind mount.
 */
export const DEFAULT_CONTAINER_IMAGE = 'docker.io/library/ubuntu:24.04';

/** Container CLIs tried in order when nothing names one. Both take the same arguments used here. */
export const CONTAINER_CLIS = ['docker', 'podman'] as const;

/**
 * What every timeout is multiplied by when the container is emulated.
 *
 * A round number with room to spare. Measured once on an M-series Mac through Docker Desktop,
 * which translates x86-64 with Rosetta rather than qemu, the server reached its ready line in
 * seven seconds and the dump pack walked every registry in three and a half, which is the same
 * order as a native run. A host whose runtime falls back to qemu is the case this margin is for,
 * and the cost of guessing high is only that a genuinely stalled run takes longer to say so.
 */
export const EMULATION_SLOWDOWN = 4;

/**
 * UDP ports a container publishes for the one pass whose client has to reach the server.
 *
 * Only the `packets` pass connects to the server, so only it asks for these. Publishing them for
 * every pass made the capture fail on `port is already allocated` whenever anything else on the
 * machine held 19132 — another capture, a leaked container, or a JSPrismarine server somebody
 * left running — in a pass that had no use for the port.
 */
export const PUBLISHED_UDP_PORTS = [19132, 19133] as const;

/** Environment variables that steer the runner, named like the rest of the pipeline's overrides. */
export const RUNNER_ENV = {
    /** `auto`, `native`, or `container` (`docker` and `podman` are accepted as aliases). */
    runner: 'JSP_BDS_RUNNER',
    /** Image the container runner mounts the staged server into. */
    image: 'JSP_BDS_CONTAINER_IMAGE',
    /** Container CLI to use, instead of probing {@link CONTAINER_CLIS}. */
    cli: 'JSP_BDS_CONTAINER_CLI',
    /** An unpacked server to capture, instead of the fetch cache. Read by `run.ts`. */
    serverPath: 'JSP_BDS_PATH'
} as const;

/** Which of the two ways to start the server a run has settled on. */
export type RunnerKind = 'native' | 'container';

/** What the caller asked for, before capabilities are taken into account. */
export type RunnerPreference = RunnerKind | 'auto';

/**
 * Reads {@link RUNNER_ENV.runner}.
 *
 * @throws Error naming the accepted values when the variable holds something else.
 */
export const parseRunnerPreference = (raw: string | undefined): RunnerPreference => {
    const value = raw?.trim().toLowerCase();
    if (value === undefined || value === '' || value === 'auto') return 'auto';
    if (value === 'native') return 'native';
    // The two CLIs are what a maintainer thinks in, so accept them as the kind they select.
    if (value === 'container' || value === 'docker' || value === 'podman') return 'container';
    throw new Error(
        `${RUNNER_ENV.runner}=${raw} is not a runner; expected auto, native or container ` +
            `(docker and podman also select container, and ${RUNNER_ENV.cli} picks which CLI runs).`
    );
};

/** A container CLI that answered a probe, with the daemon version it reported. */
export interface ContainerRuntime {
    /** Executable the capture spawns, such as `docker`. */
    command: string;
    /** Whatever the CLI reported for its server, kept for the log line only. */
    version: string;
}

/** The outcome of probing one CLI: the runtime, or why it is not usable. */
export type ProbeResult = { runtime: ContainerRuntime } | { command: string; problem: string };

/** One attempt to run a command, as {@link probeContainerRuntime} needs it. */
export type ProbeCommand = (command: string, args: readonly string[]) => ProbeOutcome;

/** What running a probe command produced. */
export interface ProbeOutcome {
    /** Exit status, or null when the command could not be started or a signal ended it. */
    status: number | null;
    /** Standard output, trimmed by the caller or not; this module trims it. */
    stdout: string;
    /** Standard error, used verbatim in the failure message. */
    stderr: string;
}

/**
 * Finds a container CLI whose daemon answers.
 *
 * A CLI on `PATH` is not a capability: Docker Desktop installs one that fails every command
 * while the VM is down, which is exactly the state this check has to tell apart from "not
 * installed". `version --format {{.Server.*}}` asks the daemon, so it fails in both cases and
 * succeeds only when a container could actually start.
 *
 * @param candidates CLIs to try in order.
 * @param run Runs a probe command. Injected so the decision is testable without a daemon.
 * @returns The first working runtime, or every candidate's reason for not being one.
 */
export const probeContainerRuntime = (
    candidates: readonly string[],
    run: ProbeCommand
): { runtime: ContainerRuntime } | { failures: readonly { command: string; problem: string }[] } => {
    const failures: { command: string; problem: string }[] = [];
    for (const command of candidates) {
        const outcome = run(command, ['version', '--format', '{{.Server.Version}}']);
        if (outcome.status === 0) {
            const version = outcome.stdout.trim();
            return { runtime: { command, version: version === '' ? 'unknown version' : version } };
        }
        const detail = (outcome.stderr.trim() || outcome.stdout.trim()).split('\n')[0] ?? '';
        failures.push({
            command,
            problem: detail === '' ? `\`${command} version\` exited with status ${outcome.status}` : detail
        });
    }
    return { failures };
};

/** Everything {@link selectRunner} decides from. */
export interface RunnerInputs {
    /** `process.platform` of the host. */
    platform: string;
    /** `process.arch` of the host. */
    arch: string;
    /** What the caller asked for. */
    preference: RunnerPreference;
    /** A working container runtime, when one was found. */
    containerRuntime?: ContainerRuntime;
    /** Why each probed CLI was not usable, used to make the failure message actionable. */
    probeFailures?: readonly { command: string; problem: string }[];
}

/** How the capture will start the server. */
export type RunnerPlan =
    | { kind: 'native' }
    | {
          kind: 'container';
          runtime: ContainerRuntime;
          /** True when the host CPU is not x86-64, so every instruction is translated. */
          emulated: boolean;
      };

const describeProbeFailures = (failures: readonly { command: string; problem: string }[]): string =>
    failures.length === 0
        ? `none of ${CONTAINER_CLIS.join(', ')} is on PATH`
        : failures.map(({ command, problem }) => `${command}: ${problem}`).join('; ');

/**
 * Picks the runner, preferring the host's own CPU.
 *
 * Native wherever the pinned binary runs, because a container there buys nothing and costs a
 * mount and a pull. A container anywhere else. Neither is a hard error that names what to
 * install or set rather than restating the platform.
 *
 * @throws Error describing the one remaining action when no runner is possible.
 */
export const selectRunner = (inputs: RunnerInputs): RunnerPlan => {
    const native = inputs.platform === NATIVE_PLATFORM && inputs.arch === NATIVE_ARCH;
    const host = `${inputs.platform}/${inputs.arch}`;
    const runtime = inputs.containerRuntime;

    if (inputs.preference === 'native') {
        if (native) return { kind: 'native' };
        throw new Error(
            `${RUNNER_ENV.runner}=native asks for the host's own CPU, and the pinned Bedrock Dedicated Server ` +
                `is a ${NATIVE_PLATFORM}/${NATIVE_ARCH} binary while this is ${host}. ` +
                `Unset ${RUNNER_ENV.runner} to run it in a container instead.`
        );
    }

    if (inputs.preference === 'container') {
        if (runtime !== undefined) return { kind: 'container', runtime, emulated: inputs.arch !== NATIVE_ARCH };
        throw new Error(
            `${RUNNER_ENV.runner}=container asks for a container and no container runtime answered ` +
                `(${describeProbeFailures(inputs.probeFailures ?? [])}). ` +
                'Start Docker Desktop or the Docker daemon, or install one, ' +
                `or point ${RUNNER_ENV.cli} at a CLI that works.`
        );
    }

    if (native) return { kind: 'native' };
    if (runtime !== undefined) return { kind: 'container', runtime, emulated: inputs.arch !== NATIVE_ARCH };

    throw new Error(
        `The pinned Bedrock Dedicated Server is a ${NATIVE_PLATFORM}/${NATIVE_ARCH} binary, this host is ${host}, ` +
            `and no container runtime answered (${describeProbeFailures(inputs.probeFailures ?? [])}). ` +
            'Install and start Docker Desktop, Podman or another CLI that takes `docker run` arguments ' +
            `(or name one in ${RUNNER_ENV.cli}), and re-run. ` +
            `On a ${NATIVE_PLATFORM}/${NATIVE_ARCH} machine the capture needs no container at all, and ` +
            '.github/workflows/capture.yml runs it there.'
    );
};

/** A bind mount from the host into the container. */
export interface ContainerMount {
    /** Absolute path on the host. */
    host: string;
    /** Absolute path inside the container. */
    container: string;
    /** Mount read-only. Defaults to read-write. */
    readOnly?: boolean;
}

/** Everything {@link containerRunArgs} turns into an argument vector. */
export interface ContainerLaunch {
    /** Image to run. */
    image: string;
    /** Name given to the container, so a leak can be removed by name. */
    name: string;
    /** The staged run directory, mounted at {@link CONTAINER_WORKDIR} and used as the cwd. */
    runRoot: string;
    /** Extra mounts, such as the output directory when it sits outside the run directory. */
    mounts?: readonly ContainerMount[];
    /** `--platform`, set when the image architecture is not the host's. */
    platform?: string;
    /** `--user`, as `uid:gid`, so files land owned by the invoking user. */
    user?: string;
    /** UDP ports to publish on the loopback interface. */
    udpPorts?: readonly number[];
    /** Environment to set inside the container. */
    env?: Readonly<Record<string, string>>;
    /** The command and its arguments, run inside {@link CONTAINER_WORKDIR}. */
    command: readonly string[];
}

/**
 * Builds the argument vector for one foreground container run.
 *
 * `--rm` and `-i` are not optional here: the capture types `stop` into the server's stdin and
 * reads its console back, and a container that outlived the run would hold the mounted run
 * directory and the published port against the next pass. There is no `-t`, because a pty would
 * make the engine line-buffer differently than `run.ts`'s line reader expects.
 *
 * Ports are published on `127.0.0.1` rather than every interface: the only client is the
 * capture tool on this machine, and a world-reachable offline-mode server is not wanted.
 */
export const containerRunArgs = (launch: ContainerLaunch): string[] => {
    const args = ['run', '--rm', '--init', '-i', '--name', launch.name];
    if (launch.platform !== undefined) args.push('--platform', launch.platform);
    if (launch.user !== undefined) args.push('--user', launch.user);
    args.push('-v', `${launch.runRoot}:${CONTAINER_WORKDIR}`);
    for (const mount of launch.mounts ?? []) {
        args.push('-v', `${mount.host}:${mount.container}${mount.readOnly === true ? ':ro' : ''}`);
    }
    args.push('-w', CONTAINER_WORKDIR);
    for (const port of launch.udpPorts ?? []) args.push('-p', `127.0.0.1:${port}:${port}/udp`);
    for (const [key, value] of Object.entries(launch.env ?? {})) args.push('-e', `${key}=${value}`);
    args.push(launch.image, ...launch.command);
    return args;
};

/** What a launcher hands {@link startServer}. */
export interface ServerCommand {
    command: string;
    args: readonly string[];
    env?: Record<string, string>;
}

/** What a pass needs of the runner beyond the staged directory. */
export interface LaunchNeeds {
    /**
     * A client on the host connects to the server, so a container has to publish its UDP ports.
     *
     * Only the `packets` pass does. The others drive the server over its console alone, and a
     * published port they never use is one more way for the pass to fail.
     */
    clientConnects?: boolean;
}

/** Starts the staged server one way or the other, and cleans up after itself. */
export interface ServerLauncher {
    readonly kind: RunnerKind;
    /** One line for the capture's log, naming the runner and anything slow about it. */
    readonly description: string;
    /**
     * What the capture's timeouts are multiplied by.
     *
     * The timeouts in `run.ts` are sized for a native run. Translated x86-64 instructions are
     * slow enough that the reference world pass would hit its limit mid-generation and report a
     * stall that is really just emulation, so an emulated run gets {@link EMULATION_SLOWDOWN}
     * times as long. Everything else runs at 1.
     */
    readonly timeoutScale: number;
    /** The command for a staged server's run directory. */
    launch(runRoot: string, needs?: LaunchNeeds): ServerCommand;
    /**
     * Makes sure the run can start without the runner reaching for a registry.
     *
     * Called once before the first pass, because an image pull failing six minutes into a staged
     * capture reports as the server exiting with a CLI status rather than as what it is.
     *
     * @throws Error naming the image and what the CLI said when the image cannot be obtained.
     */
    ensureImage(): void;
    /**
     * Removes anything the last {@link launch} may have leaked.
     *
     * A container outlives a killed CLI, which is what a timeout kill and a Ctrl+C both produce,
     * so this runs after every pass and from the signal handlers.
     */
    cleanup(): void;
}

/** What {@link createLauncher} needs beyond the plan. */
export interface LauncherOptions {
    /** Image for the container runner. Defaults to {@link DEFAULT_CONTAINER_IMAGE}. */
    image?: string;
    /** Host uid and gid to write files as, when the host benefits from it. */
    user?: string;
    /** Names the container. Defaults to a name derived from the process id. */
    containerName?: string;
    /** Runs the cleanup command. Injected so the launcher is testable. */
    run?: ProbeCommand;
}

/**
 * Explains a failed image pull, including the one failure that has nothing to do with the image.
 *
 * Docker Desktop configures `credsStore`, so every registry request shells out to
 * `docker-credential-desktop`. A shell whose `PATH` lacks Docker's own `bin` directory therefore
 * fails to pull a *public* image with a message about a missing executable, which reads like a
 * broken install rather than a `PATH`. The remedy is to pull the image once from a shell that has
 * the helper, after which the capture never touches a registry again, so say that.
 */
export const describeImageFailure = (cli: string, image: string, pull: ProbeOutcome): string => {
    const said = (pull.stderr.trim() || pull.stdout.trim()).split('\n').slice(-3).join(' ');
    // The name is quoted inside the CLI's message, so match the executable rather than the token.
    const credentialHelper = /docker-credential-[\w.-]+/.exec(said)?.[0];
    return (
        `${cli} could not obtain ${image}, which the capture runs the staged server in: ${said}` +
        (credentialHelper === undefined
            ? `\nPull it by hand, or name an image the host already has in ${RUNNER_ENV.image}.`
            : `\n${credentialHelper} is not on this shell's PATH, so ${cli} cannot talk to a registry even ` +
              `for a public image. Run \`${cli} pull ${image}\` from a shell that has Docker's own bin ` +
              'directory on PATH (on macOS, /Applications/Docker.app/Contents/Resources/bin) and re-run ' +
              'the capture: with the image cached, nothing in the capture reaches a registry.')
    );
};

/** The name the container is given, so a leak is identifiable and removable. */
export const containerName = (pid: number): string => `jsp-bedrock-capture-${pid}`;

/**
 * Turns a plan into something the capture can start.
 *
 * The native launcher is the behavior the capture always had: the staged binary, started from
 * outside its own directory with the run directory as the cwd.
 */
export const createLauncher = (plan: RunnerPlan, options: LauncherOptions = {}): ServerLauncher => {
    if (plan.kind === 'native') {
        return {
            kind: 'native',
            description: `natively on ${NATIVE_PLATFORM}/${NATIVE_ARCH}`,
            timeoutScale: 1,
            launch: (runRoot) => ({ command: `${runRoot}/${SERVER_BINARY}`, args: [] }),
            ensureImage: () => {},
            cleanup: () => {}
        };
    }

    const image = options.image ?? DEFAULT_CONTAINER_IMAGE;
    const name = options.containerName ?? containerName(process.pid);
    const run = options.run;
    return {
        kind: 'container',
        description:
            `in ${plan.runtime.command} (${plan.runtime.version}) from ${image}` +
            (plan.emulated
                ? `, emulating ${CONTAINER_PLATFORM} on this host. Expect the capture to take several times ` +
                  'as long as it does on x86-64, and the reference world pass longest of all.'
                : ''),
        timeoutScale: plan.emulated ? EMULATION_SLOWDOWN : 1,
        launch: (runRoot, needs) => ({
            command: plan.runtime.command,
            args: containerRunArgs({
                image,
                name,
                runRoot,
                platform: plan.emulated ? CONTAINER_PLATFORM : undefined,
                user: options.user,
                udpPorts: needs?.clientConnects === true ? PUBLISHED_UDP_PORTS : undefined,
                // The server loads its own shared objects out of its working directory, which is
                // the mount; the native path sets the same variable in the child's environment.
                env: { LD_LIBRARY_PATH: '.' },
                command: [`./${SERVER_BINARY}`]
            })
        }),
        ensureImage: () => {
            if (run === undefined) return;
            if (run(plan.runtime.command, ['image', 'inspect', image]).status === 0) return;
            const pull = run(plan.runtime.command, [
                'pull',
                ...(plan.emulated ? ['--platform', CONTAINER_PLATFORM] : []),
                image
            ]);
            if (pull.status === 0) return;
            throw new Error(describeImageFailure(plan.runtime.command, image, pull));
        },
        cleanup: () => {
            // `--rm` covers the ordinary exit; this covers the CLI being killed out from under it.
            run?.(plan.runtime.command, ['rm', '--force', name]);
        }
    };
};
