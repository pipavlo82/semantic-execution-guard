import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateMutation, mutations, runMutations } from '../mutations.mjs';

test('sixteen one-site mutations killed by named vectors, all four full positive receipts preserved', async () => {
  const report = await runMutations();
  assert.equal(report.mutation_count, 16); assert.equal(report.killed, 16); assert.equal(report.survived, 0);
  assert.equal(report.positive_controls, 4);
  for (const row of report.records) {
    assert.equal(row.status, 'KILLED'); assert.equal(row.patch_occurrences, 1);
    assert.ok(row.killer_vectors.includes(row.required_killer));
    assert.equal(row.positive_controls_preserved, 4);
    assert.equal(row.positive_control_comparison, 'FULL_EXPECTED_RECEIPT');
  }
});

test('mutation CLI reruns byte-identically in fresh processes', () => {
  const script = fileURLToPath(new URL('../mutations.mjs', import.meta.url));
  assert.deepEqual(execFileSync(process.execPath, [script]), execFileSync(process.execPath, [script]));
});

test('unapplied, crashing, unchanged and positive-control-breaking patches are never kills', async () => {
  const m = mutations[0];
  await assert.rejects(evaluateMutation({ ...m, before: '// NOT PRESENT' }), /exactly once/);
  await assert.rejects(evaluateMutation({ ...m, after: m.before }), /not a mutation/);
  await assert.rejects(evaluateMutation({ ...m, after: "  throw new Error('deliberate audit crash');" }), /deliberate audit crash/);
  await assert.rejects(evaluateMutation({ ...m, after: "  return finish('FAIL', 'BROKEN_CONTROL');" }), /broken positive control/);
});
