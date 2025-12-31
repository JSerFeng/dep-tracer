#!/usr/bin/env node
import fs from "fs";
import path from "path";
import {
  Resolver,
  ResolverFactory,
  CachedInputFileSystem,
} from "enhanced-resolve";

let MAX_SCAN_DEPTH = 5;

interface Result {
  location: string;
  chain: string[];
}
interface PackageJsonInner {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PackageJson extends PackageJsonInner {
  context: string;
}

function findPackageJson(pkgName: string, p: string): PackageJson | undefined {
  while (!fs.existsSync(`${p}/package.json`)) {
    p = path.dirname(p);
    if (!p) {
      return undefined;
    }
  }

  let pkg: PackageJsonInner = require(`${p}/package.json`);
  if (pkg.name == pkgName) {
    return {
      ...pkg,
      context: p,
    };
  } else {
    return findPackageJson(pkgName, path.dirname(p));
  }
}

async function resolveWithCatch(
  resolver: Resolver,
  context: string,
  request: string
): Promise<string | false> {
  try {
    return await new Promise((resolve, reject) => {
      resolver.resolve({}, context, request, {}, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res!);
        }
      });
    });
  } catch (e) {
    return false;
  }
}

async function resolve(
  resolver: Resolver,
  context: string,
  request: string
): Promise<PackageJson | undefined> {
  let resolveResult: string | false;

  if (
    (resolveResult = await resolveWithCatch(
      resolver,
      context,
      `${request}/package.json`
    ))
  ) {
    /**
     * Directly resolve package.json if requested package has no `exports` field
     */
    const json: PackageJsonInner = require(resolveResult);

    return { ...json, context: path.dirname(resolveResult) };
  } else if (
    (resolveResult = await resolveWithCatch(resolver, context, request))
  ) {
    /**
     * Resolve that package entry, then iter its parent path until we find matched package.json
     */
    return findPackageJson(request, path.dirname(resolveResult));
  }
}

export async function find(
  entry: string,
  tips: Array<string>
): Promise<Result[]> {
  let target = tips.pop()!;
  tips.reverse();

  let context = entry;
  let resolver = ResolverFactory.createResolver({
    preferRelative: true,
    fileSystem: new CachedInputFileSystem(fs, 4000),
    useSyncFileSystemCalls: false,
  });

  let pkg: PackageJson | undefined;
  if ((pkg = await resolve(resolver, context, "."))) {
    const memo = new Set<string>();
    return (await dfs(resolver, pkg, target, tips, memo, 0, true))[0];
  } else {
    return [];
  }
}

function inDependencies(query: string, deps: Record<string, string>): false | string {
  for (const dep of Reflect.ownKeys(deps)) {
    if (new RegExp(query).test(dep as string)) {
      return dep as string;
    }
  }

  return false;
}

export async function dfs(
  resolver: Resolver,
  pkgJson: PackageJson,
  target: string,
  tips: string[],
  memo: Set<string>,
  depth: number,
  isEntry: boolean // TODO api ugly
): Promise<[Result[], boolean]> {
  if (memo.has(pkgJson.context) || depth > MAX_SCAN_DEPTH) {
    return [[], false];
  }
  memo.add(pkgJson.context);

  if (!tips.length && pkgJson.name == target) {
    return [[{ location: pkgJson.context, chain: [] }], true];
  }

  const currSearch = tips[tips.length - 1] || target;

  let deps: Record<string, string> = {
    ...(pkgJson.dependencies || {}),
    ...(isEntry ? pkgJson.devDependencies || {} : {}),
  };

  let dep;
  if (dep = inDependencies(currSearch, deps)) {
    const pkg = await resolve(resolver, pkgJson.context, dep);

    if (!pkg) {
      return [[], true];
    }

    const results = await dfs(
      resolver,
      pkg,
      target,
      tips.slice(0, tips.length - 1),
      memo,
      0,
      false
    );

    for (const result of results[0]) {
      result.chain.push(pkg.name);
    }

    return results;
  } else {
    let invalid = false;
    const res: Result[] = [];

    const pkg = await resolve(resolver, pkgJson.context, currSearch);
    if (pkg) {
      const [dfsResult, _invalid] = await dfs(
        resolver,
        pkg,
        target,
        tips.slice(0, tips.length - 1),
        memo,
        0,
        false
      );

      for (const result of dfsResult) {
        result.chain.push(pkg.name);
      }

      res.push(...dfsResult);

      if (_invalid) {
        invalid = true;
      }
    }

    for (const dep of Reflect.ownKeys(deps) as string[]) {
      const pkg = await resolve(resolver, pkgJson.context, dep);
      if (pkg) {
        const [dfsResult, _invalid] = await dfs(
          resolver,
          pkg,
          target,
          tips,
          memo,
          depth + 1,
          false
        );

        for (const result of dfsResult) {
          result.chain.push(pkg.name);
        }

        res.push(...dfsResult);

        if (_invalid) {
          invalid = true;
          break;
        }
      }
    }

    return [res, invalid];
  }
}

const OPT_RE = /--(\w+)(?:\s*=\s*(\w*))?/;
function processArgs(args: string[]): [Record<string, any>, string[]] {
  const opt = {};

  return [
    opt,
    args.filter((arg) => {
      if (arg.startsWith("--")) {
        const matched = arg.match(OPT_RE);
        if (!matched || matched?.length < 2) {
          // Invalid arg
          console.warn(`Invalid arg ${arg}`);
          return false;
        }

        const key = matched[1];
        const value = matched[2];

        // @ts-ignore
        opt[key] = value;

        return false;
      } else {
        return true;
      }
    }),
  ];
}

async function main() {
  const startTime = Date.now();
  const [options, args] = processArgs(process.argv.slice(2));

  MAX_SCAN_DEPTH = options.depth ?? options.deep ?? MAX_SCAN_DEPTH;

  console.log("Start scanning ...");

  const result = await find(process.cwd(), args);

  if (!result.length) {
    console.log("Not Found");
  } else {
    console.log(
      `Found:\n${result.map(
        (res) =>
          `Locations: ${res.location}\nThrough: ${res.chain
            .reverse()
            .join(" > ")}\n`
      )}`
    );
    console.log(`Cost: ${Date.now() - startTime}ms`);
  }
}

main();
