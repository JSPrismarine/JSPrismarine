// Times empty node:ffi calls by signature. Build tiny.c beside this file into libtiny first.
const library = process.argv[2];
const ffi = process.getBuiltinModule('node:ffi');
const N = 1_000_000;
const fastest = (run) => {
    let best = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 5; round++) {
        const start = performance.now();
        run();
        best = Math.min(best, performance.now() - start);
    }
    return ((best * 1e6) / N).toFixed(1);
};
const signatures = {
    one: { arguments: ['f64'], return: 'f64' },
    three: { arguments: ['f64', 'f64', 'f64'], return: 'f64' },
    four: { arguments: ['f64', 'f64', 'f64', 'f64'], return: 'f64' },
    handle: { arguments: ['int32', 'f64', 'f64', 'f64'], return: 'f64' },
    ints: { arguments: ['int32', 'int32'], return: 'int32' }
};
const lib = ffi.dlopen(library, signatures).functions;
console.log(
    'f64',
    fastest(() => {
        for (let i = 0; i < N; i++) lib.one(i);
    })
);
console.log(
    'f64 x3',
    fastest(() => {
        for (let i = 0; i < N; i++) lib.three(i, 1, 2);
    })
);
console.log(
    'f64 x4',
    fastest(() => {
        for (let i = 0; i < N; i++) lib.four(i, 1, 2, 3);
    })
);
console.log(
    'int32 + f64 x3',
    fastest(() => {
        for (let i = 0; i < N; i++) lib.handle(1, i, 1, 2);
    })
);
console.log(
    'int32 x2',
    fastest(() => {
        for (let i = 0; i < N; i++) lib.ints(i, 1);
    })
);
