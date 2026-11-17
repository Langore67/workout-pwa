const assert = require("node:assert/strict");
const test = require("node:test");
const { renderBuildInfo } = require("./write-build-info.cjs");

const base = {
  version: "0.1.0",
  commit: "abc1234",
  branch: "feature/build-identity",
  builtAt: "2026-11-17T17:00:00.000Z",
};

test("renders a clean build identity", () => {
  const output = renderBuildInfo({ ...base, dirty: false });
  assert.match(output, /version: "v0\.1\.0"/);
  assert.match(output, /commit: "abc1234"/);
  assert.match(output, /displayCommit: "abc1234"/);
  assert.match(output, /branch: "feature\/build-identity"/);
  assert.match(output, /dirty: false/);
});

test("labels a dirty build without changing its commit", () => {
  const output = renderBuildInfo({ ...base, dirty: true });
  assert.match(output, /commit: "abc1234"/);
  assert.match(output, /displayCommit: "abc1234 \+ local changes"/);
  assert.match(output, /dirty: true/);
});

test("escapes values before writing TypeScript", () => {
  const output = renderBuildInfo({
    ...base,
    branch: 'feature/quote"test',
    dirty: false,
  });
  assert.match(output, /branch: "feature\/quote\\"test"/);
});
