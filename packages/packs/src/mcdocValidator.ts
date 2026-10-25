import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as core from '@spyglassmc/core';
import { NodeJsExternals } from '@spyglassmc/core/lib/common/externals/NodeJsExternals.js';
import * as jeBinder from '@spyglassmc/java-edition/lib/binder/index.js';
import type { ReleaseVersion } from '@spyglassmc/java-edition/lib/dependency/common.js';
import * as jeJsonChecker from '@spyglassmc/java-edition/lib/json/checker/index.js';
import { registerMcdocAttributes as registerJsonAttributes } from '@spyglassmc/java-edition/lib/json/mcdocAttributes.js';
import { registerMcdocAttributes as registerVersionAttributes } from '@spyglassmc/java-edition/lib/mcdocAttributes.js';
import * as json from '@spyglassmc/json';
import * as mcdoc from '@spyglassmc/mcdoc';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type { DiagnosticSeverity } from './diagnostics';
import type { DefinitionValidator, ValidationFinding } from './validation';

/**
 * Schema validation for the Java half of the pack stack, against
 * `SpyglassMC/vanilla-mcdoc` through `@spyglassmc/mcdoc`.
 *
 * vanilla-mcdoc gates fields by release with `#[since=]` and `#[until=]`
 * attributes, so the release string decides what the checker accepts. Pass
 * the one the datapack targets: the 26.3 vanilla datapack reports 10
 * findings over its 8369 files at 26.3 and 3972 at 26.1, so a wrong release
 * is not a near miss, it is noise.
 *
 * This module is not re-exported from the package index. It is reachable as
 * `@jsprismarine/packs/mcdocValidator`, and the four `@spyglassmc` packages
 * it needs are optional peer dependencies, because they pull 91 transitive
 * packages that the eleven workspace packages importing the loader have no
 * use for.
 */

/** The Java release the loader targets, which is what data pack format 121.0 corresponds to. */
export const DATA_PACK_RELEASE = '26.3' satisfies ReleaseVersion;

/** Options for {@link createMcdocValidator}. */
export interface McdocValidatorOptions {
    /** A `vanilla-mcdoc` checkout; every `.mcdoc` file under it is read. */
    root: string;
    /** The Java release to gate `#[since]` and `#[until]` on. Defaults to {@link DATA_PACK_RELEASE}. */
    release?: ReleaseVersion;
    /**
     * The severity a schema violation reports at. `warning`, the default,
     * keeps a definition loading and out of a strict load's way; `error`
     * reports Spyglass's own errors as errors, which drops the definition.
     */
    severity?: DiagnosticSeverity;
    /**
     * How many findings one file reports before the rest are summarized.
     * Defaults to 10.
     */
    limit?: number;
}

/**
 * Spyglass severities: 1 is a hint, 2 a warning, 3 an error. A hint is
 * dropped, and "unknown key" arrives as a warning, which is what keeps an
 * unrecognized key loading rather than failing a strict load.
 *
 * Severity 3 reports as a warning unless the caller asks otherwise. An error
 * makes the loader drop the definition, and vanilla-mcdoc is a community
 * reconstruction that trails Mojang's releases: at 26.3 it rejects
 * `recipe/map_extending.json`, which vanilla ships with `"result": {}` where
 * the schema requires an `id`. Dropping a shipped vanilla recipe over a
 * schema's lag is worse than reporting it, so the schema is advisory by
 * default and `severity: 'error'` opts into the stricter reading.
 */
const severityOf = (severity: number, worst: DiagnosticSeverity): DiagnosticSeverity | undefined => {
    if (severity >= 3) return worst;
    return severity === 2 ? 'warning' : undefined;
};

/** Every `.mcdoc` file under a directory, in a stable order. */
const mcdocFilesUnder = async (root: string): Promise<string[]> => {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.mcdoc'))
        .map((entry) => join(entry.parentPath, entry.name))
        .sort();
};

/**
 * The JSON pointer of the deepest node covering an offset range, so a
 * finding names the field rather than a byte offset.
 */
const pointerAt = (node: core.AstNode, range: core.Range): string => {
    if (json.JsonObjectNode.is(node)) {
        for (const pair of node.children) {
            if (!pair.key || !core.Range.containsRange(pair.range, range, true)) continue;
            const key = pair.key.value;
            return pair.value ? `/${key}${pointerAt(pair.value, range)}` : `/${key}`;
        }
    }
    if (json.JsonArrayNode.is(node)) {
        for (const [index, item] of node.children.entries()) {
            if (!core.Range.containsRange(item.range, range, true)) continue;
            return item.value ? `/${index}${pointerAt(item.value, range)}` : `/${index}`;
        }
    }
    return '';
};

/**
 * Builds a validator that checks each Java definition against vanilla-mcdoc.
 *
 * Construction is asynchronous because binding the schema modules is: a
 * module's `use` of another resolves through `ensureBindingStarted`. The
 * validator it returns is synchronous, so {@link load} stays synchronous.
 * Reading and binding 246 schema files costs about three seconds, once.
 *
 * Checking needs no network and no registry contents. Structure, keys,
 * types, enums, unions, dispatch on `type` and the release gating all work
 * offline; what a local run cannot check is whether an `#[id=(registry=...)]`
 * reference names something that exists, which is the mapping layer's
 * question rather than this one's.
 *
 * @returns A validator reporting one finding per schema violation.
 */
