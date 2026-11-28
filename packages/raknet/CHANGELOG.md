# @jsprismarine/raknet

## 0.27.0

### Patch Changes

- [#3743](https://github.com/JSPrismarine/JSPrismarine/pull/3743) [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3758](https://github.com/JSPrismarine/JSPrismarine/pull/3758) [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3816](https://github.com/JSPrismarine/JSPrismarine/pull/3816) [`b3ff0dd`](https://github.com/JSPrismarine/JSPrismarine/commit/b3ff0ddf00a72a3247dbd6d59423d910877517f5) Thanks [@filiphsps](https://github.com/filiphsps)! - `ServerName.update(fields)` changes the MOTD, the server name and the two player counts at once, so a listener such as the worker's pong cache hears of them in one snapshot rather than one per field. A field left out keeps its value, and an update that changes nothing is not announced. `ServerNameFields` names what it takes.
- Updated dependencies [[`44c0251`](https://github.com/JSPrismarine/JSPrismarine/commit/44c02515fa4810e75de3185001a8490aa7766ebd), [`c836dac`](https://github.com/JSPrismarine/JSPrismarine/commit/c836dac76a41e697fb7c8d1594224cdaf5cdbece), [`edb1160`](https://github.com/JSPrismarine/JSPrismarine/commit/edb116075c62fa251747acaf9d6db80bf1b448c4), [`3a7e94b`](https://github.com/JSPrismarine/JSPrismarine/commit/3a7e94b89acda05d76e99409711ea15afd122c0f), [`88fc786`](https://github.com/JSPrismarine/JSPrismarine/commit/88fc78645d05b732a620dbfcc6ee2a106950c093), [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816), [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc), [`ffb86ad`](https://github.com/JSPrismarine/JSPrismarine/commit/ffb86ad9e67431eeb9f1568ea66758a5cbffd050), [`cf7fe3c`](https://github.com/JSPrismarine/JSPrismarine/commit/cf7fe3c485a52482dcdbda6da2f822749b256f36), [`7756f1c`](https://github.com/JSPrismarine/JSPrismarine/commit/7756f1c349bb40b381252a231d6fd4b6518ae997), [`6580502`](https://github.com/JSPrismarine/JSPrismarine/commit/6580502b8aa1bab3091d98d581fd3501d5049b36), [`832bd7b`](https://github.com/JSPrismarine/JSPrismarine/commit/832bd7b2e1237f1cc98622cdcb1c21a3a6d37503), [`68a0e1b`](https://github.com/JSPrismarine/JSPrismarine/commit/68a0e1b820981bab5d69830066d824ca937e1021), [`14aeb2c`](https://github.com/JSPrismarine/JSPrismarine/commit/14aeb2cf0b75913f02907de47112af392f517d53), [`c35144a`](https://github.com/JSPrismarine/JSPrismarine/commit/c35144acb33d5b1a6237c523595df8674e349a0f), [`0cd4ddb`](https://github.com/JSPrismarine/JSPrismarine/commit/0cd4ddb62d4a05f212368dbca7f217a8bb3a7f08), [`37722e2`](https://github.com/JSPrismarine/JSPrismarine/commit/37722e2d12c913328b9dfa9776e70b6300868d5e), [`dfe4b85`](https://github.com/JSPrismarine/JSPrismarine/commit/dfe4b85f7b9c075988d0231f4fb48e572e332ce1)]:
  - @jsprismarine/errors@0.27.0
  - @jsprismarine/binaryutils@0.27.0

## 0.26.0

### Patch Changes

- [#3709](https://github.com/JSPrismarine/JSPrismarine/pull/3709) [`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies
- Updated dependencies [[`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b)]:
  - @jsprismarine/binaryutils@0.26.0
  - @jsprismarine/errors@0.26.0

## 0.25.0

### Patch Changes

- [`a074449`](https://github.com/JSPrismarine/JSPrismarine/commit/a07444994d141f6c90adafdc6aa268d4abb44c2b) Thanks [@filiphsps](https://github.com/filiphsps)! - `WorkerServerSocket.waitForRoundTripSamples(count)` resolves once the network worker has counted that many round trip samples. It waits on the shared metrics counter, which the worker now raises after it writes the round trip events the samples belong to, so a `pollInbound` after it resolves delivers them.
- Updated dependencies [[`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb), [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d), [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48), [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6), [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a), [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960), [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043), [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315), [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f), [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9), [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a), [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451), [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff), [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b)]:
  - @jsprismarine/errors@0.25.0
  - @jsprismarine/binaryutils@0.25.0

## 0.24.0

### Patch Changes

- [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa) Thanks [@filiphsps](https://github.com/filiphsps)! - The Node single executable from `pnpm run package` embeds RakNet's socket worker and loads it from its asset, so the executable can listen for players.
- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/binaryutils@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/binaryutils@0.23.2

## 0.23.1

### Patch Changes

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.
- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/binaryutils@0.23.1

## 0.23.0

### Minor Changes

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

- [#3342](https://github.com/JSPrismarine/JSPrismarine/pull/3342) [`aef478a`](https://github.com/JSPrismarine/JSPrismarine/commit/aef478a92f329bde9046fe616c9e50923f825dfd) Thanks [@filiphsps](https://github.com/filiphsps)! - `Logger.info`, `warn`, `verbose`, `debug` and `silly` take one message rather than `...message: string[]`, and RakNet's structural `Logger` type does the same. Many call sites still passed a second argument that was once a namespace, which the logger joined onto the text, so a line read `Stopping server, interrupt again to exit immediately Server/kill.`; those arguments are gone, and the compiler now refuses a new one. Join the parts yourself if you passed several. `configureSocketBuffers` drops its `context` parameter, which only fed those namespaces, and its error lines now say the size they asked for.

### Patch Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Errors carry a stable code and a link to their entry in the error reference at https://jsprismarine.dev/errors/, from their catalog in `@jsprismarine/errors`. Messages are unchanged.

- [#3336](https://github.com/JSPrismarine/JSPrismarine/pull/3336) [`25e1f11`](https://github.com/JSPrismarine/JSPrismarine/commit/25e1f119c5537cc95c016b910a2e3f98d05f5469) Thanks [@filiphsps](https://github.com/filiphsps)! - A session of `WorkerServerSocket` now answers `getRTT()` on the main thread. The worker reports each session's smoothed round trip time whenever it moves by a whole millisecond, so the main thread's copy is never more than a millisecond behind. Before this, the main thread's sessions always answered `null`.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`0afbafd`](https://github.com/JSPrismarine/JSPrismarine/commit/0afbafda42c8517746dcf4ee50ac3de13fe950f9), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/binaryutils@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.22.0

## 0.21.0

### Minor Changes

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`7ad176f`](https://github.com/JSPrismarine/JSPrismarine/commit/7ad176f908b8c7946773fa9fa2a942f6ac3cbd45) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/native-network`, JSPrismarine's networking in native code: WebRTC peer connections and data channels on libdatachannel with Mbed TLS, bound through `node:ffi` and `bun:ffi`, and `SharedPort`, a UDP port that RakNet and NetherNet share, sorted by each datagram's bytes before libjuice's lookup. This release builds from source only; prebuilt libraries follow.
  
  `SharedByteRing` in `@jsprismarine/raknet` now has eight control slots, with a wake flag (`claimWake` and `clearWake`), and needs a power-of-two capacity, so native code can read and write the same rings. A ring made with any other capacity is refused.

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`763c07d`](https://github.com/JSPrismarine/JSPrismarine/commit/763c07d5467a638658db0187110d2615160fdd19) Thanks [@filiphsps](https://github.com/filiphsps)! - RakNet and NetherNet can share one UDP port. When `server-udp-ports` covers `port` or `server-portv6` and both transports are on, the native networking library owns the port, sorts each datagram by its bytes, and hands RakNet its datagrams through shared-memory rings, in socket mode and with the RakNet worker.
  
  With RakNet off, the server port is opened the same way when NetherNet's UDP is on it, so a taken port stops the start, and query, when `query-port` is the server port, answers through it instead of binding a socket that would keep NetherNet's peers off the port.
  
  `@jsprismarine/raknet` adds `DatagramSource`, with `UdpDatagramSource` and `RingDatagramSource`, and `ServerSocket` and `WorkerServerSocket` take one as a new last constructor argument. `@jsprismarine/native-network`'s `SharedPort.attach` takes the rings to fill instead of allocating them.

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`c9a2433`](https://github.com/JSPrismarine/JSPrismarine/commit/c9a243311a38b4974aa28e2b52228e225838c112) Thanks [@filiphsps](https://github.com/filiphsps)! - The UDP socket buffer sizes a socket asked for and got are logged at verbose instead of info.

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`a9f5a42`](https://github.com/JSPrismarine/JSPrismarine/commit/a9f5a42e0896d3189c99185e8c26683ba58e1b32) Thanks [@filiphsps](https://github.com/filiphsps)! - A transport that is enabled and cannot listen now stops the server's start, with an error that names the transport, the port and the cause. A server that used to start with a warning when another program held `server-portv6` or the TCP side of `port` that NetherNet signals on now refuses to start: free the port, or turn the transport off with `enable-raknet` or `enable-nethernet`. LAN discovery and the query port still only warn.
  
  `Networking.start` returns a promise that settles once every transport listens, and `Server.bootstrap` rejects with that error. `RakNetListenerLike` declares the `listening` event its listeners already emit.
- Updated dependencies [[`3d07749`](https://github.com/JSPrismarine/JSPrismarine/commit/3d07749f87f00a669397d4720ca6fb28fbe92545), [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c)]:
  - @jsprismarine/binaryutils@0.21.0

## 0.20.0

### Patch Changes

- [#2944](https://github.com/JSPrismarine/JSPrismarine/pull/2944) [`ab14f6b`](https://github.com/JSPrismarine/JSPrismarine/commit/ab14f6b7c3d74bf359196aa64f121844f5e243c4) Thanks [@filiphsps](https://github.com/filiphsps)! - `ServerSocket` and `WorkerServerSocket` listen on IPv6 when `start` is given an IPv6 address, on an IPv6-only socket, so a server can run one listener per family. `ServerName` advertises the IPv6 socket's port in the pong's IPv6 port field (`getPortV6`/`setPortV6`, 19133 until a socket binds), and two sockets sharing one `ServerName` share its guid. A socket that cannot bind its port now emits `error` and stops, and a worker whose socket cannot bind rejects `waitUntilReady` and emits `error` to a listener.

- [#2944](https://github.com/JSPrismarine/JSPrismarine/pull/2944) [`5409d2e`](https://github.com/JSPrismarine/JSPrismarine/commit/5409d2e110332d3a721b0e9ee26e86d9bf3f1410) Thanks [@filiphsps](https://github.com/filiphsps)! - `ServerName.ownPlayerCount()` hands the advertised player count to whoever owns the server name: the RakNet sockets then report their sessions through `ServerName.setSessionCount`, which no longer changes the count. JSPrismarine takes the count over, so a RakNet socket no longer briefly overwrites a count that includes NetherNet players with its own session count.
- Updated dependencies [[`f030c63`](https://github.com/JSPrismarine/JSPrismarine/commit/f030c63e5c6269288d8dc576bddde160eda3cc74)]:
  - @jsprismarine/binaryutils@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.19.1

## 0.19.0

### Minor Changes

- [`31456fa`](https://github.com/JSPrismarine/JSPrismarine/commit/31456fab9fa2f0f0fbb5a12e84b1571ae5f2d0e9) Thanks [@filiphsps](https://github.com/filiphsps)! - The `Logger` type now declares each method as `(...message: string[]) => void` instead of `Function`. Socket bind, send, buffer and worker failures now log a message with the error text and keep the context tag as the second argument. Before, they passed the `Error` itself, which the string-joining logger printed without a stack and with the tag run into the message.

### Patch Changes

- [`a8cc6ff`](https://github.com/JSPrismarine/JSPrismarine/commit/a8cc6ff8eb12c9cdfd71507a88ded2197ea12b0f) Thanks [@filiphsps](https://github.com/filiphsps)! - The Bun-compiled executables no longer exit on start. The generation pool, the RakNet socket and LevelDB's table builder each start a worker the compile did not embed: the pool handed its worker to piscina, whose own `dist/worker.js` was a path on the build machine, and the other two looked for their worker beside a bundled module that is not there. The executable now embeds all three, the generation pool runs a compiled binary's worker through its own runner as the Node single executable does, and the release and nightly builds start each executable and stop it again before publishing it.

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.
- Updated dependencies []:
  - @jsprismarine/binaryutils@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/binaryutils@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`dcab390`](https://github.com/JSPrismarine/JSPrismarine/commit/dcab3900eb6a2b9dde2305407c7ce6e459b2c30e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add per-session congestion control and reliable-send backpressure to RakNet.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`7e631e5`](https://github.com/JSPrismarine/JSPrismarine/commit/7e631e58adc3f67fc62bcdd0379c113a9fca97e1) Thanks [@filiphsps](https://github.com/filiphsps)! - Add configurable UDP socket buffers ([#2820](https://github.com/JSPrismarine/JSPrismarine/issues/2820))

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`ed5c149`](https://github.com/JSPrismarine/JSPrismarine/commit/ed5c1497c577dc3c01f0dc196c927743fac343bc) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip idle retransmission scans and index ACK ranges

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`56f5028`](https://github.com/JSPrismarine/JSPrismarine/commit/56f5028e4a723c4e01b36f6eb293dcdc8cfaf805) Thanks [@filiphsps](https://github.com/filiphsps)! - Run RakNet session maintenance after the event loop has polled pending datagrams to avoid retransmitting acknowledged frames or timing out active peers after stalls.

- [`4a977ec`](https://github.com/JSPrismarine/JSPrismarine/commit/4a977ec6ac873e0804783ec5ddee0f76ca5fe997) Thanks [@filiphsps](https://github.com/filiphsps)! - Resend an unanswered `ClientSocket.ping` every 500 ms until its deadline instead of sending it once, so one dropped datagram no longer fails the ping.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`04f77b2`](https://github.com/JSPrismarine/JSPrismarine/commit/04f77b2085280aa4fe951da3e99243a6c8f79ece) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep unacknowledged reliable messages available after datagram history pruning.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`075aef8`](https://github.com/JSPrismarine/JSPrismarine/commit/075aef899917c6cb480ed129d9157b21e86e67ca) Thanks [@filiphsps](https://github.com/filiphsps)! - Add an opt-in scatter-gather send path for RakNet frame sets, with the existing contiguous encoder as the default and fallback.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`487ac40`](https://github.com/JSPrismarine/JSPrismarine/commit/487ac401339e3c4be9fe643d35957ace011b3983) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache the stable unconnected pong payload and the formatted server name while keeping each timestamped response buffer independent.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`e52ebdd`](https://github.com/JSPrismarine/JSPrismarine/commit/e52ebdd566403769c87a72281e60a9ed41d8b248) Thanks [@filiphsps](https://github.com/filiphsps)! - Trim inbound frame overhead ([#2821](https://github.com/JSPrismarine/JSPrismarine/issues/2821))

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`1dffdad`](https://github.com/JSPrismarine/JSPrismarine/commit/1dffdad407e75cfbb4ca2961bc4698ec2b304da8) Thanks [@filiphsps](https://github.com/filiphsps)! - Add an opt-in worker-backed RakNet listener with bounded shared-memory queues, per-session ordered handoff, and a seeded bot-fleet benchmark.
- Updated dependencies [[`d499106`](https://github.com/JSPrismarine/JSPrismarine/commit/d49910658d7aa57fedfe32512977f79aa0023832), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/binaryutils@0.17.0

## 0.16.0

### Minor Changes

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f0294ef`](https://github.com/JSPrismarine/JSPrismarine/commit/f0294ef0b8e358f4fda308d7c8f1c901bf1bf3e7) Thanks [@filiphsps](https://github.com/filiphsps)! - Move protocol codec construction, packet lookup, version metadata, and handshake filtering into
  `@jsprismarine/protocol`. Prismarine now passes captured item, block, and world data through
  `ProtocolContext`, and no longer re-exports the Protocol namespace, packet barrel, or identifier
  compatibility API. Server packet dispatch is held by `PacketHandlerRegistry`, and Prismarine
  declares the Brigadier dependency its command source and public declarations import.
  
  `ServerName` now receives protocol metadata directly instead of reading `getIdentifiers()` from
  the Prismarine server object.

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.16.0

## 0.15.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.15.2

## 0.15.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.15.1

## 0.15.0

### Minor Changes

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove constructs that ahead-of-time compilation with scriptc cannot lower, keeping runtime behavior the same.
  
  - `@jsprismarine/bedrock-data` exports `creativeitems` from a generated, explicitly typed module (`CreativeItemEntry[]`) instead of the raw JSON.
  - `@jsprismarine/brigadier` keeps each argument builder in the module of the node it builds (the old paths re-export), declares `literal` and `argument` as functions, and its exception types call message factories positionally.
  - `@jsprismarine/errors` declares its `Error` base without a type parameter.
  - `@jsprismarine/math` exposes `Vector2.ZERO` and `Vector3.ZERO` as shared immutable instances, and `Vector3` subclasses keep their class through `withX` and friends by overriding `create`.
  - `@jsprismarine/minecraft` exports `blockSchemas` from a generated, typed module (`BlockSchemaCatalog`).
  - `@jsprismarine/prismarine` replaces the `evt`-based event bus with its own `EventEmitter` (same `on`, `once`, `removeListener`, `removeAllListeners`, `emit` and `post`), carries inventory transaction data as a discriminated union (`kind`), exposes `allBlocks()`, `allItems()` and `allEntities()` registries, and drops the `heap`, `evt`, `fast-jwt` and `confbox` dependencies.
  - `@jsprismarine/raknet` declares `sendPacket` without a type parameter.

- [#2585](https://github.com/JSPrismarine/JSPrismarine/pull/2585) [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace `as` type assertions with inferred types, type guards and narrower parameter types across the packages.
  
  Most of the change is internal, but a few public signatures moved so the compiler can carry the type instead of a cast:
  
  - **brigadier.** `ArgumentType.parse` receives an `ArgumentParseContext<S>` (the dispatcher's context builder, which is what it always got at runtime) instead of a `CommandContext`. `ParseResults.getExceptions()` holds `Error` values, since argument parsers throw plain errors. `CommandContext.getLastChild()` no longer claims it can return `null`. `ArgumentType` and `ArgumentParseContext` are exported from the package root.
  - **protocol.** `DataItem` is built from one `DataItemEntry` whose `type` tag decides the type of `value`, and exposes `getId`, `getType` and `getValue`. `NetworkStructure.deserialize` now returns a real instance: it used to copy the prototype with `Object.assign`, which copies nothing, so a decoded `BlockPos` or `Vec3` had no `serialize` method and failed `instanceof`.
  - **raknet.** `ServerName` takes a `ServerNameSource` naming the two methods it reads instead of `any`.
  - **client.** `ClientPacketRegistry` exports an `isPacket(packet, id)` guard that narrows `DecodedPacket.data` by id. The handshake rejects a JWT claim that is present but not a string with the existing clear error instead of a later `TypeError`.
  - **minecraft.** `BlockSchemaProperty.type` is the union of the three NBT tags the palette uses, so a palette with a new tag fails type-checking instead of slipping through as a string.
  - **prismarine.** The command dispatcher is typed over `CommandExecutor`, with typed `literal`/`argument` builders and runtime-checked argument accessors; selectors and relative coordinates from the console fail with a clear error instead of a `TypeError`, and relative `~` coordinates, which threw on every use, now work. `Metadata` stores typed entries so a value that does not match its `FlagType` is a compile error. Several managers take the narrow slice of `Server` they use (`BanManager`, `BlockManager`, `PacketRegistry`, `RecipeManager`, `CreativeInventory`), so tests build plain doubles. A shorthand ambient module had typed every import from `@jsprismarine/bedrock-data` as `any` inside the package; it is gone, so the generated types reach the compiler.
  - **logger, nbt, leveldb.** No signature changes. `Logger.getNamespace` returns an empty string instead of throwing when `Error.stack` is undefined, and `NBTTagCompound` getters return the default for a tag of the wrong kind instead of throwing.

### Patch Changes

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`74722e8`](https://github.com/JSPrismarine/JSPrismarine/commit/74722e8b07e5865ca42b04ff81503f2a0559bd0b) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the batch layer to `@jsprismarine/protocol`, and a socketless RakNet pair to `@jsprismarine/raknet`.
  
  **`BatchCodec` and `CompressionCodec`.** The outermost Minecraft layer - `0xFE`, an optional algorithm byte, then length-prefixed packets - as something both sides of a connection can use, and which knows nothing about what a packet *is*. A batch is a list of opaque buffers, which is what lets it serve a client, a server and a proxy alike.
  
  The distinction it draws that the server's `BatchPacket` does not: the algorithm byte is present if and only if compression has been *negotiated*, which is not the same as this batch being compressed. `RequestNetworkSettings` and `NetworkSettings` carry no prefix; from the next packet onward every batch carries one, and a peer may set it to `0xff` whenever compressing would not pay. Those are two codecs - `BatchCodec.uncompressed()` and `BatchCodec.compressed()` - rather than one boolean.
  
  Three things fall out of writing it as a codec rather than a packet:
  
  - **A compression threshold**, so a small payload goes out uncompressed and says so, instead of deflate reliably making it larger. Mojang's threshold of 0 means "never compress"; read as a plain `byteLength >= threshold` it would have meant the exact opposite.
  - **Bounded inflation.** A batch arrives inside one RakNet message, so the compressed bytes are bounded at roughly 2.8 MiB by reassembly - what they *expand* to was bounded by nothing, and both a client and a server read compressed bytes from a peer they have not authenticated. zlib now enforces a ceiling itself.
  - **Strict splitting.** Every declared length is checked against what actually remains, and the error says at which offset the batch went wrong. An empty batch yields no packets: the `do/while` this replaces always ran once and read a varint out of nothing.
  
  `BatchCodecInterop.test.ts` in `@jsprismarine/prismarine` pins the two implementations together, byte for byte in both directions. They will not be swapped for one another in a single commit - the client is built on the codec while the server still runs `BatchPacket` - so for as long as both exist, a disagreement between them is a client that cannot talk to this server.
  
  **`LoopbackSocket`.** A connected RakNet pair with no sockets under it, for running a server in the same process as its client. The server keeps talking to a `RakNetSession` and cannot tell it is not on a wire.
  
  Framing, ordering, acknowledgment, reassembly and the connected handshake are the ordinary `Session`, unmodified - the alternative, handing frames across directly, would have meant reimplementing `Session.handlePacket`, and single player would then run *similar* code to multiplayer rather than the same code. What is skipped is the offline exchange, which exists only to discover a path MTU and a guid across a network that is not there.
  
  Two details it has to get right: delivery goes through a microtask, so a packet answered inline does not nest a second delivery inside the first; and the MTU is 8 KiB rather than "as large as possible", because `Frame` writes its content length *in bits* into an unsigned 16 bit field and anything past 8191 bytes silently wraps it. That is still five and a half times what a real connection negotiates, so a chunk batch that fragments seventeen ways on the wire fragments three ways here.
  
  `Loopback.test.ts` runs the same five scenarios twice, once over real sockets and once in memory, and asserts the two agree.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Move JSBinaryUtils into the monorepo as `@jsprismarine/binaryutils`.
  
  It was developed in its own repository and consumed here as a pinned npm dependency, which meant a
  change to the binary stream needed a release there before it could be used here. It now lives in
  `packages/binaryutils` and every consumer resolves it through the workspace, so it builds, typechecks
  and tests together with the packages that use it.
  
  The published name changes: `@jsprismarine/jsbinaryutils` is deprecated on npm and its last release
  re-exports this package, so existing installs keep working. The API is unchanged.
  
  Two things came along with the jump from the pinned 5.5.3 to current: `write()` accepted a
  `Uint8Array` in its signature but called `Buffer#copy` on it, so anything not already a `Buffer`
  threw at runtime — it now uses `set`. And the single internal `buffer` field is split into a read and
  a write buffer, so code reaching past the public API to assign `.buffer` no longer populates the read
  side; use `setReadBuffer()`.
  
  `@jsprismarine/protocol` also gained the dependency in its manifest — it imported the package while
  relying on it being hoisted into the root `node_modules`.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9) Thanks [@filiphsps](https://github.com/filiphsps)! - A load-testing harness: N synthetic players against a server, and the numbers they produce.
  
  `Fleet` connects a fleet at a configured rate, ticks each bot's behaviors at the server's own twenty per second, and reports what happened - login latency percentiles, RakNet round trip, bytes and packets per direction, how many of the requested bots actually got in, and what each refusal was. A bot that fails to connect is recorded and left out rather than aborting the run, because "how many of five hundred got in" is usually the question being asked.
  
  Everything random comes from one seed, derived per bot rather than shared. `Math.random` cannot be seeded, and a run that cannot be repeated is not a measurement: two runs against the same server have to differ because the *server* behaved differently. A single generator handed to five hundred bots would have them take turns drawing from one sequence, so what each did would depend on how the others were scheduled - which is the non-determinism the seed exists to remove.
  
  Four behaviors, deliberately separable, because a load test is a question and the question is usually about one kind of traffic: `walk` (chunk streaming and entity tracking), `look` (the broadcast path, without touching streaming), `chat` (fan-out - two hundred bots speaking once each is forty thousand deliveries), and `break` (the three-step action sequence a real client sends).
  
  It lives in `packages/client/src/bot/` rather than in a package of its own: it is under a thousand lines, it depends only on the client, and nothing will ever depend on it.
  
  **A command line, `jsp-client`**, in the same package and for the same reason - the command line is a way of driving the client, not a separate product.
  
  ```
  jsp-client bot   --host <address> --count <n> [--behavior walk,chat,break]
                   [--duration 10m] [--ramp 5/s] [--seed 1234] [--view-distance 4]
                   [--report report.json]
  jsp-client connect --host <address> [--name Steve]
  jsp-client ping    --host <address>
  ```
  
  Built on `node:util.parseArgs` rather than a dependency: the repository has no argument library anywhere, Node 21 is already the engine requirement, and a binary that has to stay `bun build --compile`-able has every reason not to grow a dependency tree for five flags. A bare `--duration 60` means sixty *seconds*, because the alternative reading wastes an afternoon. It exits 2 for a command line it cannot read and 1 when any bot failed to get in, so it works as a CI gate and not only as something to read.
  
  **Five more packets migrated to `NetworkPacket<T>`** - `MovePlayer`, `PlayerAction`, `RequestChunkRadius`, `ChunkRadiusUpdated` and `LevelChunk` - each pinned against the server's own class byte for byte. Two carry traps worth naming: `MovePlayer`'s length depends on one of its own bytes, since the teleport fields exist only for a teleport, and `PlayerAction` writes its block positions with an *unsigned* y, so writing all three signed encodes every height above 63 one byte differently and the reader takes the block face out of the middle of a coordinate. `LevelChunk` reads its envelope and hands the terrain over unparsed, which is what lets a bot skip the expensive half of the packet that makes up most of a server's output.
  
  Two more bugs the real binary found that the tests could not:
  
  - **Nothing kept the process alive.** Every handle the client owns is `unref`ed so a library never holds its host process open, which in a process whose only job *is* that client leaves nothing holding the event loop. Node exited between the first await and the answer: `ping` printed nothing, the fleet connected nobody, and both returned zero. Invisible under a test runner, which keeps the loop alive by itself.
  - **The report's round-trip time was always `-`.** A report is produced after the run ends, and the RTT lived only on a session that had already been torn down, so the number no report ever saw was the one the harness existed to measure. The transport keeps the last live measurement now.
  
  **`ClientSocket.kill` closed its socket one tick too early.** `disconnect` queues a DISCONNECTION_NOTIFICATION and `dgram.send` is asynchronous however immediate the priority was, so closing the handle in the same tick dropped the datagram and the goodbye was never sent. The server then held the session until it timed out - ten seconds counting against the player limit - and a fleet that reconnected found the server full of clients that had already left. Found by the harness itself, on the fifth fleet of a test run.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`e25f62b`](https://github.com/JSPrismarine/JSPrismarine/commit/e25f62bdba9c0c42193f1f368c69c22cf07e91de) Thanks [@filiphsps](https://github.com/filiphsps)! - Add RakNet's outgoing half, so the library can make connections as well as accept them.
  
  This is the foundation both `@jsprismarine/client` and the planned proxy stand on. The reliability layer is not duplicated for it: ACK/NACK, ordering, fragmentation and retransmission are the exact code paths the server already runs, which is the only way an outgoing connection is worth anything as a test of the incoming one.
  
  - **`RakNetPeer`.** `Session` coupled to `ServerSocket` through four members - `getLogger`, `sendPacket`, `emit`, `removeSession` - and nothing else. Extracting them as an interface is what lets a session be driven from either side. `@jsprismarine/client` used to reach the same end by passing itself as `this as any` in place of a `ServerSocket`, because there was no smaller contract to implement.
  - **`ClientSocket`.** `connect()`, which resolves on a completed handshake and rejects with the server's own reason when it refuses - full, banned, protocol mismatch, already connected - rather than letting all four look like a timeout. Plus `ping()` for a server's MOTD without connecting, several at a time, and a keepalive so a session idle in both directions is not timed out. The offline exchange has no session to retransmit for it, so the socket owns the retry timer and RakNet's three-rung MTU ladder.
  - **`OfflineClientHandler`.** The mirror of `OfflineHandler`, applying the same magic-and-length guard to what a server sends back that we already applied to what a client sends us.
  - **The client role in `Session`.** Sending `ConnectionRequest`, answering `ConnectionRequestAccepted` with `NewIncomingConnection`, and reaching `CONNECTED`. Keyed on an explicit `RakNetRole` rather than on the message id, which would have let a peer talk a listening server through the client half of the handshake and skip `NEW_INCOMING_CONNECTION` entirely.
  
  Three fixes fell out of needing the codecs to work in both directions:
  
  - `NewIncomingConnection.encodePayload` wrote the remote's address twenty one times instead of the address followed by twenty system addresses. The byte count matched, which is why it survived: JSPrismarine was the only thing decoding it and reads those twenty purely to advance past them. A real server does look.
  - `Session` never handled `CONNECTED_PONG`, so the answer to a ping was emitted as `encapsulated` and reached the packet dispatcher as if it were a Minecraft packet.
  - `ConnectedPing`, `ConnectedPong` and `IncompatibleProtocolVersion` each implemented only the direction the server needed. They are now symmetric, like the rest of the handshake packets already were.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2eda0da`](https://github.com/JSPrismarine/JSPrismarine/commit/2eda0da630ef2d917c6906dc79b1cc1266607dd9) Thanks [@filiphsps](https://github.com/filiphsps)! - `ConnectionRequestAccepted` now exposes the `systemIndex` and the twenty `systemAddresses` it decodes, and writes the internal addresses a caller supplies (loopback plus unassigned slots when none are given). The internal address count both it and `NewIncomingConnection` use is exported as `MAXIMUM_NUMBER_OF_INTERNAL_IDS`. Internal addresses of either IP family are now walked correctly, so a dual stack peer's timestamps decode where they are.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`cb93c6c`](https://github.com/JSPrismarine/JSPrismarine/commit/cb93c6c598798cf7d1d0b489c8c46e6c2e082e23) Thanks [@filiphsps](https://github.com/filiphsps)! - `BitFlags` names the two remaining datagram header bits, `CONTINUOUS_SEND` (0x08) and `NEEDS_B_AND_AS` (0x04), and documents that `FrameSet` accepts and ignores them, as RakNet's sliding window congestion control does. No wire behavior changes.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`218a8a8`](https://github.com/JSPrismarine/JSPrismarine/commit/218a8a856e48d82f02b4c93f976939b900302dc7) Thanks [@filiphsps](https://github.com/filiphsps)! - `Packet.readAddress` and `Packet.writeAddress` now encode and decode IPv6 `SystemAddress` values the way RakNet does (version 6, the Windows `AF_INET6` family, the port, flow info, 16 address bytes, scope id). Before, an IPv6 address decoded as the raw bytes read as UTF-8 text, and writing one produced an IPv4 record of garbage. `InetAddress` now infers version 6 from a colon in the address when no version is given, and `writeAddress` throws on text that is not an address of its version instead of writing junk.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`8b66629`](https://github.com/JSPrismarine/JSPrismarine/commit/8b666295644f770b2e99c5e4b6839a79f9a0c4ab) Thanks [@filiphsps](https://github.com/filiphsps)! - `UnconnectedPong` now carries the full MOTD line a Bedrock Dedicated Server broadcasts: the
  flag field, the IPv4 and IPv6 ports, and the two trailing fields after them. A client reads
  the ports to connect to a server it found on the local network, so a line that stopped at the
  gamemode appeared in the list but could not be joined from it. `ServerSocket.start` sets the
  port from the socket once it has bound.
  
  `Packet.readAddress` and `Packet.readString` now read their unsigned fields unsigned. Both are
  written with `writeUnsignedShort`, so a port from 32768 up - the range an operating system
  hands a connecting client - decoded as a negative number.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a10d86a`](https://github.com/JSPrismarine/JSPrismarine/commit/a10d86aad180120f14dcf3fe0e5944c3dc373235) Thanks [@filiphsps](https://github.com/filiphsps)! - `ServerName` advertises the last entry of `getIdentifiers().MinecraftVersions` in the MOTD line instead of the first, so a server supporting 1.26.50 and 1.26.51 shows up as 1.26.51, the way a Bedrock Dedicated Server of that version does.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`0f058dd`](https://github.com/JSPrismarine/JSPrismarine/commit/0f058dd7353e522b61ec1c45366c667bab12a389) Thanks [@filiphsps](https://github.com/filiphsps)! - `ServerSocket` no longer warns that online mode is unsupported when constructed with `onlineMode` set. RakNet has no part in Bedrock's online mode: the client never enables RakNet security, and the identity check belongs to the game layer's login. The parameter is kept so existing calls still compile.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c76286f`](https://github.com/JSPrismarine/JSPrismarine/commit/c76286f0101f6fad70f78023282271801880b394) Thanks [@filiphsps](https://github.com/filiphsps)! - Adds `RAKNET_PROTOCOL_VERSION` (11), the RakNet version byte Bedrock sends in `OpenConnectionRequest1`. `MINECRAFT_PROTOCOL_VERSION` still exports the same value but is deprecated: it named RakNet's version, not Minecraft's network protocol.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5b57bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/5b57bc3cac03393219507b3cbb700cae8b174d13) Thanks [@filiphsps](https://github.com/filiphsps)! - `UnconnectedPing` now carries the client guid RakNet writes after the offline magic. `ClientSocket.ping` sends its own guid there, and decoding reads it when present (`clientGUID`, 0 for a ping that stops after the magic).

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b20d325`](https://github.com/JSPrismarine/JSPrismarine/commit/b20d3256b5005a0b594d2a8d1abadc3142ef0503) Thanks [@filiphsps](https://github.com/filiphsps)! - GUIDs and timestamps in the handshake packets are now read and written as unsigned 64 bit values, which is what RakNet's `RakNetGUID` and `RakNet::Time` are, and `ServerSocket`, `ClientSocket` and `LoopbackSocket` generate their guids unsigned. `ServerSocket` also passes its guid to `ServerName.setServerId`, so the seventh field of the MOTD line now carries the same guid as the pong header instead of `0`. A caller that hands a packet a negative bigint now gets a `RangeError` on encode.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the server tick at a steady twenty ticks a second, and stop measuring time with a clock that can move underneath us.
  
  The tick loop corrected the same lateness twice. `executionTime` was measured from the _end_ of the previous tick, so it already contained that tick's sleep, and `MINECRAFT_TICK_TIME_MS - executionTime` was therefore a complete drift correction on its own. The comparison of `elapsedTime` against `expectedElapsedTime` that followed applied a second one, against the accumulated total. Two corrections for one error is a loop gain of two, and the loop oscillated exactly as that predicts: it alternated a near-zero gap with a near-hundred-millisecond one, averaging a perfectly correct twenty ticks a second while never actually holding fifty milliseconds. Measured against real timers, the interval had a standard deviation of 47 ms around a 50 ms target. Everything that leaves a tick as a batch — entity movement, chunk sends — went out in pairs separated by silence, which is not what a client interpolating between updates expects to receive.
  
  Each tick's deadline is now derived from one fixed origin, and the correction happens once. The same measurement gives a standard deviation of zero.
  
  Lateness beyond two seconds is now written off with a `Can't keep up!` warning rather than repaid in full. A ten second stall used to be owed back as two hundred consecutive zero-delay ticks, running the world at maximum speed and starving the event loop precisely when it was already in trouble. Shorter hitches are still made up, so a brief stall does not leave the world permanently running late.
  
  TPS is measured over a sliding one-second window instead of one that reset its own baseline whenever it crossed a second — the first reading after each reset covered a single tick and was noise reported as a rate. It is also no longer clamped to twenty: a loop making up lost time genuinely runs faster than that, and the clamp meant the one metric that should expose the fault reported perfect health throughout.
  
  The `tick` event is awaited. A plugin's tick handler now runs inside the tick like every other piece of tick work, instead of having its continuation land in the middle of some later tick and its rejection escape as an unhandled rejection.
  
  In RakNet, every deadline a session keeps — the retransmission timeout, the split reassembly timeout, the session timeout — and every round trip sample now comes from a monotonic clock. On `Date.now()` a forward step from an NTP correction or a suspend/resume expired all of them at once and folded a step-sized round trip into the RTT estimate; a backward step put them out of reach and stopped retransmission until real time caught up. Timestamps that travel on the wire still use `Date.now()`: they are values the peer echoes back, not durations we measure.
  
  `Session.update()` now takes that reading itself when given no argument, because a caller mixing the two clocks does not get a slightly wrong answer, it gets epoch milliseconds compared against process-relative ones — every deadline expired at once and the session timed out on its first idle pass. An argument is still accepted, for updating several sessions against one instant and for driving time forward in a test.
  
  The RakNet tick loop no longer stops when a session update throws. It scheduled its own next call as the last statement of the callback, so a single session raising an exception took acknowledgments, retransmissions and timeouts down permanently for every connection on the server. Each session is now isolated from the next and the loop reschedules from `finally`. It also subtracts the work it just did from the interval, so the polling rate no longer falls away as sessions are added — with three milliseconds of work per pass it had dropped from ~98 Hz to ~80 Hz.
  
  World auto-save ran once. `currentTick / 20 === 120` is true for exactly one value of the counter, so a world was saved two minutes after startup and then never again for the life of the process; it is a remainder now. `World.save` also handed an async callback to `forEach`, which discards the returned promise, so player writes were still in flight — and their failures unobserved — after `save` had resolved. A shutdown save could report success before a single player had reached disk.
- Updated dependencies [[`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0), [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a)]:
  - @jsprismarine/binaryutils@0.15.0

## 0.14.2

No changes in this release.

## 0.14.1

### Patch Changes

- [`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump Vite to 8.0.12 across the root, every workspace package, and the turbo generator template, and roll in the follow-up fixes needed to keep the codebase happy under Vite 8 (Rolldown):
    - Drop the `vite-tsconfig-paths` plugin in favor of Vite 8's native `resolve.tsconfigPaths: true` option, rename `build.rollupOptions` to `build.rolldownOptions` in the shared root config, drop the no-longer-supported output options (`hoistTransitiveImports: true`, `indent: false`, `interop: 'auto'`, `validate: true`), and remove the dropped `rollupTypes` option on `vite-plugin-dts`.
    - Untangle the `BuiltInExceptions -> SimpleCommandExceptionType -> CommandSyntaxException -> BuiltInExceptions` module load cycle that Rolldown refused to swallow the way the previous esbuild-based bundler did:
        - Defer `CommandSyntaxException.BUILT_IN_EXCEPTIONS` construction to a lazy getter and wrap every `BuiltInExceptions` static field in a memoized factory so no `new SimpleCommandExceptionType(...)` / `new DynamicCommandExceptionType(...)` runs during the class's static-initialization phase.
        - Add named exports for `SimpleCommandExceptionType` and `DynamicCommandExceptionType` alongside their existing default exports and switch the in-package call sites (`BuiltInExceptions`, `BuiltInExceptionProvider`, the brigadier barrel, and `SimpleCommandSyntaxExceptionType.test.ts`) to the named imports so they side-step Rolldown's stricter default-binding resolution while external default-import call sites keep working unchanged.
    - Hoist `vi.mock('@jsprismarine/raknet', ...)` out of the `describe` block in `Server.test.ts` so vitest stops warning about runtime hoisting (it will become an error in a future vitest release).
    - Replace the `fs.readdirSync` block enumeration in `Block.test.ts` with an eager `import.meta.glob` so vite's `dynamic-import-vars` plugin stops complaining about the missing static file extension.
    - Teach typedoc about the `@todo` block tag (plus the rest of TSDoc's standard tags) via a `blockTags` allow-list in `typedoc.json` so internal todo comments stop emitting "unknown block tag" warnings, and re-point Logger's `@document` to `../../../docs/log-levels.md` so the path resolves from the source file (`packages/logger/src/logger.ts`) up to the repo root's `docs/log-levels.md`.
    - Add `packages/bedrock-data/src/generated/*` to `.prettierignore` so the auto-generated JSON blobs don't trip prettier formatting checks.

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

## 0.13.2

## 0.13.1

## 0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

## 0.12.0

### Minor Changes

- [`d761626`](https://github.com/JSPrismarine/JSPrismarine/commit/d761626b51b8a402b13d111e3dd25b560bfdf8fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Close socket upon killing.

## 0.11.1

## 0.11.0

## 0.10.0

### Patch Changes

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

## 0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

## 0.7.0

## 0.6.0

## 0.5.0

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

## 0.4.4

### Patch Changes

- [#1334](https://github.com/JSPrismarine/JSPrismarine/pull/1334) [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix "Take advantage of raknet/src/utils/ServerName.ts." [#1313](https://github.com/JSPrismarine/JSPrismarine/issues/1313).

## 0.4.3

## 0.4.2

## 0.4.1

## 0.4.0

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

## 0.3.0

## 0.2.0

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

## 0.1.1

### Patch Changes

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

- [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose more of the internals.

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    - The build system has been refactored to support both esm and cjs.
    - Releases are now managed by changeset.
