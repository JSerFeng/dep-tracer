#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dfs = exports.find = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const enhanced_resolve_1 = require("enhanced-resolve");
const MAX_SCAN_DEPTH = 5;
function findPackageJson(pkgName, p) {
    while (!fs_1.default.existsSync(`${p}/package.json`)) {
        p = path_1.default.dirname(p);
        if (!p) {
            return undefined;
        }
    }
    let pkg = require(`${p}/package.json`);
    if (pkg.name == pkgName) {
        return {
            ...pkg,
            context: p,
        };
    }
    else {
        return findPackageJson(pkgName, path_1.default.dirname(p));
    }
}
async function resolveWithCatch(resolver, context, request) {
    try {
        return await new Promise((resolve, reject) => {
            resolver.resolve({}, context, request, {}, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        });
    }
    catch (e) {
        return false;
    }
}
async function resolve(resolver, context, request) {
    let resolveResult;
    if ((resolveResult = await resolveWithCatch(resolver, context, `${request}/package.json`))) {
        /**
         * Directly resolve package.json if requested package has no `exports` field
         */
        const json = require(resolveResult);
        return { ...json, context: path_1.default.dirname(resolveResult) };
    }
    else if ((resolveResult = await resolveWithCatch(resolver, context, request))) {
        /**
         * Resolve that package entry, then iter its parent path until we find matched package.json
         */
        return findPackageJson(request, path_1.default.dirname(resolveResult));
    }
}
async function find(entry, tips) {
    let target = tips.pop();
    tips.reverse();
    let context = entry;
    let resolver = enhanced_resolve_1.ResolverFactory.createResolver({
        preferRelative: true,
        fileSystem: new enhanced_resolve_1.CachedInputFileSystem(fs_1.default, 4000),
        useSyncFileSystemCalls: false,
    });
    let pkg;
    if ((pkg = await resolve(resolver, context, "."))) {
        const memo = new Set();
        return (await dfs(resolver, pkg, target, tips, memo, 0))[0];
    }
    else {
        return [];
    }
}
exports.find = find;
async function dfs(resolver, pkgJson, target, tips, memo, depth) {
    if (memo.has(pkgJson.context) || depth > MAX_SCAN_DEPTH) {
        return [[], false];
    }
    memo.add(pkgJson.context);
    if (pkgJson.name == target) {
        return [[{ location: pkgJson.context, chain: [] }], true];
    }
    const currSearch = tips[tips.length - 1] || target;
    let deps;
    if ((deps = pkgJson.dependencies)) {
        if (currSearch in deps) {
            const pkg = await resolve(resolver, pkgJson.context, currSearch);
            if (!pkg) {
                return [[], true];
            }
            const results = await dfs(resolver, pkg, target, tips.slice(0, tips.length - 1), memo, 0);
            for (const result of results[0]) {
                result.chain.push(pkg.name);
            }
            return results;
        }
        else {
            let invalid = false;
            const res = [];
            for (const dep of Reflect.ownKeys(deps)) {
                const pkg = await resolve(resolver, pkgJson.context, dep);
                if (pkg) {
                    const [dfsResult, _invalid] = await dfs(resolver, pkg, target, tips, memo, depth + 1);
                    for (const result of dfsResult) {
                        result.chain.push(pkg.name);
                    }
                    res.push(...dfsResult);
                    invalid = _invalid;
                    if (invalid) {
                        break;
                    }
                }
            }
            return [res, invalid];
        }
    }
    return [[], false];
}
exports.dfs = dfs;
async function main() {
    const startTime = Date.now();
    const args = process.argv.slice(2);
    const result = await find(process.cwd(), args);
    if (!result.length) {
        console.log("Not Found");
    }
    else {
        console.log(`Found:\n${result.map((res) => `Locations: ${res.location}\nThrough: ${res.chain
            .reverse()
            .join(" -> ")}\n`)}`);
        console.log(`Cost: ${Date.now() - startTime}ms`);
    }
}
main();
