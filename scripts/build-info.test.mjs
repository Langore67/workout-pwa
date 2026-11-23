import assert from 'node:assert/strict';
import test from 'node:test';
import { collectBuildInfo, formatBuildInfo } from './build-info.mjs';

const base = {
  version: '0.1.0',
  commit: 'abc1234',
  branch: 'feature/build-identity',
  builtAt: '2026-11-17T17:00:00.000Z',
};

test('formats a clean build identity', () => {
  assert.deepEqual(formatBuildInfo({ ...base, dirty: false }), {
    version: 'v0.1.0',
    commit: 'abc1234',
    displayCommit: 'abc1234',
    branch: 'feature/build-identity',
    builtAt: base.builtAt,
    dirty: false,
  });
});

test('labels local changes while preserving commit, branch, and timestamp', () => {
  assert.deepEqual(formatBuildInfo({ ...base, dirty: true }), {
    version: 'v0.1.0',
    commit: 'abc1234',
    displayCommit: 'abc1234 + local changes',
    branch: 'feature/build-identity',
    builtAt: base.builtAt,
    dirty: true,
  });
});

test('collects valid build metadata without writing generated source files', () => {
  const info = collectBuildInfo();
  assert.match(info.version, /^v\d+\.\d+\.\d+/);
  assert.match(info.commit, /^[0-9a-f]+$/i);
  assert.ok(info.branch.length > 0);
  assert.ok(Number.isFinite(Date.parse(info.builtAt)));
  assert.equal(typeof info.dirty, 'boolean');
});
