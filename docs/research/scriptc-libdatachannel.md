# libdatachannel in a scriptc build

Researched 2026-11-11. Scope: whether the NetherNet server's WebRTC backend can run on libdatachannel inside an executable built by scriptc, the ahead-of-time compiler behind `pnpm run package:scriptc`. Covers whether scriptc loads Node-API addons, what its native FFI can express, how native code gets into the executable, which parts of libdatachannel's C API (`rtc/rtc.h`) the server needs, a sketch of the shim that would replace `node-datachannel/polyfill`, and the risks. It assumes the rest of the server eventually compiles under scriptc. [docs/plans/webrtc-backend.md](../plans/webrtc-backend.md) is the plan this feeds; its spike ran node-datachannel under Node.js and Bun.

[ADR 0006](../adr/0006-libdatachannel-for-nethernet-server.md) replaces this note's recommendation to keep `node-datachannel/polyfill` for Node.js and Bun: we build libdatachannel ourselves and bind the same C layer on every runtime. The findings below are as they were.

Versions: scriptc 0.4.11 (`node_modules/scriptc`, CLI from `@scriptc/cli-linux-x64-gnu`), the scriptc.dev documentation as served on 2026-11-11, node-datachannel 0.33.6, which pins libdatachannel v0.24.6 (`GIT_TAG "v0.24.6"` in node-datachannel's `CMakeLists.txt`; v0.24.6 is also libdatachannel's latest release), and `nethernet` 1.1.2. Host for the experiments: Ubuntu 26.04.1, x86-64, glibc, gcc as the linker driver because clang is not installed.

