
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scan } from '../check.mjs';

const header = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Practice page</title></head><body>';

async function fixture(content, callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wqa-'));
  try {
    await writeFile(path.join(dir, 'index.html'), header + content + '</body></html>');
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('passes basic page and working anchor', async () => {
  await fixture('<a href="#contact">Contact</a><section id="contact">Hi</section>', async dir => {
    const result = await scan(dir);
    assert.equal(result.filesChecked, 1);
    assert.deepEqual(result.issues, []);
  });
});

test('reports broken local file and anchor', async () => {
  await fixture('<a href="missing.html">Bad</a><a href="#wrong">Bad anchor</a>', async dir => {
    const { issues } = await scan(dir);
    assert.ok(issues.some(x => x.type === 'missing-local-file'));
    assert.ok(issues.some(x => x.type === 'missing-anchor'));
  });
});

test('finds missing image alt text', async () => {
  await fixture('<img src="https://example.com/image.png">', async dir => {
    const { issues } = await scan(dir);
    assert.ok(issues.some(x => x.type === 'missing-alt'));
  });
});

test('flags attempts to link outside project', async () => {
  await fixture('<a href="../private.txt">Not allowed</a>', async dir => {
    const { issues } = await scan(dir);
    assert.ok(issues.some(x => x.type === 'outside-project'));
  });
});
