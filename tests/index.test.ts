import { describe, it, expect, beforeAll, afterAll } from '@rstest/core';
import path from 'path';
import fs from 'fs';
import { find } from '../lib/index';

const fixturesDir = path.join(__dirname, 'fixtures/simple-chain');
const nodeModules = path.join(fixturesDir, 'node_modules');
const underscoreNodeModules = path.join(fixturesDir, '_node_modules');

const nestedFixturesDir = path.join(__dirname, 'fixtures/nested-chain');
const nestedNodeModules = path.join(nestedFixturesDir, 'node_modules');
const nestedUnderscoreNodeModules = path.join(nestedFixturesDir, '_node_modules');

const circularFixturesDir = path.join(__dirname, 'fixtures/circular-chain');
const circularNodeModules = path.join(circularFixturesDir, 'node_modules');
const circularUnderscore = path.join(circularFixturesDir, '_node_modules');

const devFixturesDir = path.join(__dirname, 'fixtures/dev-dep-chain');
const devNodeModules = path.join(devFixturesDir, 'node_modules');
const devUnderscore = path.join(devFixturesDir, '_node_modules');

describe('dep-trace', () => {
  beforeAll(() => {
    // Setup simple-chain
    if (fs.existsSync(underscoreNodeModules)) {
        if (fs.existsSync(nodeModules)) {
            fs.rmSync(nodeModules, { recursive: true, force: true });
        }
        fs.renameSync(underscoreNodeModules, nodeModules);
    }
    
    // Setup nested-chain
    if (fs.existsSync(nestedUnderscoreNodeModules)) {
        if (fs.existsSync(nestedNodeModules)) {
             fs.rmSync(nestedNodeModules, { recursive: true, force: true });
        }
        // Copy recursive
        fs.cpSync(nestedUnderscoreNodeModules, nestedNodeModules, { recursive: true });
        
        // Rename inner _node_modules to node_modules for true nesting
        const innerUnderscore = path.join(nestedNodeModules, 'pkg-a', '_node_modules');
        const innerNodeModules = path.join(nestedNodeModules, 'pkg-a', 'node_modules');
        if (fs.existsSync(innerUnderscore)) {
            fs.renameSync(innerUnderscore, innerNodeModules);
        }
    }

    // Setup circular-chain
    if (fs.existsSync(circularUnderscore)) {
        if (fs.existsSync(circularNodeModules)) {
            fs.rmSync(circularNodeModules, { recursive: true, force: true });
        }
        fs.renameSync(circularUnderscore, circularNodeModules);
    }

    // Setup dev-dep-chain
    if (fs.existsSync(devUnderscore)) {
        if (fs.existsSync(devNodeModules)) {
            fs.rmSync(devNodeModules, { recursive: true, force: true });
        }
        fs.renameSync(devUnderscore, devNodeModules);
    }
  });

  afterAll(() => {
    // Teardown simple-chain
    if (fs.existsSync(nodeModules)) {
        if (fs.existsSync(underscoreNodeModules)) {
             fs.rmSync(underscoreNodeModules, { recursive: true, force: true });
        }
        fs.renameSync(nodeModules, underscoreNodeModules);
    }
    // Teardown nested-chain
     if (fs.existsSync(nestedNodeModules)) {
         fs.rmSync(nestedNodeModules, { recursive: true, force: true });
     }
    // Teardown circular-chain
    if (fs.existsSync(circularNodeModules)) {
        if (fs.existsSync(circularUnderscore)) {
             fs.rmSync(circularUnderscore, { recursive: true, force: true });
        }
        fs.renameSync(circularNodeModules, circularUnderscore);
    }
    // Teardown dev-dep-chain
    if (fs.existsSync(devNodeModules)) {
        if (fs.existsSync(devUnderscore)) {
             fs.rmSync(devUnderscore, { recursive: true, force: true });
        }
        fs.renameSync(devNodeModules, devUnderscore);
    }
  });

  it('should find direct dependency', async () => {
    const result = await find(fixturesDir, ['pkg-a']);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].chain).toContain('pkg-a');
  });

  it('should find nested dependency', async () => {
    // using nestedFixturesDir where pkg-b is strictly inside pkg-a
    const result = await find(nestedFixturesDir, ['pkg-b']);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    
    // Should NOT find direct pkg-b (chain length 1) because it is nested
    // But let's check what we found

    const hasNestedChain = result.some(r => JSON.stringify(r.chain) === JSON.stringify(['pkg-b', 'pkg-a']));
    expect(hasNestedChain).toBe(true);
  });

  it('should find phantom dependency using fallback logic', async () => {
    const result = await find(fixturesDir, ['pkg-phantom']);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].chain).toEqual(['pkg-phantom']);
  });

  it('should handle circular dependencies without infinite loop', async () => {
    // pkg-a -> pkg-b -> pkg-a
    const result = await find(circularFixturesDir, ['pkg-b']);
    expect(result).toBeDefined();
    // Should find pkg-b from pkg-a
    // chain: pkg-b -> pkg-a
    const hasChain = result.some(r => r.chain.includes('pkg-b'));
    expect(hasChain).toBe(true);
  });

  it('should trace devDependencies at entry', async () => {
    const result = await find(devFixturesDir, ['pkg-a']);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].chain).toContain('pkg-a');
  });

  it('should handle missing dependency gracefully', async () => {
    const result = await find(fixturesDir, ['pkg-missing-completely']);
    expect(result).toBeDefined();
    expect(result.length).toBe(0);
  });
});
