import { resolvePackStack } from '../src/content/packStack';

const { stack, diagnostics } = resolvePackStack({ vanilla: false, javaVanilla: false });
if (diagnostics.length > 0) {
    throw new Error(
        `Benchmark did not resolve both workspace overlays: ${diagnostics.map(({ message }) => message).join('; ')}`
    );
}

process.stdout.write(`${JSON.stringify(stack.map(({ path }) => path))}\n`);
