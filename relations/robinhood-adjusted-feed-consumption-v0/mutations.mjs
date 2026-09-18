import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadVectors, recompute, serialize, PROFILE } from './recompute.mjs';

const sourceURL = new URL('./recompute.mjs', import.meta.url);
const source = readFileSync(sourceURL, 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const rule = marker => {
  const lines = source.split('\n').filter(line => line.endsWith(`// MUTATION:${marker}`));
  assert.equal(lines.length, 1, `${marker}: must identify exactly one rule`);
  return lines[0];
};
const remove = (mutation_id, marker, required_killer, changed_rule) => ({ mutation_id, before: rule(marker), after: `  // MUTANT: ${changed_rule}`, required_killer, changed_rule });
export const mutations = [
  { mutation_id: 'M1_RAW_QUOTE_ACCEPTED_AS_EXECUTION_PRICE', before: rule('RAW'),
    after: "  if (e.claim_type === TYPES.RAW) return establish();",
    required_killer: 'L3_RAW_QUOTE_DIFFERENT_VALUE', changed_rule: 'Raw claim exclusion replaced with direct promotion regardless of value' },
  { mutation_id: 'M2_NUMERIC_EQUALITY_COLLAPSES_AUTHORITY', before: rule('RAW'),
    after: "  if (e.claim_type === TYPES.RAW) { const ref = c.comparison_adjusted_price; if (ref && BigInt(e.mantissa) * 10n ** BigInt(ref.decimals) === BigInt(ref.mantissa) * 10n ** BigInt(e.decimals)) return establish(); return finish('FAIL', 'RAW_QUOTE_DOES_NOT_ESTABLISH_EXECUTABLE_PRICE'); }",
    required_killer: 'L2_RAW_QUOTE_NUMERIC_COINCIDENCE', changed_rule: 'Exact numeric equality with a non-authorizing comparison reference incorrectly grants semantic authority' },
  remove('M3_FEED_BINDING_IGNORED', 'FEED', 'L4_WRONG_FEED_FOR_ASSET', 'Registered/evidence feed equality removed'),
  remove('M4A_ASSET_BINDING_IGNORED', 'ASSET', 'L6_WRONG_ASSET_BINDING', 'Asset ID equality removed'),
  remove('M4B_CHAIN_BINDING_IGNORED', 'CHAIN', 'L7_WRONG_CHAIN', 'Chain ID equality removed'),
  remove('M4C_TOKEN_BINDING_IGNORED', 'TOKEN', 'L19_WRONG_TOKEN_CONTRACT', 'Token contract equality removed'),
  remove('M5A_STALENESS_REMOVED', 'STALE', 'L16_FRESHNESS_BOUNDARY_ONE_PAST', 'Maximum-age check removed'),
  remove('M5B_FUTURE_TIMESTAMP_ACCEPTED', 'FUTURE', 'L9_FUTURE_TIMESTAMP', 'Future-time exclusion removed'),
  remove('M5C_ZERO_TIMESTAMP_ACCEPTED', 'ZERO_TIME', 'L10_ZERO_TIMESTAMP', 'Zero-time exclusion removed independently of maximum age'),
  remove('M6_INCOMPLETE_ROUND_ACCEPTED', 'ROUND', 'L11_INCOMPLETE_ROUND', 'answeredInRound >= roundId check removed'),
  remove('M7_DOUBLE_ADJUSTMENT_ALLOWED', 'DIRECT', 'L14_DOUBLE_ADJUSTMENT', 'Non-DIRECT transformation incorrectly authorized as direct consumption'),
  remove('M8_SOURCE_AUTHORITY_ROLE_IGNORED', 'ROLE', 'L17_SOURCE_AUTHORITY_SUBSTITUTION', 'Pinned declared source/authority roles ignored'),
  remove('M9_NONPOSITIVE_PRICE_ACCEPTED', 'POSITIVE', 'L12_NONPOSITIVE_PRICE_ZERO', 'Answer positivity check removed'),
  remove('M10_FEED_DECIMALS_IGNORED', 'DECIMALS', 'L24_FEED_DECIMALS_MISMATCH', 'Declared native feed scale mismatch ignored'),
  remove('M11_STATE_IDENTITY_IGNORED', 'STATE', 'L26_STATE_IDENTITY_MISMATCH', 'Declared state identity mismatch ignored'),
  remove('M12_FEED_CODE_ABSENCE_IGNORED', 'CODE', 'L22_FEED_HAS_NO_CODE', 'Declared absence of feed code ignored'),
];

export async function evaluateMutation(mutation, vectors = loadVectors()) {
  for (const { input, expected } of vectors) assert.deepEqual(recompute(input), expected, `${input.case_id}: invalid baseline`);
  const occurrences = source.split(mutation.before).length - 1;
  assert.equal(occurrences, 1, `${mutation.mutation_id}: patch must apply exactly once`);
  const changed = source.replace(mutation.before, mutation.after);
  assert.notEqual(changed, source, 'Unchanged source is not a mutation');
  const directory = mkdtempSync(join(tmpdir(), 'adjusted-feed-mutation-'));
  const files = ['recompute.mjs', 'relation.schema.json', 'schema-validator.mjs'];
  try {
    writeFileSync(join(directory, files[0]), changed);
    for (const file of files.slice(1)) copyFileSync(new URL(file, sourceURL), join(directory, file));
    const mutant = await import(pathToFileURL(join(directory, files[0])).href);
    // A crash throws out of the runner; it can never produce a KILLED record.
    const results = vectors.map(({ input, expected }) => ({ case_id: input.case_id, expected, observed: mutant.recompute(input) }));
    const controls = results.filter(row => row.expected.relation_status === 'PASS');
    for (const row of controls) assert.deepEqual(row.observed, row.expected, `${mutation.mutation_id}: broken positive control ${row.case_id}`);
    const killers = results.filter(row => row.expected.relation_status !== 'PASS' && row.observed.relation_status === 'PASS');
    assert.ok(killers.some(row => row.case_id === mutation.required_killer), `${mutation.mutation_id}: required killer missing`);
    if (mutation.mutation_id === 'M2_NUMERIC_EQUALITY_COLLAPSES_AUTHORITY') {
      assert.equal(results.find(row => row.case_id === 'L3_RAW_QUOTE_DIFFERENT_VALUE').observed.relation_status, 'FAIL', 'Equality-only mutant must not admit unequal raw quote');
    }
    return { mutation_id: mutation.mutation_id, changed_rule: mutation.changed_rule,
      required_killer: mutation.required_killer, killer_vectors: killers.map(row => row.case_id),
      observed_result: killers.map(row => ({ case_id: row.case_id, baseline_status: row.expected.relation_status,
        mutant_status: row.observed.relation_status, mutant_reason_code: row.observed.reason_code,
        value: row.observed.value, decimals: row.observed.decimals })),
      status: 'KILLED', patch_occurrences: occurrences, mutant_source_sha256: sha(changed),
      positive_controls_preserved: controls.length, positive_control_ids: controls.map(row => row.case_id),
      positive_control_comparison: 'FULL_EXPECTED_RECEIPT' };
  } finally {
    // Exact files only in our unique temporary directory; no recursive deletion.
    for (const file of files) { try { unlinkSync(join(directory, file)); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    rmdirSync(directory);
  }
}

export async function runMutations() {
  const vectors = loadVectors(), records = [];
  for (const mutation of mutations) records.push(await evaluateMutation(mutation, vectors));
  return { relation_profile_id: PROFILE, fixture_kind: 'SYNTHETIC_RELATION_FIXTURE',
    source_digests: Object.fromEntries(['recompute.mjs', 'schema-validator.mjs', 'relation.schema.json', 'vectors.json', 'mutations.mjs']
      .map(file => [file, sha(readFileSync(new URL(file, sourceURL)))])),
    baseline_vectors: vectors.length, mutation_count: mutations.length, killed: records.length, survived: 0,
    positive_controls: vectors.filter(v => v.expected.relation_status === 'PASS').length, records };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = serialize(await runMutations());
  if (process.argv[2]) writeFileSync(process.argv[2], output); else process.stdout.write(output);
}