Each claim below is marked as read (from a cited source) or run (from an experiment in the [reproduction](#reproduction) section).

## Summary

- scriptc's compiled code cannot load a `.node` addon. Its documentation says so, and the build rejects direct `createRequire` calls to local addons. (Read.)
- scriptc 0.4.11 has a second route the user did not expect: a package outside the native subset runs in a Node island, a real Node.js 24.22.1 loaded into the process from the `@scriptc/libnode-linux-x64-gnu` pack. A scriptc executable that imports `node-datachannel/polyfill` built with `--npm-static auto` and the pack, embedded the package and its `node_datachannel.node`, and moved 2,000,000 bytes over a data channel between two peers, one of them on an `enableIceUdpMux` port. The cost is a 131 MB `libnode.so.137` shipped beside the executable, and a Node.js runtime inside a program whose point was to have none. (Run.)
- The FFI route works end to end. A scriptc executable linked a static libdatachannel v0.24.6 with OpenSSL through a 113-line C shim, served two client peers on one muxed UDP port, delivered 2,000,000 of 2,000,000 bytes to each, and read the selected candidate pair for both. The executable is 10.8 MB and needs no libdatachannel or OpenSSL shared library at run time. (Run.)
- scriptc's FFI format 5 accepts callbacks that a library calls from its own threads. The native trampoline copies the arguments, queues them, and returns; the TypeScript closure runs later on the event loop, one invocation per loop turn, in enqueue order. In a test that fired 20,003 events from a pthread, all arrived, in order, intact, and none ran before the synchronous turn that registered them ended. No polling is needed. (Read and run.)
- libdatachannel's callbacks do not fit scriptc's FFI directly. scriptc needs the context pointer in the same call that registers the callback, while libdatachannel sets one user pointer per id through a separate `rtcSetUserPointer`. Its message callback passes an `int` size where scriptc's `bytes` class passes `size_t`, and its configuration is a struct, which scriptc cannot pass. A small C shim solves all three. Its design is one event sink that every libdatachannel callback calls. (Read and run.)
- `--npm-static auto` compiles npm packages' JavaScript. It never links native code. Native code reaches the executable only through `--ffi <manifest.json>`, whose `libraries` list takes object files and archives, and in practice also accepted a shared library path. Cross-compilation does not translate native inputs, so every target needs its own libdatachannel build. (Read and run.)
- The C API exposes `enableIceUdpMux`, `portRangeBegin`, `portRangeEnd`, `rtcGetSelectedCandidatePair` and `rtcGetBufferedAmount`. It has no byte counters, no round-trip time and nothing about data inside usrsctp. The C++ API has `bytesSent`, `bytesReceived` and `rtt`, and node-datachannel's `getStats()` reads those. (Read.)
- Closing did not lose data between two libdatachannel peers. In 22 runs of five close orders, including nethernet's own (close each channel, then the peer connection, without waiting), the receiver got all 2,000,000 bytes. That fits the source: closing stops the send queue, flushes it, then calls `usrsctp_shutdown(SHUT_WR)`, a graceful SCTP shutdown. The spike's loss was measured against a werift receiver, so the loss probably sits on the werift side. That is not proven. (Read and run.)
- Recommendation: take the FFI route for the scriptc build, keep `node-datachannel/polyfill` for Node.js and Bun, and put both behind the one swap point the plan already calls for. Do the scriptc work only once the server compiles under scriptc, because nothing in this note can be tested in the real build before then. Use the Node island route only as a stopgap.

## 1. Node-API addons

The limitations page is direct: "Node-API (N-API) and V8 `.node` addons depend on Node.js itself, so compiled programs can't load them. Direct `createRequire` calls to local addons are rejected at compile time. A package that requires an addon needs a JavaScript implementation that compiles, or a replacement through native FFI." ([limitations, native addons](https://scriptc.dev/docs/limitations#native-addons)). The FFI guide adds that "Renaming a `.node` file, or linking an archive that still calls `napi_*` functions, doesn't remove its dependency on Node.js." ([FFI, replace a Node-API addon](https://scriptc.dev/docs/ffi#replacing-a-node-api-addon)). (Read.)

That rules out the cheapest trick, linking node-datachannel's prebuilt binary as a library. It would not work anyway: `nm -D --defined-only` finds no `rtc*` symbols in `@node-datachannel/linux-x64-gnu/node_datachannel.node`. node-datachannel binds libdatachannel's C++ API (`src/cpp/peer-connection-wrapper.cpp`), links it statically as `datachannel-static` with static OpenSSL, and exports only its Node-API entry point. (Run.)

### Node islands

scriptc 0.4.11 runs a package it cannot compile in a Node island. The build reported:

```text
note SC8001: package 'node-datachannel@0.33.6' runs in a Node island: runtime: R1.2 SC2013: its
node:module namespace or default import has no static createRequire usage proof
hint: it runs in Node.js loaded into the program on first use; --node-islands=off makes this an error
```

Without a libnode pack the build stops with `SC8005: this program calls into Node.js (@scriptc/node), but no libnode pack is installed: install @scriptc/libnode-linux-x64-gnu`. With the pack passed as `--libnode <dir>` it built. (Run.)

The scriptc documentation describes the mechanism: "A package that runs in a Node island is loaded by Node.js inside the program's process, the first time the program uses it. The package's JavaScript travels in the executable and is extracted once into the user's cache directory" (`~/.cache/scriptc/node-islands/<digest>/`, from [scriptc.dev/llms.txt](https://scriptc.dev/llms.txt)). The extracted tree held `@node-datachannel/linux-x64-gnu/node_datachannel.node`, so the addon travels with the executable too. The executable kept working after it was copied to a directory with no `node_modules` near it. (Read and run.)

The pack's `manifest.json` names Node.js 24.22.1, module version 137, a `libnode.so.137` of 131,233,232 bytes, a `libscr_node_bridge.so`, and a minimum glibc of 2.28. The executable loads the pack from the path given at build time, or from beside itself with `--libnode beside` (`scriptc build --help`). (Read.)

A loopback through the island worked: compiled TypeScript created two `RTCPeerConnection`s from the polyfill, one with `enableIceUdpMux` on port 19563, set event handlers on them, exchanged the offer, answer and candidates, and the server peer received 2,000,000 of 2,000,000 bytes. (Run.)

Two limits from the documentation matter for a server. Values cross between compiled code and the island by copy or adaptation, and "an object the island made never converts to a type only compiled code can make", such as a `Date` or an `http.Server` ([llms.txt](https://scriptc.dev/llms.txt), coverage section). Worker threads reach an island only through the main thread: "A worker that reaches a Node island posts each island operation to the thread that started the island, the main thread", and asynchronous island calls from a worker reject with `ERR_SCRIPTC_ISLAND_WORKER_ASYNC` ([limitations, native worker threads](https://scriptc.dev/docs/limitations#native-worker-threads)). The WebRTC backend runs on the main thread, so the second limit does not bite today. (Read.)

One inconsistency: `scriptc build --help` describes `--node-islands` as "REPORT-ONLY in this version: coverage reports the islands a build would choose; builds compile as before". The build above did use an island. The flag's policy settings may be report-only while the default behavior is live. (Read and run.)

## 2. The FFI

scriptc binds a body-less TypeScript `declare function` to a C symbol named in a JSON manifest passed with `--ffi`. "Only direct calls to that exact declaration become native calls. A function with a body, an overload, a generic declaration, an alias such as `const f = nativeScale`, or a shadowing local stays an ordinary TypeScript function." There is no `dlopen` at run time: "runtime `dlopen`/`dlsym` loading remains unsupported", and the `node:ffi` compatibility catalog "resolves only bindings compiled into the binary". ([FFI](https://scriptc.dev/docs/ffi)). (Read.)

### Values

The manifest, not the TypeScript type, picks the C type. From the [ABI classes](https://scriptc.dev/docs/ffi#abi-classes) table:

| Class | TypeScript | C | Notes |
| --- | --- | --- | --- |
| `f64`, `f32`, `bool`, `u8`, `i8`, `u16`, `i16`, `u32`, `i32` | `number`, `boolean` | the matching scalar | `f32`, `i8`, `u16`, `i16` need format 6 |
| `i64`, `u64`, `pointer` | `bigint` | `int64_t`, `uint64_t`, `void *` | format 7; refused in foreign-thread callback parameters |
| `string` | `string` | `const uint8_t *, size_t` | UTF-8, borrowed for the call, not NUL-terminated |
| `bytes` | `Uint8Array` or `Buffer` | `const uint8_t *, size_t` | borrowed for the call |
| `mutable-bytes` | `Uint8Array` or `Buffer` | `uint8_t *, size_t` | format 6; native code may write within the length |
| `cstring` | `string` | `const char *` | callback parameters only |

"String and byte returns remain unsupported because they need an explicit ownership and allocator contract." The boundary rules add: "There are no variadic calls, struct-by-value arguments, or owned pointer returns", and C++ exceptions must not unwind across the boundary. (Read.)

For libdatachannel that means:

- `rtcCreatePeerConnection(const rtcConfiguration *)` takes a struct pointer. Format 7 could pass a `pointer` to bytes the program lays out by hand, which ties TypeScript to the struct's padding. A C wrapper that takes scalars is safer.
- `rtcSetRemoteDescription`, `rtcAddRemoteCandidate` and `rtcCreateDataChannel` want NUL-terminated `const char *`. scriptc's `string` is a pointer and a length with no terminator, so a wrapper copies it.
- `rtcSendMessage(int id, const char *data, int size)` takes an `int` size where `bytes` passes `size_t`. A wrapper narrows it.
- `rtcGetLocalDescription`, `rtcGetSelectedCandidatePair` and the other getters fill a caller buffer, which `mutable-bytes` expresses. They return `int` sizes, which fit `i32`.

### Callbacks

Formats 2 to 5 add callbacks. Each callback descriptor names its own context entry, a `void *` the compiler supplies, at its real position in both the registering function's parameters and the callback's parameters. `lifetime: "retained"` (format 4) keeps a closure registered past the call until a paired release binding runs. `invoke: "foreign"` (format 5) is for "libraries that invoke the callback from their own threads" ([FFI, callbacks from other threads](https://scriptc.dev/docs/ffi#callbacks-from-other-threads)):

> The native trampoline never runs script code. It copies scalar values and native string/byte memory into plain staging storage, posts to the process event loop, and returns immediately [...] even if native code happened to invoke it on the script thread. The loop delivers one invocation per turn, FIFO by enqueue order, with microtasks and timers interleaved. Live foreign registrations are ref'd: they keep the loop alive until their paired release binding runs.

Foreign callbacks must be retained, return `void`, and have a context entry. "Direct execution of script closures on native threads remains permanently unsupported because reference counting, exception cells, and fibers are thread-confined." (Read.)

That is the same contract node-datachannel builds by hand with `napi_threadsafe_function` in `src/cpp/thread-safe-callback.cpp`, so the shim gets thread marshaling from the compiler.

libdatachannel calls its callbacks from its thread pool: `Processor` "Processed tasks in order by delegating them to the thread pool" (`src/impl/processor.hpp`), and `rtcSetThreadPoolSize` notes "Applied when threads are spawned" (`include/rtc/rtc.h`). Its callbacks have the shape `void cb(int id, ..., void *ptr)`, with the context last, which scriptc can describe. But the registering functions, such as `rtcSetMessageCallback(int id, rtcMessageCallbackFunc cb)`, take no context. libdatachannel instead looks up one user pointer per id, set by `rtcSetUserPointer` (`src/capi.cpp`, `getUserPointer`). scriptc would hand every callback its own context, and libdatachannel has room for one per id. (Read.)

### Verified behavior

A stand-in shim in C started a pthread that called one registered foreign sink with a description string, a state value, 20,000 binary messages of 1,200 bytes each carrying their index, and an end marker. The TypeScript side registered the sink and then ran a 5,000,000-iteration loop on the same turn. (Run.)

- All 20,000 messages arrived, in index order, with intact contents.
- The thread that called the sink was not the script thread, and no delivery ran before the synchronous turn ended.
- The program released the sink from inside its own last delivery and then exited by itself, as the documentation describes for ref'd registrations.
- A `mutable-bytes` getter filled a 256-byte `Uint8Array` with a candidate line. A 4-byte buffer got libdatachannel's `RTC_ERR_TOO_SMALL` (-4) back, so the copy-into-caller-buffer pattern works.
- `bytes` arguments honored `subarray` offsets. Ten sends of `payload.subarray(i * 10)` over a 1,000-byte array summed to 9,550 bytes on the C side.

## 3. Linking

The manifest's `libraries` are "archive or object paths. Relative paths are resolved from the manifest directory and appended after the generated program at link time", and `system_libraries` become `-l` flags ([FFI, manifest fields](https://scriptc.dev/docs/ffi#manifest-fields)). The linker driver is "clang on macOS and glibc Linux, zig elsewhere", overridable with `SCRIPTC_LINKER` ([CLI reference](https://scriptc.dev/docs/cli)). "The archive or object must match the build target. Cross-compilation does not translate native inputs." (Read.)

`--npm-static` has nothing to do with native code. The help text says it "compile[s] the named npm packages' shipped JS statically as program modules", and `auto` "opts in every eligible direct import: own .d.ts, no build-transform markers". A package that loads an addon is not eligible and goes to a Node island, as section 1 shows. (Read and run.)

What linked here (run):

- libdatachannel v0.24.6 built as `datachannel-static` with `NO_MEDIA`, `NO_WEBSOCKET`, `NO_EXAMPLES` and `NO_TESTS`, which pulls libjuice and usrsctp but not libsrtp. The archives are `libdatachannel-static.a` (4.6 MB), `libjuice-static.a` and `libusrsctp.a`.
- OpenSSL 3.5.5 from Ubuntu's `libssl-dev` as static `libssl.a` and `libcrypto.a`. Ubuntu's `libcrypto.a` also needs `libjitterentropy.a`, zlib, zstd and brotli. The build took the jitterentropy archive and the system's `libz.so.1` and `libzstd.so.1` by path in `libraries`, so `libraries` accepts a shared object path too, contrary to what its description implies. An OpenSSL configured for this purpose, without compression, would not need them.
- `system_libraries: ["stdc++", "pthread", "dl"]` for the C++ runtime, because libdatachannel is C++.
- The result is a 10.8 MB executable whose `ldd` lists only `libz`, `libzstd`, `libstdc++`, `libgcc_s`, `libm`, `libc` and the loader. Statically linking libstdc++ by putting its archive in `libraries` is plausible but untested.

So a scriptc build can carry libdatachannel inside the executable. Releases would need a libdatachannel and OpenSSL build for every target scriptc supports, made in CI. node-datachannel already maintains that matrix for its prebuilt binaries (Android arm64, macOS arm64 and x64, Linux arm64 and x64 on glibc and musl, Windows arm64 and x64, per the spike) and its `CMakeLists.txt` is a working recipe.

## 4. What the C API offers the server

From `include/rtc/rtc.h` and `src/capi.cpp` at v0.24.6 (read):

| The server needs | C API |
| --- | --- |
| One UDP port for every peer | `rtcConfiguration.enableIceUdpMux` ("libjuice only"), copied to the C++ configuration in `rtcCreatePeerConnection` |
| A port range | `rtcConfiguration.portRangeBegin` and `portRangeEnd`, "0 means automatic" |
| The client's address | `rtcGetSelectedCandidatePair(pc, local, localSize, remote, remoteSize)`, which returns both candidates as SDP lines, or `RTC_ERR_NOT_AVAIL`. `rtcGetRemoteAddress(pc, buffer, size)` gives the remote address alone |
| Buffered bytes | `rtcGetBufferedAmount(id)`, "total size buffered to send", with `rtcSetBufferedAmountLowThreshold` and `rtcSetBufferedAmountLowCallback` |
| Bytes in usrsctp or in flight | nothing |
| Byte counters and round-trip time | nothing; the C++ `PeerConnection` has `bytesSent()`, `bytesReceived()` and `rtt()` (`include/rtc/peerconnection.hpp`) |
| A graceful close | `rtcClose(dc)` and `rtcClosePeerConnection(pc)`; see below |

The run in section 3 confirmed the mux and the candidate pair: both server peers reported local `... 19561 typ host` with remote ports 48268 and 42682. The C API's candidate lines carry the `a=candidate:` prefix, the same prefix the spike had to strip from the polyfill's trickled candidates, so the shim strips it in both places. (Run.)

`rtcGetBufferedAmount` counts libdatachannel's own send queue and nothing below it. `SctpTransport::send` adds a message's size when it queues the message, and `trySendQueue` subtracts the size once `usrsctp_sendv` accepts it (`src/impl/sctptransport.cpp`). Data that usrsctp holds is invisible to it, which matches what the spike measured. (Read.)

Messages can also be polled. `rtcReceiveMessage(id, buffer, &size)` and `rtcGetAvailableAmount(id)` work only while no message callback is set, and `rtcSetAvailableCallback` signals that messages are waiting (DOC.md, `rtcReceiveMessage`). The other state can be read on demand with `rtcGetLocalDescription`, `rtcIsOpen`, `rtcIsClosed` and the getters above. Connection state, gathering state and new data channels have no getter in the C API, so they must come from callbacks. The foreign sink is enough, so polling stays a fallback. (Read.)

### Closing and undelivered data

`PeerConnection::close` stops the SCTP transport first (`src/impl/peerconnection.cpp`). `SctpTransport::close` stops the send queue and, while connected, schedules `flush`. `trySendQueue` drains the queue and then calls `usrsctp_shutdown(mSock, SHUT_WR)` once the queue has stopped. An SCTP shutdown completes only after the peer acknowledges the outstanding data. The socket's `SO_LINGER` is 0, but that matters only on `usrsctp_close` in the destructor, which runs after the transport has shut down. Closing a data channel queues a stream reset behind the data already queued (`closeStream`). (Read.)

A probe built on the shim sent 200 messages of 10,000 bytes from the server peer to the client peer, both libdatachannel, then closed the server in one of five ways. Every run delivered everything (run; host load average 0.9 to 1.4):

| Close order after the sends | Runs | Bytes received |
| --- | --- | --- |
| `rtcClosePeerConnection` at once | 10 | 2,000,000 in every run |
| `rtcClosePeerConnection` when the buffered amount reaches 0 | 2 | 2,000,000 in every run |
| `rtcClose(dc)`, then the peer connection on the channel's closed event | 2 | 2,000,000 in every run |
| `rtcClose(dc)` and `rtcClosePeerConnection` together, as `nethernet`'s `Connection.close` does | 4 | 2,000,000 in every run |
| The same, once the buffered amount reaches 0 | 4 | 2,000,000 in every run |

The buffered amount right after the 200 sends varied from 0 to 720,000 bytes between runs, so some runs did close with data still queued.

The spike measured 10,000 bytes delivered with no drain and about 1,010,000 after draining, with node-datachannel sending and werift receiving. With libdatachannel on both ends the loss does not appear. The likely cause is how werift, or nethernet's client on top of it, handles the stream reset or the SCTP shutdown. This note did not test that. The real question is what a Bedrock client does, which only a retail or cinnabar join can answer (plan question 3).

## 5. The shim

Two layers replace `node-datachannel/polyfill`: about 110 lines of C over `rtc.h`, and a TypeScript class pair that presents the W3C members nethernet uses.

### The C layer

One foreign sink carries every event: `void sink(int32_t kind, int32_t id, int32_t value, const uint8_t *data, size_t len, void *ctx)`. The C layer installs its own static trampolines with libdatachannel, one per callback type, and each trampoline calls the sink. That removes the user-pointer mismatch, because scriptc's context lives in one global, and it needs one registration and one release for the whole process. When a remote peer opens a channel, the `rtcSetDataChannelCallback` trampoline registers the channel's own callbacks before it emits the event. A message can then never arrive for a channel the TypeScript side has not seen, because the sink's queue is FIFO.

The experiment's C layer had these entry points: `jsp_set_sink` and `jsp_clear_sink`, `jsp_create_peer_connection(mux, begin, end)`, `jsp_create_data_channel`, `jsp_set_remote_description`, `jsp_add_remote_candidate`, `jsp_send`, `jsp_buffered_amount`, `jsp_selected_pair`, `jsp_close_peer_connection`, `jsp_delete_peer_connection`, `jsp_close_channel`, `jsp_delete_channel`, `jsp_init_logger` and `jsp_cleanup`. Event kinds were description, candidate, state, gathering state, data channel, open, closed, error, message and buffered amount low. The message trampoline turns libdatachannel's negative size for text messages into a flag in `value`.

### The TypeScript layer against what nethernet uses

`nethernet`'s `Server.handleOffer` (`src/server.js`) and `Connection` (`src/connection.js`) use these members:

| nethernet uses | Backed by |
| --- | --- |
| `new RTCPeerConnection({ iceServers })` | `jsp_create_peer_connection`; the class adds the configured mux and port range, as the spike's wrapper does |
| `setRemoteDescription(offer)` | `rtcSetRemoteDescription`. With auto-negotiation on, libdatachannel answers by itself (DOC.md, `rtcSetLocalDescription`) |
| `createAnswer()` | a promise the description event resolves, as the polyfill does with its deferred `#localAnswer` |
| `setLocalDescription(answer)` | nothing to do for an answer; the polyfill also returns early unless the type is `offer` |
| `localDescription.sdp` | the answer's SDP from the description event, or `rtcGetLocalDescription` |
| `addIceCandidate({ candidate, sdpMid })` | `rtcAddRemoteCandidate`, with sdpMid defaulting to `"0"` as in the polyfill |
| `onicecandidate` | the candidate event, with `a=` stripped |
| `ondatachannel`, `channel.label` | the data channel event; `rtcGetDataChannelLabel`, or read once in C and sent with the event |
| `connectionState`, `onconnectionstatechange` | the state event mapped through `rtcState` (`new` through `closed`), cached on the object |
| `iceConnectionState`, `oniceconnectionstatechange` | `rtcSetIceStateChangeCallback`, one more event kind (the experiment did not wire it) |
| `close()` | `rtcClosePeerConnection`, then `rtcDeletePeerConnection` once the closed state arrives |
| `channel.send(buffer)` | `rtcSendMessage`. It throws on a closed channel, which werift did not (spike finding) |
| `channel.readyState` | starts from `rtcIsOpen` at creation, since an incoming channel is often open already, then follows open and closed events |
| `channel.binaryType = 'arraybuffer'` | a stored value; messages are delivered as the `ArrayBuffer` of the delivered `Uint8Array` |
| `channel.onopen`, `onmessage`, `onclose`, `onerror` | the open, message, closed and error events |
| `channel.close()` | `rtcClose`, then `rtcDeleteDataChannel` after the closed event |

The server's own reads come along: `selectedCandidateAddress` becomes a parse of `rtcGetSelectedCandidatePair`'s remote line, and a drain before a kick can wait on the buffered-amount-low event.

Compared with node-datachannel's polyfill (430 lines of `RTCPeerConnection.mjs` and 210 of `RTCDataChannel.mjs`), the shim reimplements the deferred offer and answer promises, the state caches, the `readyState` transitions, the `ArrayBuffer` conversion and event dispatch, and drops the configuration validation, `getStats`, tracks, offers, `createDataChannel` options and the `EventTarget` machinery nethernet does not use. Expect two or three hundred lines of TypeScript.

### Fitting it into the build

The FFI declarations need care, because the same source also runs under Node.js and Bun (run):

- A named import of an `export declare function` from another module becomes a native call under scriptc. Under Node.js the import fails with `does not provide an export named 'hello'`, because the declaration emits nothing.
- A namespace import (`import * as native`) loads under Node.js, but scriptc does not treat `native.hello(...)` as a direct call. The scriptc executable threw `ReferenceError: hello is not defined`.

So the FFI backend belongs in a module that only the scriptc build imports, for example through a scriptc-specific entry next to `packages/server/src/Server.ts`, or behind a `--define`d environment value. `--define` decides `if` statements at build time so that "JavaScript if statements it decides compile only their taken branch" (`scriptc build --help`). The `package:scriptc` script would gain `--ffi <manifest>`, and the manifest would point at per-target archives that a CI step builds or downloads.

## 6. Risks and unknowns

- **The server does not compile under scriptc yet.** The `scriptc` workflow exists to notice when it does. Until then, none of this can be tested in the real server, and the island route needs a libnode pack that `package.json` does not depend on.
- **Foreign delivery has no backpressure.** The trampoline "posts to the process event loop, and returns immediately", and the documentation states no queue bound. A flood from libdatachannel grows memory until the loop drains it, one event per turn. The 20,000-event test passed, but nothing measured the queue's growth or a server under load. Each delivered message is copied twice, once into staging and once into the closure's `Uint8Array`. The fallback is an available-data wakeup, followed by draining with `rtcReceiveMessage` into a reused buffer.
- **Exit and teardown.** A context-bearing registration's "trampoline and context pointer dangle once teardown frees the closure", so native code must not call it after exit. `rtcCleanup` and `rtcDeletePeerConnection` block until callbacks return (DOC.md), which is safe here because the trampolines never wait on script code. Shutdown must still close and delete every peer, clear the sink and call `rtcCleanup` in that order, from a `process` `'exit'` listener if needed.
- **Per-target native builds.** Each scriptc target needs libdatachannel, libjuice, usrsctp and OpenSSL, or Mbed TLS or GnuTLS, which libdatachannel also supports, built for that target with the right C++ runtime. scriptc defaults to clang on glibc Linux and zig on musl and Windows, so the archives must link with those drivers. Only Linux x64 glibc with gcc was tried here.
- **ABI drift.** Nothing checks the manifest against `rtc.h`. "A bad pointer or mismatched C signature can still corrupt the process." Keeping the C layer's signatures to `int32_t`, pointer-and-`size_t` pairs and fixed-width scalars, and compiling the C layer against the pinned headers, keeps the TypeScript manifest small and checkable.
- **Two backends.** Node.js and Bun would keep node-datachannel, and scriptc would use the shim. Both wrap the same libdatachannel version, but the behaviors that differ (candidate prefixes, close semantics, thrown errors) need tests on both.
- **scriptc is experimental, at version 0.4.** Format numbers, island behavior and the libnode pack layout are recent and could change. This note pins 0.4.11.
- **Not checked.** IPv4 and dual-stack peers on the mux under scriptc (both selected pairs in the run were IPv6 host addresses), a Bedrock client, the werift-side cause of the close loss, and static libstdc++.

## 7. Recommendation

1. Keep node-datachannel's polyfill as the backend for Node.js and Bun, as the plan's spike already shows it works there.
2. For scriptc, take the FFI route: one C shim over `rtc.h` with a single foreign event sink, static libdatachannel and OpenSSL archives per target, and a TypeScript class pair that implements only the members nethernet and the transport use. It keeps the executable free of Node.js and costs about 10 MB, against 131 MB for libnode.
3. Put both behind the swap point that plan slice 3 already calls for, so the scriptc entry can select the FFI module without Node.js ever loading it.
4. Schedule the work after the server compiles under scriptc. If a scriptc release is needed sooner, the Node island route runs node-datachannel unchanged and is the stopgap.
5. Close the drain question before relying on any of this for kicks. Repeat the close probe with a werift receiver and with a Bedrock client, since libdatachannel on both ends lost nothing.

## Reproduction

Everything ran in a scratch directory outside the repository, here `$S`. The scriptc binaries in `node_modules` lack their executable bits on this host, as `.github/workflows/scriptc.yml` notes, so the experiments used a copy:

```sh
mkdir -p "$S/toolchain/node_modules"
cp -rL node_modules/.pnpm/@scriptc+cli-linux-x64-gnu@0.4.11/node_modules/@scriptc "$S/toolchain/node_modules/"
find "$S/toolchain" \( -path '*/bin/scriptc' -o -path '*/lib/tsc-ts/lib/tsc-ts' \
  -o -path '*/lib/typescript/lib/tsc' -o -name scriptc-comptime -o -path '*llvm*/bin/*' \) \
  -type f -exec chmod +x {} +
SCRIPTC="$S/toolchain/node_modules/@scriptc/cli-linux-x64-gnu/dist/bin/scriptc"
```

clang is not installed, and gcc refuses clang's `-target` flag, so a wrapper drops it and is passed as `SCRIPTC_LINKER`:

```sh
cat > "$S/bin/gcc-link" <<'EOF'
#!/usr/bin/env bash
out=(); skip=0
for a in "$@"; do
  if (( skip )); then skip=0; continue; fi
  if [[ $a == -target ]]; then skip=1; continue; fi
  out+=("$a")
done
exec gcc "${out[@]}"
EOF
chmod +x "$S/bin/gcc-link"
export SCRIPTC_LINKER="$S/bin/gcc-link" SCRIPTC_CACHE_DIR="$S/cache"
```

Documentation, fetched as Markdown:

```sh
for p in ffi limitations cli dependencies native-objects quickstart; do
  curl -sL -o "$p.md" "https://scriptc.dev/docs/$p.md"
done
curl -sL -o llms.txt https://scriptc.dev/llms.txt
```

libdatachannel sources and headers:

```sh
curl -sL -o ndc-CMakeLists.txt https://raw.githubusercontent.com/murat-dogan/node-datachannel/v0.33.6/CMakeLists.txt
for f in include/rtc/rtc.h DOC.md src/capi.cpp src/impl/sctptransport.cpp src/impl/peerconnection.cpp src/impl/processor.hpp; do
  curl -sL -O "https://raw.githubusercontent.com/paullouisageneau/libdatachannel/v0.24.6/$f"
done
nm -D --defined-only node_modules/.pnpm/@node-datachannel+linux-x64-gnu@0.33.6/node_modules/@node-datachannel/linux-x64-gnu/node_datachannel.node | grep -c ' T rtc'   # 0
```

Building libdatachannel without system packages: `apt-get download cmake cmake-data libarchive13t64 librhash1 libjsoncpp26 libssl-dev libjitterentropy3-dev`, each extracted with `dpkg-deb -x` into `$S/sysroot`. Submodules came from codeload tarballs at the commits v0.24.6 records (libjuice `b89c792e`, usrsctp `fec583d5`, plog `94899e0b`):

```sh
export LD_LIBRARY_PATH="$S/sysroot/usr/lib/x86_64-linux-gnu" CMAKE_ROOT="$S/sysroot/usr/share/cmake-4.2"
O="$S/sysroot/usr/lib/x86_64-linux-gnu"
"$S/sysroot/usr/bin/cmake" "$S/src/libdatachannel-0.24.6" -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release \
  -DNO_MEDIA=ON -DNO_WEBSOCKET=ON -DNO_EXAMPLES=ON -DNO_TESTS=ON -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
  -DOPENSSL_ROOT_DIR="$S/sysroot/usr" -DOPENSSL_INCLUDE_DIR="$S/sysroot/usr/include" \
  -DOPENSSL_CRYPTO_LIBRARY="$O/libcrypto.a" -DOPENSSL_SSL_LIBRARY="$O/libssl.a" -DOPENSSL_USE_STATIC_LIBS=TRUE \
  -DCMAKE_C_FLAGS="-isystem $S/sysroot/usr/include/x86_64-linux-gnu" \
  -DCMAKE_CXX_FLAGS="-isystem $S/sysroot/usr/include/x86_64-linux-gnu"
make -j16 datachannel-static
```

The sink registration and release, as manifest entries (format 6):

```json
{ "name": "setSink", "symbol": "jsp_set_sink", "params": [
    { "callback": { "id": "sink", "params": ["i32", "i32", "i32", "bytes", { "context": "sink" }],
      "returns": "void", "lifetime": "retained", "invoke": "foreign" } },
    { "context": "sink" } ], "returns": "void" },
{ "name": "clearSink", "symbol": "jsp_clear_sink", "params": [
    { "callback": { "release": "setSink:sink" } }, { "context": "setSink:sink" } ], "returns": "void" }
```

The rest of the manifest maps each `jsp_*` function with `i32`, `bool`, `u16`, `string`, `bytes` and `mutable-bytes` parameters. Its `libraries` are `libshim.a`, `libdatachannel-static.a`, `libjuice-static.a`, `libusrsctp.a`, `libssl.a`, `libcrypto.a`, `libjitterentropy.a`, `/usr/lib/x86_64-linux-gnu/libz.so.1`, `libzstd.so.1`, `libbrotlienc.so.1` and `libbrotlidec.so.1`, and its `system_libraries` are `stdc++`, `pthread` and `dl`. The shim compiles with `gcc -O2 -c -DRTC_STATIC -I"$S/src/libdatachannel-0.24.6/include" shim.c`.

```sh
"$SCRIPTC" build main.ts --ffi ffi.json -o app && ./app   # loopback: 2 clients, 1 muxed port, 2,000,000 bytes each
"$SCRIPTC" build probe.ts --ffi ffi.json -o probe
for m in none drain channel nethernet drain-nethernet; do ./probe "$m"; done
```

The Node island route, with the pack from `https://registry.npmjs.org/@scriptc/libnode-linux-x64-gnu/-/libnode-linux-x64-gnu-0.4.11.tgz` unpacked to `$S/libnode`, and a scratch project whose `node_modules` links `node-datachannel`, `@node-datachannel` and `detect-libc` from the repository's pnpm store:

```sh
"$SCRIPTC" build loop.ts --npm-static auto --libnode "$S/libnode/package" -o loop && ./loop
# note SC8001: package 'node-datachannel@0.33.6' runs in a Node island ...
# received=2000000 state=connected
```