export const createMcdocValidator = async (options: McdocValidatorOptions): Promise<DefinitionValidator> => {
    const release = options.release ?? DATA_PACK_RELEASE;
    const worst = options.severity ?? 'warning';
    const limit = options.limit ?? 10;

    const rootUri: core.RootUriString = `${pathToFileURL(options.root).toString()}/`;
    const cacheRoot: core.RootUriString = `${pathToFileURL(join(options.root, '.cache')).toString()}/`;
    const meta = new core.MetaRegistry();
    const project: core.ProjectData = {
        cacheRoot,
        config: core.VanillaConfig,
        externals: NodeJsExternals,
        fs: core.FileService.create(NodeJsExternals, cacheRoot),
        isDebugging: false,
        logger: core.Logger.noop(),
        meta,
        profilers: core.ProfilerFactory.noop(),
        projectRoots: [rootUri],
        roots: [rootUri],
        symbols: new core.SymbolUtil({}),
        // `loadedVersion` is what `dissectUri` reads to decide which registry
        // directories exist at this release.
        ctx: { loadedVersion: release },
        ensureBindingStarted: async () => {}
    };

    mcdoc.initialize(project);
    json.getInitializer()(project);
    // `since`, `until` and `deprecated`, closed over the release. The command
    // tree is only read by the mcfunction attributes, which no datapack JSON
    // file reaches, so an empty root stands in for it.
    registerVersionAttributes(meta, { type: 'root', children: {} }, release);
    // `criterion`, `translation_key` and `texture_slot`.
    registerJsonAttributes(meta);
    // Routes `json:file` to the Java-edition checker, which reads the mcdoc
    // type off the URI: `pack.mcmeta`, a tag, or a registry element.
    jeJsonChecker.register(meta);

    const files = await mcdocFilesUnder(options.root);
    if (files.length === 0) throw new Error(`no .mcdoc files under ${options.root}`);
    const uris = files.map((file) => pathToFileURL(file).toString());

    const uriContext = core.UriBinderContext.create(project);
    uriContext.symbols.contributeAs('uri_binder', () => {
        mcdoc.uriBinder(uris, uriContext);
    });

    for (const [index, file] of files.entries()) {
        const text = await readFile(file, 'utf8');
        const doc = TextDocument.create(uris[index]!, 'mcdoc', 0, text);
        const parser = meta.getParserForLanguageId('mcdoc');
        if (!parser) throw new Error('the mcdoc language is not registered');
        const node = core.file(parser)(new core.Source(text), core.ParserContext.create(project, { doc }));
        const binderContext = core.BinderContext.create(project, { doc });
        await binderContext.symbols.contributeAsAsync('binder', async () => {
            await meta.getBinder(node.type)(core.StateProxy.create(node), binderContext);
        });
    }

    return ({ path, data }): ValidationFinding[] => {
        // The checker picks the mcdoc type off the URI, so the pack-relative
        // path has to sit under a root. The data is reserialized rather than
        // reread: the validator is handed parsed JSON, and the findings name
        // fields, not offsets.
        const uri = new URL(path, rootUri).toString();
        const text = JSON.stringify(data, undefined, 1);
        const doc = TextDocument.create(uri, 'json', 0, text);

        const parserContext = core.ParserContext.create(project, { doc });
        const node = core.file(json.parser.file)(new core.Source(text), parserContext);
        core.AstNode.setParents(node);

        const root = node.children[0];
        if (!json.JsonFileNode.is(root)) return [];

        const checkerContext = core.CheckerContext.create(project, { doc });
        checkerContext.symbols.clear({ contributor: 'checker', uri });
        const check = meta.getChecker(root.type);
        checkerContext.symbols.contributeAs('checker', () => {
            // Declares the file's own symbol, which `#[criterion]` and the
            // other path-aware attributes attach to.
            jeBinder.uriBinder([uri], core.UriBinderContext.create(project));
            // The Java-edition JSON checker is synchronous; `Checker` is
            // typed for both kinds, which is what the discarded result is.
            void check(core.StateProxy.create(root), checkerContext);
        });

        const findings: ValidationFinding[] = [];
        let summarized = 0;
        for (const error of checkerContext.err.dump()) {
            const severity = severityOf(error.severity, worst);
            if (!severity) continue;
            if (findings.length >= limit) {
                summarized += 1;
                continue;
            }
            const pointer = pointerAt(root.children[0], error.range);
            findings.push({
                severity,
                code: 'definition.schema',
                message: `${pointer.length > 0 ? pointer : '/'} ${error.message}`
            });
        }
        if (summarized > 0) {
            findings.push({
                severity: 'warning',
                code: 'definition.schema',
                message: `and ${summarized} further violations of the vanilla-mcdoc schema`
            });
        }
        return findings;
    };
};
