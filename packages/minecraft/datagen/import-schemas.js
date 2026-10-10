/**
 * Turns the enum schemas of a Mojang protocol release into `snapshot/enums.json`.
 *
 * Run with `pnpm generate:import`. Nothing here decides anything: which release, which
 * asset, and which enums are wanted all live in `manifest.json`, under `schemas`.
 *
 * Mojang stopped publishing `enums.html` after 1.26.40. What a release ships now is
 * `metadata.zip`, one JSON schema per type, attached to a GitHub release - and a schema
 * lists an enum's members without their values: `GameType` is `Undefined, Survival, ...`
 * and nothing says that `Undefined` is -1. The values arrived one release later as
 * `x-enum-binary-value`, on the preview builds first. So a release's enums are read from
 * two assets: the release itself for *which members, in which order*, and the newest
 * preview that carries values for *what number each is*. A member the release has and the
 * preview does not is a member with no value, and that is an error here rather than a
 * guess - the preview will have to be moved forward, or the value found elsewhere.
 *
 * The result is small and committed, because the assets are Mojang's to keep or delete:
 * the branches that carried `enums.html` were deleted within a month of this project
 * pinning one. The zip files are fetched into `snapshot/` and checked against the hashes
 * in the manifest, and are not committed.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const MANIFEST = path.join(HERE, 'manifest.json');
const SNAPSHOT = path.join(HERE, 'snapshot');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/**
 * The asset, from the local copy if it is the one the manifest pins.
 *
 * Fetched at most once and kept beside the snapshot. The hash is the contract: a file that
 * does not match it is not this release, whatever its name says.
 */
const readAsset = async ({ repo, release, asset, sha256 }) => {
    const cache = path.join(SNAPSHOT, `${release}-${asset}`);

    if (fs.existsSync(cache)) {
        const cached = fs.readFileSync(cache);
        if (digest(cached) === sha256) return cached;

        throw new Error(`${cache} does not match the hash in the manifest. Delete it to fetch again.`);
    }

    const url = `https://github.com/${repo}/releases/download/${release}/${asset}`;
    console.log(`Fetching ${url}`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);

    const body = Buffer.from(await response.arrayBuffer());
    const got = digest(body);
    if (got !== sha256) {
        throw new Error(`Fetched ${asset} hashes to ${got}, the manifest says ${sha256}.`);
    }

    fs.mkdirSync(SNAPSHOT, { recursive: true });
    fs.writeFileSync(cache, body);
    return body;
};

/**
 * The files of a zip archive, by name.
 *
 * Read from the central directory at the end of the file, which is the only place a zip's
 * table of contents is guaranteed to be complete. Mojang's assets are stored deflated or
 * not at all, and those two are the only methods this reads; anything else is an error
 * rather than a silently missing file.
 */
const unzip = (buffer) => {
    const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
    const CENTRAL_FILE_HEADER = 0x02014b50;
    const LOCAL_FILE_HEADER = 0x04034b50;

    let end = buffer.length - 22;
    while (end >= 0 && buffer.readUInt32LE(end) !== END_OF_CENTRAL_DIRECTORY) end--;
    if (end < 0) throw new Error('Not a zip file: no end of central directory record');

    const entries = buffer.readUInt16LE(end + 10);
    let offset = buffer.readUInt32LE(end + 16);

    const files = new Map();
    for (let i = 0; i < entries; i++) {
        if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_HEADER)
            throw new Error('Corrupt zip: bad central file header');

        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

        if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER)
            throw new Error(`Corrupt zip: bad local header for ${name}`);
        const dataStart =
            localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
        const data = buffer.subarray(dataStart, dataStart + compressedSize);

        if (method === 0) files.set(name, data);
        else if (method === 8) files.set(name, zlib.inflateRawSync(data));
        else throw new Error(`${name} uses zip compression method ${method}, which this does not read`);

        offset += 46 + nameLength + extraLength + commentLength;
    }

    return files;
};

/** An enum schema's members, or null when the archive has no schema of that name. */
const membersOf = (files, name) => {
    const file = files.get(`${name}.json`);
    if (!file) return null;

    const schema = JSON.parse(file.toString('utf8'));
    if (!Array.isArray(schema.enum)) throw new Error(`${name}.json is not an enum schema`);

    return {
        names: schema.enum,
        values: schema['x-enum-binary-value'] ?? null,
        underlying: schema['x-underlying-type']
    };
};

/** The enums the manifest declares public, minus its comment keys. */
const publicEnums = () => Object.entries(manifest.enums).filter(([name]) => !name.startsWith('$'));

const main = async () => {
    const { schemas } = manifest;
    const release = unzip(await readAsset(schemas));
    const valued = unzip(await readAsset(schemas.values));

    const enums = {};
    const missing = [];

    for (const [, mojangName] of publicEnums()) {
        const schemaName = schemas.schemaNames?.[mojangName] ?? mojangName.replaceAll('::', '__');
        const members = membersOf(release, schemaName);
        if (members === null) {
            missing.push(mojangName);
            continue;
        }

        const source = membersOf(valued, schemaName);
        if (source === null || source.values === null) {
            throw new Error(
                `${schemaName}: the release lists it but ${schemas.values.release} carries no values for it`
            );
        }

        const valueOf = new Map(source.names.map((name, index) => [name, source.values[index]]));
        const unvalued = members.names.filter((name) => !valueOf.has(name));
        if (unvalued.length > 0) {
            throw new Error(
                `${schemaName}: ${schemas.values.release} has no value for ${unvalued.join(', ')}. ` +
                    `Move the values release forward, or the member has been removed since.`
            );
        }

        enums[mojangName] = {
            underlying: members.underlying,
            members: members.names.map((name) => ({ name, value: valueOf.get(name) }))
        };
    }

    const output = {
        $comment: [
            'Generated by packages/minecraft/datagen/import-schemas.js - do not edit. Change the',
            'manifest and run `pnpm generate:import`.',
            '',
            'The enums of one protocol release, as its JSON schemas list them, with the value of',
            'each member taken from the first later release whose schemas carry values. Enums',
            'the manifest names that this release has no schema for are listed in `absent`;',
            'the generator falls back to the older HTML dump for those.'
        ],
        minecraftVersion: schemas.minecraftVersion,
        networkProtocolVersion: schemas.networkProtocolVersion,
        source: {
            repo: schemas.repo,
            release: schemas.release,
            sha256: schemas.sha256,
            values: { release: schemas.values.release, sha256: schemas.values.sha256 }
        },
        absent: missing,
        enums
    };

    const target = path.join(SNAPSHOT, 'enums.json');
    fs.writeFileSync(target, `${JSON.stringify(output, null, 1)}\n`);

    console.log(`Wrote ${path.relative(process.cwd(), target)}`);
    console.log(
        `  ${Object.keys(enums).length} enum(s) from ${schemas.release}, ${missing.length} absent: ${missing.join(', ')}`
    );
};

await main();
