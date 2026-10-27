// Spawned by `ServerChild.test.ts` through the real spawn path, so it stands in for the
// server child: it says hello over IPC, writes a line to each stdio pipe, and exits on the
// `shutdown` message. With `--stubborn` it ignores both the message and SIGTERM so the test can
// watch the host escalate to SIGKILL; with `--ignore-shutdown` it ignores only the message, so
// the test can tell SIGTERM from SIGKILL. With `--slow-shutdown` it reports `lifecycle stopping`
// and exits on its own 300 ms later, the way a server saving its world does, and leaves SIGTERM
// at the kernel's default so a SIGTERM shows in its exit. Node runs it with type stripping;
// `tsconfig.json` excludes this directory for that reason.
const stubborn = process.argv.includes('--stubborn');
const ignoreShutdown = stubborn || process.argv.includes('--ignore-shutdown');
const slowShutdown = process.argv.includes('--slow-shutdown');

process.stdout.write(`argv ${JSON.stringify(process.argv.slice(2))}\nsecond line\n`);
process.stderr.write('warning line\n');

if (stubborn) {
    process.on('SIGTERM', () => {});
}

process.on('message', (message) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return;
    if (message.type === 'shutdown' && slowShutdown) {
        process.send?.({ type: 'lifecycle', v: 1, state: 'stopping' });
        setTimeout(() => process.exit(0), 300);
    } else if (message.type === 'shutdown' && !ignoreShutdown) {
        process.send?.({ type: 'lifecycle', v: 1, state: 'stopping' }, () => process.exit(0));
    }
    if (message.type === 'command' && 'id' in message) {
        process.send?.({ type: 'command.result', v: 1, id: message.id, ok: true });
    }
});

process.send?.({ type: 'hello', v: 1, serverVersion: 'fixture', pid: process.pid });
process.send?.({ garbage: true });
setInterval(() => {}, 1 << 30);
