# @jsprismarine/server

## 0.15.3

### Patch Changes

- Updated dependencies [[`aa68cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/aa68cb14115bf30f9fb8db7b4593ae6c4cf37e3d), [`b898ad5`](https://github.com/JSPrismarine/JSPrismarine/commit/b898ad5220836d825b2c15ce5089c6b0f1d22c4e), [`9bc4514`](https://github.com/JSPrismarine/JSPrismarine/commit/9bc4514b4148af9343dd4f3220a6e3ca552261b8), [`4555d70`](https://github.com/JSPrismarine/JSPrismarine/commit/4555d70bc9ef62bdee2184911334c9f864d2bb15), [`b6ad6d8`](https://github.com/JSPrismarine/JSPrismarine/commit/b6ad6d8bff135055b0a6edda5c16d0b8a15b6196), [`4158282`](https://github.com/JSPrismarine/JSPrismarine/commit/4158282ba062f75acb4d64e4ab0f27c68051675e), [`4039da2`](https://github.com/JSPrismarine/JSPrismarine/commit/4039da24f7ca0ca72ce4bc5205a9ae7c2e400014), [`a592bfb`](https://github.com/JSPrismarine/JSPrismarine/commit/a592bfb22322d7950da5b9a84e52e51de81cad9b)]:
  - @jsprismarine/prismarine@0.15.3
  - @jsprismarine/color-parser@0.15.3
  - @jsprismarine/logger@0.15.3
  - @jsprismarine/minecraft@0.15.3
  - @jsprismarine/raknet@0.15.3

## 0.15.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/color-parser@0.15.2
  - @jsprismarine/logger@0.15.2
  - @jsprismarine/minecraft@0.15.2
  - @jsprismarine/prismarine@0.15.2
  - @jsprismarine/raknet@0.15.2

## 0.15.1

### Patch Changes

- Updated dependencies [[`24e9693`](https://github.com/JSPrismarine/JSPrismarine/commit/24e9693285faea53a54264af5233f1c54724aa46), [`10b7a13`](https://github.com/JSPrismarine/JSPrismarine/commit/10b7a1361bf615d62b22ef5c463d07d785eed56a)]:
  - @jsprismarine/prismarine@0.15.1
  - @jsprismarine/color-parser@0.15.1
  - @jsprismarine/logger@0.15.1
  - @jsprismarine/minecraft@0.15.1
  - @jsprismarine/raknet@0.15.1

## 0.15.0

### Patch Changes

- [#2589](https://github.com/JSPrismarine/JSPrismarine/pull/2589) [`733c0e1`](https://github.com/JSPrismarine/JSPrismarine/commit/733c0e1ed7bca0a47a4a1be9b13821413916a420) Thanks [@filiphsps](https://github.com/filiphsps)! - Add shared Yargs-based command-line parsing and shell completion to the server and client. The server accepts `--port`, and the development launcher forwards command-line arguments to it.

- [#2601](https://github.com/JSPrismarine/JSPrismarine/pull/2601) [`fc10257`](https://github.com/JSPrismarine/JSPrismarine/commit/fc10257d463bb2640f174ded4bea654f6ff8d461) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Keep the server running when it starts without a terminal. Before this change, a headless run, such as one in a container, exited as soon as it began listening.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`95c1def`](https://github.com/JSPrismarine/JSPrismarine/commit/95c1defed96f389f944c2b61a70d4fe356d271c7) Thanks [@filiphsps](https://github.com/filiphsps)! - Drop dependencies and constructs that block ahead-of-time compilation with scriptc.
  
  - `@jsprismarine/logger` no longer wraps winston. The `Logger` API is unchanged; transports now implement the package's own `LogTransport` interface, and a `FileTransport` replaces winston's file transport.
  - `@jsprismarine/color-parser` declares its ANSI sequences directly instead of reading them out of chalk-cjs. The emitted escapes are identical; the chalk-specific exports are gone.
  - `@jsprismarine/prismarine` decodes login JWTs with plain base64url instead of fast-jwt, parses config files with json5 and js-yaml instead of confbox, and drops the debug-only `Symbol.toStringTag` accessors on `Entity`, `Block` and `BlockState`.
  - `@jsprismarine/brigadier` merges the exception classes into one module to remove an import cycle; the old module paths re-export from it.
  - `@jsprismarine/math` widens `Vector3.equals` to accept `Vector2` (returning `false`), matching the base signature.
  - `@jsprismarine/server` reads env files with `process.loadEnvFile` instead of dotenv.

- [#2597](https://github.com/JSPrismarine/JSPrismarine/pull/2597) [`0dcba03`](https://github.com/JSPrismarine/JSPrismarine/commit/0dcba03a699f559fba5e70b3fe17892dda613b59) Thanks [@filiphsps](https://github.com/filiphsps)! - Update yargs to 18.2.0

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a736dcd`](https://github.com/JSPrismarine/JSPrismarine/commit/a736dcdbe92e58eeac3e0cbb3e986b109e2a8101) Thanks [@filiphsps](https://github.com/filiphsps)! - Write the configured `log-level` to the log file as well as the console. The file transport was pinned at `debug`, so `log-level: silly` in `config.yaml` never put the per-packet `Sent`/`Received` lines in `logs/`, and a join that failed on a real client left no record of which packets it had been sent.

- [#2602](https://github.com/JSPrismarine/JSPrismarine/pull/2602) [`7d4d586`](https://github.com/JSPrismarine/JSPrismarine/commit/7d4d5862ad89486a5e3857cc7d0b779753764fd1) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Write log files to `JSP_DIR` when it is an absolute path. Before this change, `JSP_DIR=/data` put the logs under `<working directory>/data/logs`, so a server in a read-only working directory, such as the Docker image's, crashed on startup.
- Updated dependencies [[`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`74722e8`](https://github.com/JSPrismarine/JSPrismarine/commit/74722e8b07e5865ca42b04ff81503f2a0559bd0b), [`f320277`](https://github.com/JSPrismarine/JSPrismarine/commit/f320277d45ccd2ed2242f07f3818264605b2e9b8), [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6), [`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0), [`30008ec`](https://github.com/JSPrismarine/JSPrismarine/commit/30008ec028477ee99d2fa503e421c21de4207787), [`2423ed0`](https://github.com/JSPrismarine/JSPrismarine/commit/2423ed0c8b5ada9b59c6441f1c2bbcd70df8c554), [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9), [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36), [`733c0e1`](https://github.com/JSPrismarine/JSPrismarine/commit/733c0e1ed7bca0a47a4a1be9b13821413916a420), [`b4ec81c`](https://github.com/JSPrismarine/JSPrismarine/commit/b4ec81c119bf3a4d95660541c438d07d8fca58cc), [`d4e1796`](https://github.com/JSPrismarine/JSPrismarine/commit/d4e1796deb7b4132021b362ef3561df3f958de72), [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9), [`98a5594`](https://github.com/JSPrismarine/JSPrismarine/commit/98a55948a7e966fc1e46ca13707a8212dedba6fa), [`f7d2297`](https://github.com/JSPrismarine/JSPrismarine/commit/f7d2297ce7176489a19a141ab4b071eb7a2461a6), [`cc3a371`](https://github.com/JSPrismarine/JSPrismarine/commit/cc3a37165fe66ea44bc72fd48f8d59c0f2359031), [`d7ddc4f`](https://github.com/JSPrismarine/JSPrismarine/commit/d7ddc4fb1c0cd3493b22af3edc4274d529441d7b), [`9300913`](https://github.com/JSPrismarine/JSPrismarine/commit/93009135c3977ea4d43b5ab5de3460f674a698c6), [`bf3d6d7`](https://github.com/JSPrismarine/JSPrismarine/commit/bf3d6d7786b7cc36237336674f3a7a0909f0559a), [`58ef8d6`](https://github.com/JSPrismarine/JSPrismarine/commit/58ef8d68e9e96a7031c74d864af8e449ee440a2d), [`cc3a371`](https://github.com/JSPrismarine/JSPrismarine/commit/cc3a37165fe66ea44bc72fd48f8d59c0f2359031), [`b390249`](https://github.com/JSPrismarine/JSPrismarine/commit/b39024922c3f95f7823f52aeef41ae00c46273af), [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184), [`7f7431c`](https://github.com/JSPrismarine/JSPrismarine/commit/7f7431cb36545eaac5942df60ce3da8915391914), [`95c1def`](https://github.com/JSPrismarine/JSPrismarine/commit/95c1defed96f389f944c2b61a70d4fe356d271c7), [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6), [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6), [`e319eb5`](https://github.com/JSPrismarine/JSPrismarine/commit/e319eb53013b17a99a2e0e8c4647747fbc0bdb3f), [`5a94fc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5a94fc5b9ffab382f86092dea42cbe768f7b9acc), [`bf3d6d7`](https://github.com/JSPrismarine/JSPrismarine/commit/bf3d6d7786b7cc36237336674f3a7a0909f0559a), [`ef1fd47`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1fd47b9d28a22b006d21ab497103367f081085), [`ef1fd47`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1fd47b9d28a22b006d21ab497103367f081085), [`b7c7ff9`](https://github.com/JSPrismarine/JSPrismarine/commit/b7c7ff9deea743b61f96ce3b173327e13dea6d11), [`3942a02`](https://github.com/JSPrismarine/JSPrismarine/commit/3942a02618a86c57fecbdd8eb710ba88db71ac16), [`5ff5249`](https://github.com/JSPrismarine/JSPrismarine/commit/5ff5249c6ae85f22c78c824b19aec4f25944cdc5), [`f41832a`](https://github.com/JSPrismarine/JSPrismarine/commit/f41832a37db074e0a50daaea73d586281cf83505), [`9d3de40`](https://github.com/JSPrismarine/JSPrismarine/commit/9d3de4018f18712d426d0cc4246849d7dfbc4c3b), [`5c8d0aa`](https://github.com/JSPrismarine/JSPrismarine/commit/5c8d0aa8e9481714f17eb3a6568b79fcf8d7a2fa), [`4f9f167`](https://github.com/JSPrismarine/JSPrismarine/commit/4f9f1674ffad59abf28f373841d4c9e94948c1d3), [`bccb4ab`](https://github.com/JSPrismarine/JSPrismarine/commit/bccb4abebd93c636ceb8f9f7e2030edfb873423c), [`d05b02d`](https://github.com/JSPrismarine/JSPrismarine/commit/d05b02d7899de717176e66b9bc01bcc7ab1ae5c9), [`f2ec14a`](https://github.com/JSPrismarine/JSPrismarine/commit/f2ec14ab4fa633683af6ca54e8e5fd116115e6e7), [`b31c809`](https://github.com/JSPrismarine/JSPrismarine/commit/b31c80982ec3bd2b2c773e38e383370de7d4ab49), [`c40174e`](https://github.com/JSPrismarine/JSPrismarine/commit/c40174e64c7358a8763fb56ed49915765e087f9d), [`2594d19`](https://github.com/JSPrismarine/JSPrismarine/commit/2594d1902fc6569998f57053531b08968c37951c), [`a5eda59`](https://github.com/JSPrismarine/JSPrismarine/commit/a5eda5987311bc6506c4cb044a2a16a35cd2ab3c), [`7d27c72`](https://github.com/JSPrismarine/JSPrismarine/commit/7d27c72514d37772b6e1ef2d3ba37123cf087705), [`72e5d6d`](https://github.com/JSPrismarine/JSPrismarine/commit/72e5d6d53c7d6bff54395d93bcc0ae6d7e13ba98), [`1e37459`](https://github.com/JSPrismarine/JSPrismarine/commit/1e37459b0af59d87deb445ea63b5f6563dfcd07e), [`b752e88`](https://github.com/JSPrismarine/JSPrismarine/commit/b752e881aa60db17479ea6225d71e6fc443bc808), [`5ad6f00`](https://github.com/JSPrismarine/JSPrismarine/commit/5ad6f001ae52e6c156d02919d7f47e68bfc7d1c7), [`4a89177`](https://github.com/JSPrismarine/JSPrismarine/commit/4a89177a12ea1473d930b6a96548e7e9991edeb0), [`5939ba5`](https://github.com/JSPrismarine/JSPrismarine/commit/5939ba5a647da3c987e05f3753e5dc829955bad3), [`ccf3672`](https://github.com/JSPrismarine/JSPrismarine/commit/ccf36723ef0fd8eb8415d44bf670fd93dbc5072d), [`c1d755e`](https://github.com/JSPrismarine/JSPrismarine/commit/c1d755e07898685e11382f36674bdd0863e4b5ae), [`90f8798`](https://github.com/JSPrismarine/JSPrismarine/commit/90f87988dc6f2498dc62e18735047870117d93ad), [`1b7a41f`](https://github.com/JSPrismarine/JSPrismarine/commit/1b7a41f982a379becefc4b1716042eb9c33c3375), [`3813ce9`](https://github.com/JSPrismarine/JSPrismarine/commit/3813ce9501db9cd859fcc0e3bdf3aeb0712cadcd), [`0aefdfa`](https://github.com/JSPrismarine/JSPrismarine/commit/0aefdfae1a68f61d66581e8836718ff37e127ec9), [`b6e5ccb`](https://github.com/JSPrismarine/JSPrismarine/commit/b6e5ccbdfe29d972699a7fe92c27cc5084798cef), [`4072778`](https://github.com/JSPrismarine/JSPrismarine/commit/407277842093c7f82f5584b4c477963b7a42321d), [`ece6eac`](https://github.com/JSPrismarine/JSPrismarine/commit/ece6eacc885e4e24359d95655002289bc33cc812), [`698f891`](https://github.com/JSPrismarine/JSPrismarine/commit/698f891b8fc43f38fd616a979ca6a0d58a48bfa1), [`2f78483`](https://github.com/JSPrismarine/JSPrismarine/commit/2f78483cb75978a304c2da8bc7144536cf9a07aa), [`f0e7cd3`](https://github.com/JSPrismarine/JSPrismarine/commit/f0e7cd3482f6575aa4004e765723fd9602042cae), [`82db23a`](https://github.com/JSPrismarine/JSPrismarine/commit/82db23a22169fd09e027051b3b6f3f7f56981ee5), [`436f4af`](https://github.com/JSPrismarine/JSPrismarine/commit/436f4afdaf1f3a91cbb642dfbed19250e443ff71), [`e00c31d`](https://github.com/JSPrismarine/JSPrismarine/commit/e00c31de32f4cf67f55253d83df1a65caad1b4b7), [`37afa90`](https://github.com/JSPrismarine/JSPrismarine/commit/37afa9046fd2dddb31e34f4f66e3b2b004769096), [`8a5570c`](https://github.com/JSPrismarine/JSPrismarine/commit/8a5570cf072483d412a7a591a6da83105b9b3993), [`1d14d17`](https://github.com/JSPrismarine/JSPrismarine/commit/1d14d17dcce52599ecb729afb38e61fe97029b51), [`f1cad6a`](https://github.com/JSPrismarine/JSPrismarine/commit/f1cad6a43599ff3e39528a9a0039d254738ad665), [`06dd676`](https://github.com/JSPrismarine/JSPrismarine/commit/06dd676cc007df4aa616b858767c358477a72410), [`7b82d53`](https://github.com/JSPrismarine/JSPrismarine/commit/7b82d537de1732ca6f5c7f6e19e7a4efdeb3ab56), [`9a1abc3`](https://github.com/JSPrismarine/JSPrismarine/commit/9a1abc305179d8c5d573d353971a23475daf8c4d), [`85e04c8`](https://github.com/JSPrismarine/JSPrismarine/commit/85e04c8246593f9252f0364174941bdd016d2ab9), [`22dbd48`](https://github.com/JSPrismarine/JSPrismarine/commit/22dbd4869341ed3d6c43edc45eb7f37d95eee226), [`b856cf6`](https://github.com/JSPrismarine/JSPrismarine/commit/b856cf6f362943185236cbfe6ca7b896d3b7ef64), [`8227f46`](https://github.com/JSPrismarine/JSPrismarine/commit/8227f469b15c36222af11f3161b72687db72c56a), [`e414269`](https://github.com/JSPrismarine/JSPrismarine/commit/e414269e9f12ed33aec044ee15169e4f7373a6ae), [`0f387a9`](https://github.com/JSPrismarine/JSPrismarine/commit/0f387a9e70e2868a93f1f5c461ecd7290e32a2ca), [`a3ea9cf`](https://github.com/JSPrismarine/JSPrismarine/commit/a3ea9cf44dc9ccb74b12dbfbe7703b3403390ffd), [`8ce9329`](https://github.com/JSPrismarine/JSPrismarine/commit/8ce9329b1f92a5c18f492e4e8b5735037d7e8354), [`10944b8`](https://github.com/JSPrismarine/JSPrismarine/commit/10944b82e83d11d18cd05004d83623c559f0f684), [`60ba0b6`](https://github.com/JSPrismarine/JSPrismarine/commit/60ba0b6e04eba800d2e66be0ed66f3719784ef41), [`cf75135`](https://github.com/JSPrismarine/JSPrismarine/commit/cf75135eb27fd9bb08137673bf0c8c50dd7e29ec), [`1412a24`](https://github.com/JSPrismarine/JSPrismarine/commit/1412a24f7bd59941afa6b36256ff140f4deb1eb6), [`4732653`](https://github.com/JSPrismarine/JSPrismarine/commit/4732653db60cd2c389e5deffc16be34c43dbc9ca), [`1bbc264`](https://github.com/JSPrismarine/JSPrismarine/commit/1bbc264ffb76061b8d1854736b2cc0388a9b9cc8), [`7a9e9c9`](https://github.com/JSPrismarine/JSPrismarine/commit/7a9e9c9e9abe96e1d30e1fe7fa7a528337908418), [`c5d8aa2`](https://github.com/JSPrismarine/JSPrismarine/commit/c5d8aa2ddf44f1e8e083a3e40084a60344a67dde), [`dd2df4b`](https://github.com/JSPrismarine/JSPrismarine/commit/dd2df4b765a500b25ce5e529d0a64e1f4107c9f0), [`47aa6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/47aa6e16f289451963ef552d5f146cfd5d7ac5d3), [`047d691`](https://github.com/JSPrismarine/JSPrismarine/commit/047d6911d8423575826102154a49ca1911261bb8), [`651a963`](https://github.com/JSPrismarine/JSPrismarine/commit/651a963921bfcb9bd72ab40323acecd8e3dd91d3), [`9b950dd`](https://github.com/JSPrismarine/JSPrismarine/commit/9b950dd857fbd6a1a4a6d8daa8667612432a4f4f), [`ebc42a1`](https://github.com/JSPrismarine/JSPrismarine/commit/ebc42a102a7128ddb8c538cb1d379c54f18f709e), [`399f05d`](https://github.com/JSPrismarine/JSPrismarine/commit/399f05daa9879d6a30dce1d57e51fced9c64d718), [`4efbc9e`](https://github.com/JSPrismarine/JSPrismarine/commit/4efbc9e63f551fe62d6fd080e0ce2985f1392e33), [`a848770`](https://github.com/JSPrismarine/JSPrismarine/commit/a8487700bb0534a0a3b7415671a69edbb8628e3a), [`c2dbce4`](https://github.com/JSPrismarine/JSPrismarine/commit/c2dbce4145b325e9363cad8c802f6a3e1190c784), [`1cbf13d`](https://github.com/JSPrismarine/JSPrismarine/commit/1cbf13d6fbf30be2e747057cbe2805d286e8f6a6), [`c7e634e`](https://github.com/JSPrismarine/JSPrismarine/commit/c7e634e23aa8165680e01e4f9ec0617fa81e18ae), [`3f05143`](https://github.com/JSPrismarine/JSPrismarine/commit/3f05143f8641a5c6339e0378516bb9536a02d2cc), [`efd7572`](https://github.com/JSPrismarine/JSPrismarine/commit/efd757225cfc82132c928c25996b69ee0e43e780), [`e9010e6`](https://github.com/JSPrismarine/JSPrismarine/commit/e9010e68975bfc21aeb6edb913afef3d4ff02ec5), [`f4f55c1`](https://github.com/JSPrismarine/JSPrismarine/commit/f4f55c1664bdff45e0d35c90f400b4bc3b3f6691), [`62c2ee8`](https://github.com/JSPrismarine/JSPrismarine/commit/62c2ee83247e10e45ccac5d3476e288b7c0e32c5), [`73e3455`](https://github.com/JSPrismarine/JSPrismarine/commit/73e3455ab183e92e48994c696e5940d1b47899e2), [`f345277`](https://github.com/JSPrismarine/JSPrismarine/commit/f345277ad0ee92353b71ff29bc9562575f8e8c17), [`0cb1faa`](https://github.com/JSPrismarine/JSPrismarine/commit/0cb1faa002e22c9bfb423092b9baf00c6a2e73fc), [`d692152`](https://github.com/JSPrismarine/JSPrismarine/commit/d692152ea08791fe408f2093a58fc2a3dadf5c74), [`fcc8ebf`](https://github.com/JSPrismarine/JSPrismarine/commit/fcc8ebffa6b7b4f56da20211c251780b303219b0), [`2f8caed`](https://github.com/JSPrismarine/JSPrismarine/commit/2f8caed2eecf581b0f6e47e4b2e6cfdeb80dedc3), [`cab994b`](https://github.com/JSPrismarine/JSPrismarine/commit/cab994bb54ccec937e7a6280a0a2ec29734b8290), [`2dbbcbf`](https://github.com/JSPrismarine/JSPrismarine/commit/2dbbcbffdba35f64824bf1d018e1431cc2fd2dee), [`c7e1818`](https://github.com/JSPrismarine/JSPrismarine/commit/c7e18181643ebdec5efadcc2d00e0bcf36626882), [`5fa2f55`](https://github.com/JSPrismarine/JSPrismarine/commit/5fa2f555ffac50d5f3c2315a499af172edad1f64), [`c19ffdf`](https://github.com/JSPrismarine/JSPrismarine/commit/c19ffdf5636a495013995042960cd30a38377b74), [`c5e40b4`](https://github.com/JSPrismarine/JSPrismarine/commit/c5e40b4f2e3dc6eadfb46d89affb990ab00861e3), [`dfb64e9`](https://github.com/JSPrismarine/JSPrismarine/commit/dfb64e9af7853e51cbe04e50dd01487ced986054), [`e1b44b2`](https://github.com/JSPrismarine/JSPrismarine/commit/e1b44b272cd941c6106039b4b21329c45abd06bb), [`fd4bbc4`](https://github.com/JSPrismarine/JSPrismarine/commit/fd4bbc482770f43d8378b39773109f3e688016bd), [`eb3fd44`](https://github.com/JSPrismarine/JSPrismarine/commit/eb3fd44b6ff60a6adc0597402cfd1d4018a4cff2), [`f74ff2f`](https://github.com/JSPrismarine/JSPrismarine/commit/f74ff2f7e77619af2d10da78bc6cd9743ce72bdb), [`761a713`](https://github.com/JSPrismarine/JSPrismarine/commit/761a71380bade91ace18a3df0ebf565443d9ca86), [`062aa3b`](https://github.com/JSPrismarine/JSPrismarine/commit/062aa3b75a4d2aa55bad733dfb9e00eeb5b58647), [`856ec37`](https://github.com/JSPrismarine/JSPrismarine/commit/856ec374b2feb8da6df03563c9f7b09a8d181de8), [`e59720d`](https://github.com/JSPrismarine/JSPrismarine/commit/e59720d1524333e38579ff2eea26ef7bacccf88d), [`800f815`](https://github.com/JSPrismarine/JSPrismarine/commit/800f81543aa7fce7a7d1ca0e93318f430a100cbb), [`2a803b4`](https://github.com/JSPrismarine/JSPrismarine/commit/2a803b4b31084924ce86dacd5cb9daa9fcf80068), [`f21e70a`](https://github.com/JSPrismarine/JSPrismarine/commit/f21e70a71a65729844f85b7dea051febc4e589ac), [`f0d1719`](https://github.com/JSPrismarine/JSPrismarine/commit/f0d17195a6daa6eb0502b5bd0f54f45084352f1c), [`e80abed`](https://github.com/JSPrismarine/JSPrismarine/commit/e80abed43a45f30eeee69e153c5e96d50b4544ff), [`5b96d5a`](https://github.com/JSPrismarine/JSPrismarine/commit/5b96d5ac59cfbc754a3977aeaaa57e9991a1404a), [`09b66b9`](https://github.com/JSPrismarine/JSPrismarine/commit/09b66b9d71f61549e4173e4efaf3a981e0d70566), [`a5cbae7`](https://github.com/JSPrismarine/JSPrismarine/commit/a5cbae769bf072ba88b8b76cea3dc23b75c2d876), [`b294f3f`](https://github.com/JSPrismarine/JSPrismarine/commit/b294f3faf684a9810ee38e4cf6fa3b97e16c3d68), [`8bbdd64`](https://github.com/JSPrismarine/JSPrismarine/commit/8bbdd646984bf5894b8061d125e4c34083a9b819), [`bf3d6d7`](https://github.com/JSPrismarine/JSPrismarine/commit/bf3d6d7786b7cc36237336674f3a7a0909f0559a), [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b), [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029), [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a), [`e25f62b`](https://github.com/JSPrismarine/JSPrismarine/commit/e25f62bdba9c0c42193f1f368c69c22cf07e91de), [`2eda0da`](https://github.com/JSPrismarine/JSPrismarine/commit/2eda0da630ef2d917c6906dc79b1cc1266607dd9), [`cb93c6c`](https://github.com/JSPrismarine/JSPrismarine/commit/cb93c6c598798cf7d1d0b489c8c46e6c2e082e23), [`218a8a8`](https://github.com/JSPrismarine/JSPrismarine/commit/218a8a856e48d82f02b4c93f976939b900302dc7), [`8b66629`](https://github.com/JSPrismarine/JSPrismarine/commit/8b666295644f770b2e99c5e4b6839a79f9a0c4ab), [`a10d86a`](https://github.com/JSPrismarine/JSPrismarine/commit/a10d86aad180120f14dcf3fe0e5944c3dc373235), [`0f058dd`](https://github.com/JSPrismarine/JSPrismarine/commit/0f058dd7353e522b61ec1c45366c667bab12a389), [`c76286f`](https://github.com/JSPrismarine/JSPrismarine/commit/c76286f0101f6fad70f78023282271801880b394), [`5b57bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/5b57bc3cac03393219507b3cbb700cae8b174d13), [`b20d325`](https://github.com/JSPrismarine/JSPrismarine/commit/b20d3256b5005a0b594d2a8d1abadc3142ef0503), [`2b474b7`](https://github.com/JSPrismarine/JSPrismarine/commit/2b474b739ec7420dea21d02751fbb66f3a7f6a04), [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6), [`ecf472e`](https://github.com/JSPrismarine/JSPrismarine/commit/ecf472ebcd2a7f87d38b7b7ecdbe52f03a7d043f), [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029), [`4b93318`](https://github.com/JSPrismarine/JSPrismarine/commit/4b933182ab382f78dd4d660dd91c2cb86b85c851), [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b), [`ef1fd47`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1fd47b9d28a22b006d21ab497103367f081085), [`0a792e7`](https://github.com/JSPrismarine/JSPrismarine/commit/0a792e773989dc75658f46609f0acfeddc1dc3a5)]:
  - @jsprismarine/minecraft@0.15.0
  - @jsprismarine/prismarine@0.15.0
  - @jsprismarine/raknet@0.15.0
  - @jsprismarine/color-parser@0.15.0
  - @jsprismarine/logger@0.15.0

## 0.14.2

### Patch Changes

- Updated dependencies [[`6b15f32`](https://github.com/JSPrismarine/JSPrismarine/commit/6b15f32341e8131b1c498013f2f951b774adff64)]:
  - @jsprismarine/prismarine@0.14.2
  - @jsprismarine/color-parser@0.14.2
  - @jsprismarine/logger@0.14.2
  - @jsprismarine/minecraft@0.14.2
  - @jsprismarine/raknet@0.14.2

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

- Updated dependencies [[`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2)]:
    - @jsprismarine/color-parser@0.14.1
    - @jsprismarine/logger@0.14.1
    - @jsprismarine/minecraft@0.14.1
    - @jsprismarine/prismarine@0.14.1
    - @jsprismarine/raknet@0.14.1

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

### Patch Changes

- Updated dependencies [[`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a), [`c572c06`](https://github.com/JSPrismarine/JSPrismarine/commit/c572c06c61f668cd7cfababb05e7adbc219876ca), [`3aa7813`](https://github.com/JSPrismarine/JSPrismarine/commit/3aa78132d3805cefe776d8de835b0b1081ca3095)]:
    - @jsprismarine/color-parser@0.14.0
    - @jsprismarine/logger@0.14.0
    - @jsprismarine/minecraft@0.14.0
    - @jsprismarine/prismarine@0.14.0
    - @jsprismarine/raknet@0.14.0

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

- Updated dependencies [[`f8dddf8`](https://github.com/JSPrismarine/JSPrismarine/commit/f8dddf8bbd7e444248d82fa4179eacf538485100), [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51)]:
    - @jsprismarine/prismarine@0.13.5
    - @jsprismarine/color-parser@0.13.5
    - @jsprismarine/logger@0.13.5
    - @jsprismarine/minecraft@0.13.5
    - @jsprismarine/raknet@0.13.5

## 0.13.2

### Patch Changes

- Updated dependencies [[`ab719cb`](https://github.com/JSPrismarine/JSPrismarine/commit/ab719cb2a58f3b099a3017694ce4ce610bf5cf54)]:
    - @jsprismarine/prismarine@0.13.2
    - @jsprismarine/color-parser@0.13.2
    - @jsprismarine/logger@0.13.2
    - @jsprismarine/minecraft@0.13.2
    - @jsprismarine/raknet@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.1
    - @jsprismarine/logger@0.13.1
    - @jsprismarine/minecraft@0.13.1
    - @jsprismarine/prismarine@0.13.1
    - @jsprismarine/raknet@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [[`ea1948a`](https://github.com/JSPrismarine/JSPrismarine/commit/ea1948a494893e0cb03774c5530971d20e7bfdaf)]:
    - @jsprismarine/prismarine@0.13.0
    - @jsprismarine/color-parser@0.13.0
    - @jsprismarine/logger@0.13.0
    - @jsprismarine/minecraft@0.13.0
    - @jsprismarine/raknet@0.13.0

## 0.12.1

### Patch Changes

- Updated dependencies [[`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72), [`6bf4e8d`](https://github.com/JSPrismarine/JSPrismarine/commit/6bf4e8dcfb07d45c1c1a6ff32b4993b0f8f4f96e)]:
    - @jsprismarine/color-parser@0.12.1
    - @jsprismarine/prismarine@0.12.1
    - @jsprismarine/minecraft@0.12.1
    - @jsprismarine/logger@0.12.1
    - @jsprismarine/raknet@0.12.1

## 0.12.0

### Patch Changes

- Updated dependencies [[`0a8f8d7`](https://github.com/JSPrismarine/JSPrismarine/commit/0a8f8d7f2d8638f3da68abdbf65ba3c48dcda038), [`b025e15`](https://github.com/JSPrismarine/JSPrismarine/commit/b025e153f6777aaae672d8331926b2ac91e7e2e0), [`98ec1c5`](https://github.com/JSPrismarine/JSPrismarine/commit/98ec1c58363e95f04fec9c6118e637e21ad5fc1e), [`b025e15`](https://github.com/JSPrismarine/JSPrismarine/commit/b025e153f6777aaae672d8331926b2ac91e7e2e0), [`d761626`](https://github.com/JSPrismarine/JSPrismarine/commit/d761626b51b8a402b13d111e3dd25b560bfdf8fe)]:
    - @jsprismarine/prismarine@0.12.0
    - @jsprismarine/raknet@0.12.0
    - @jsprismarine/color-parser@0.12.0
    - @jsprismarine/logger@0.12.0
    - @jsprismarine/minecraft@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies [[`a79d837`](https://github.com/JSPrismarine/JSPrismarine/commit/a79d837e132bd2fbf1a91452b680341dafa76fe2)]:
    - @jsprismarine/prismarine@0.11.1
    - @jsprismarine/color-parser@0.11.1
    - @jsprismarine/logger@0.11.1
    - @jsprismarine/minecraft@0.11.1
    - @jsprismarine/raknet@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies [[`e962b51`](https://github.com/JSPrismarine/JSPrismarine/commit/e962b514e196511111877e9ad856a00291216c6e), [`3303be8`](https://github.com/JSPrismarine/JSPrismarine/commit/3303be822a8aff09142172e0796e66473dc2fef2), [`4b7f94d`](https://github.com/JSPrismarine/JSPrismarine/commit/4b7f94d805480a171728bc82829874c3d0258fc3), [`ad0e562`](https://github.com/JSPrismarine/JSPrismarine/commit/ad0e5623a34f0424bd520b68131b56e92dec1cea), [`51ba84e`](https://github.com/JSPrismarine/JSPrismarine/commit/51ba84e1fe3b7ad99a9fb07039048c9cab2075b6), [`4b7f94d`](https://github.com/JSPrismarine/JSPrismarine/commit/4b7f94d805480a171728bc82829874c3d0258fc3)]:
    - @jsprismarine/prismarine@0.11.0
    - @jsprismarine/logger@0.11.0
    - @jsprismarine/color-parser@0.11.0
    - @jsprismarine/minecraft@0.11.0
    - @jsprismarine/raknet@0.11.0

## 0.10.0

### Patch Changes

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

- Updated dependencies [[`99566e3`](https://github.com/JSPrismarine/JSPrismarine/commit/99566e363f4a726de5180f998e7fd2fd36cc5bf7), [`ef1e604`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1e604cdcddc73ea8b23b545142592a90b34884), [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a), [`a7f7e16`](https://github.com/JSPrismarine/JSPrismarine/commit/a7f7e16c3b5ee8415a9561b8eb388d81bd23fd9c), [`306495d`](https://github.com/JSPrismarine/JSPrismarine/commit/306495dff6d34e8a1dca1187bf5e9a285325ec8f)]:
    - @jsprismarine/prismarine@0.10.0
    - @jsprismarine/color-parser@0.10.0
    - @jsprismarine/minecraft@0.10.0
    - @jsprismarine/logger@0.10.0
    - @jsprismarine/raknet@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [[`9963470`](https://github.com/JSPrismarine/JSPrismarine/commit/996347038b55d4d08b08b1efdc451e89d7265b30)]:
    - @jsprismarine/minecraft@0.9.0
    - @jsprismarine/prismarine@0.9.0
    - @jsprismarine/color-parser@0.9.0
    - @jsprismarine/logger@0.9.0
    - @jsprismarine/raknet@0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

- Updated dependencies [[`40af4b2`](https://github.com/JSPrismarine/JSPrismarine/commit/40af4b23802f74b2eecd34a4f05e90044d51fd56), [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7), [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a)]:
    - @jsprismarine/prismarine@0.8.0
    - @jsprismarine/color-parser@0.8.0
    - @jsprismarine/minecraft@0.8.0
    - @jsprismarine/logger@0.8.0
    - @jsprismarine/raknet@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [[`142c6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/142c6e1ca4f8961271d1c8caa8fbf0c71dc315b6), [`1e013a6`](https://github.com/JSPrismarine/JSPrismarine/commit/1e013a60b9987929b53b2cc1d333daf8b5d45196)]:
    - @jsprismarine/prismarine@0.7.0
    - @jsprismarine/color-parser@0.7.0
    - @jsprismarine/logger@0.7.0
    - @jsprismarine/minecraft@0.7.0
    - @jsprismarine/raknet@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.6.0
    - @jsprismarine/logger@0.6.0
    - @jsprismarine/minecraft@0.6.0
    - @jsprismarine/prismarine@0.6.0
    - @jsprismarine/raknet@0.6.0

## 0.5.0

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

- Updated dependencies [[`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1), [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53), [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1), [`3a00892`](https://github.com/JSPrismarine/JSPrismarine/commit/3a00892ab6d8e0647c94da96bb85553f08a8484b)]:
    - @jsprismarine/prismarine@0.5.0
    - @jsprismarine/color-parser@0.5.0
    - @jsprismarine/minecraft@0.5.0
    - @jsprismarine/logger@0.5.0
    - @jsprismarine/raknet@0.5.0

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

- Updated dependencies [[`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe), [`2d32a17`](https://github.com/JSPrismarine/JSPrismarine/commit/2d32a17c994a3cbd3d98d94dd0f33280a863c81a), [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3)]:
    - @jsprismarine/color-parser@0.4.5
    - @jsprismarine/prismarine@0.4.5
    - @jsprismarine/minecraft@0.4.5
    - @jsprismarine/logger@0.4.5
    - @jsprismarine/raknet@0.4.5

## 0.4.4

### Patch Changes

- Updated dependencies [[`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a), [`2b5bc2f`](https://github.com/JSPrismarine/JSPrismarine/commit/2b5bc2fbffe777c329fd5684e342050cd2e13c43), [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a), [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7), [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a)]:
    - @jsprismarine/prismarine@0.4.4
    - @jsprismarine/minecraft@0.4.4
    - @jsprismarine/raknet@0.4.4
    - @jsprismarine/color-parser@0.4.4
    - @jsprismarine/logger@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies [[`b0a232b`](https://github.com/JSPrismarine/JSPrismarine/commit/b0a232b9be5d6456c33d5300582a0c7e33d76a6e)]:
    - @jsprismarine/prismarine@0.4.3
    - @jsprismarine/color-parser@0.4.3
    - @jsprismarine/logger@0.4.3
    - @jsprismarine/raknet@0.4.3

## 0.4.2

### Patch Changes

- [#1315](https://github.com/JSPrismarine/JSPrismarine/pull/1315) [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/logger` package.

- Updated dependencies [[`384f571`](https://github.com/JSPrismarine/JSPrismarine/commit/384f5716d593f2f3bac4a9521578d32107e671a8), [`7d7283b`](https://github.com/JSPrismarine/JSPrismarine/commit/7d7283ba87e6fc030d25be8a2a542745a5c94745), [`a66c1b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a66c1b981698fa26570bb0fd9ebf667240a172b7), [`b54350e`](https://github.com/JSPrismarine/JSPrismarine/commit/b54350eb6341fc487b05781b149c148bae3a5f55), [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4)]:
    - @jsprismarine/prismarine@0.4.2
    - @jsprismarine/logger@0.4.2
    - @jsprismarine/color-parser@0.4.2
    - @jsprismarine/raknet@0.4.2

## 0.4.1

### Patch Changes

- [#1296](https://github.com/JSPrismarine/JSPrismarine/pull/1296) [`44c25e1`](https://github.com/JSPrismarine/JSPrismarine/commit/44c25e132b55174a1e57aee9152e6fbb73c90cf6) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix stdin on Windows.
  Add input history.
  Improve exit reliability.
- Updated dependencies [[`44c25e1`](https://github.com/JSPrismarine/JSPrismarine/commit/44c25e132b55174a1e57aee9152e6fbb73c90cf6), [`8bc4525`](https://github.com/JSPrismarine/JSPrismarine/commit/8bc452534b5048b71a08e509d2823203bf07a407), [`e1ba6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/e1ba6e71a2757cd6bba00c95d15d0d672c8cf476), [`69dae84`](https://github.com/JSPrismarine/JSPrismarine/commit/69dae84d2fde2bb754442f58a85dc4a865e28966)]:
    - @jsprismarine/prismarine@0.4.1
    - @jsprismarine/raknet@0.4.1

## 0.4.0

### Minor Changes

- [#1280](https://github.com/JSPrismarine/JSPrismarine/pull/1280) [`c7965d4`](https://github.com/JSPrismarine/JSPrismarine/commit/c7965d446ce591b29e71a75bfed0ae6ca5ef91cb) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `.env` support (support `.local` and `.development` suffixes).

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

- [`fad26e2`](https://github.com/JSPrismarine/JSPrismarine/commit/fad26e2affc095a94cfaed417891bbc9605af589) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `Server.instance`.
    - Remove passing of version from `@jsprismarine/server` to `@jsprismarine/prismarine`.
- Updated dependencies [[`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5), [`fad26e2`](https://github.com/JSPrismarine/JSPrismarine/commit/fad26e2affc095a94cfaed417891bbc9605af589), [`91b556d`](https://github.com/JSPrismarine/JSPrismarine/commit/91b556de0064b8e670ea46b61f0c51817ea7b425), [`c7965d4`](https://github.com/JSPrismarine/JSPrismarine/commit/c7965d446ce591b29e71a75bfed0ae6ca5ef91cb)]:
    - @jsprismarine/prismarine@0.4.0
    - @jsprismarine/raknet@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/prismarine@0.3.0
    - @jsprismarine/raknet@0.3.0

## 0.2.0

### Minor Changes

- [`2859dd2`](https://github.com/JSPrismarine/JSPrismarine/commit/2859dd2d9052fe7da9c222c6cab908412fce223e) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `async-exit-hook`.
    - It got in the way of `@jsprismarine/prismarine`.

- [#1249](https://github.com/JSPrismarine/JSPrismarine/pull/1249) [`6477e70`](https://github.com/JSPrismarine/JSPrismarine/commit/6477e7079ef9f8eca981f4ab539b7045ee514e2f) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `@jsprismarine/updater`.
    - We don't need an updater at the moment, in the future that job should probably be up to npm/jsr/etc.

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

- Updated dependencies [[`f7e0fc4`](https://github.com/JSPrismarine/JSPrismarine/commit/f7e0fc414117553581aa246eedd3861b2122eadf), [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1), [`6477e70`](https://github.com/JSPrismarine/JSPrismarine/commit/6477e7079ef9f8eca981f4ab539b7045ee514e2f), [`6001709`](https://github.com/JSPrismarine/JSPrismarine/commit/6001709dcfddb12e6ddf0c8fe919cabacb5d6122)]:
    - @jsprismarine/prismarine@0.2.0
    - @jsprismarine/raknet@0.2.0

## 0.1.1

### Patch Changes

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

- Updated dependencies [[`323a666`](https://github.com/JSPrismarine/JSPrismarine/commit/323a666b2d4b82e399ff21711ff8cc7ca6f520dd), [`491b688`](https://github.com/JSPrismarine/JSPrismarine/commit/491b688adc0c38426b767646b6cc748b8e774e30), [`ff73b13`](https://github.com/JSPrismarine/JSPrismarine/commit/ff73b133659cf83e01a751b0e8bfbcfe56f88346), [`20a8ea4`](https://github.com/JSPrismarine/JSPrismarine/commit/20a8ea47c25eaf21548f1994bf915c4c22a0f395), [`7073f41`](https://github.com/JSPrismarine/JSPrismarine/commit/7073f414487b7403765686b05d04f99c6878d88a), [`cdecbaa`](https://github.com/JSPrismarine/JSPrismarine/commit/cdecbaaf823a6f2db15e1793b50da9925deb3716), [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5), [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd)]:
    - @jsprismarine/prismarine@0.1.1
    - @jsprismarine/updater@0.1.1
    - @jsprismarine/raknet@0.1.1

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    - The build system has been refactored to support both esm and cjs.
    - Releases are now managed by changeset.
- Updated dependencies [[`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5)]:
    - @jsprismarine/prismarine@0.1.0
    - @jsprismarine/updater@0.1.0
    - @jsprismarine/raknet@0.1.0
