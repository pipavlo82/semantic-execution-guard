import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonical, digest, loadVectors, recompute, schema } from '../recompute.mjs';
import { validate } from '../schema-validator.mjs';

const vectors = loadVectors(), control = () => structuredClone(vectors[0].input);
for (const { input, expected } of vectors) test(input.case_id, () => {
  assert.deepEqual(validate(input, schema), []);
  assert.deepEqual(recompute(input), expected);
  if (expected.relation_status === 'PASS') {
    assert.equal(expected.value, input.evidence.mantissa);
    assert.equal(expected.decimals, input.evidence.decimals);
  } else { assert.equal(expected.value, null); assert.equal(expected.decimals, null); }
});

test('numeric coincidence and unequal raw quotes both fail regardless of numeric scale', () => {
  const equal = structuredClone(vectors[1].input), unequal = vectors[2].input;
  assert.equal(equal.evidence.mantissa, vectors[0].input.evidence.mantissa);
  assert.notEqual(unequal.evidence.mantissa, equal.evidence.mantissa);
  equal.evidence.mantissa = '15431250000'; equal.evidence.decimals = 8;
  assert.equal(BigInt(equal.evidence.mantissa) * 10n ** 4n, BigInt(vectors[0].input.evidence.mantissa) * 10n ** 8n);
  for (const input of [equal, unequal]) assert.equal(recompute(input).reason_code, 'RAW_QUOTE_DOES_NOT_ESTABLISH_EXECUTABLE_PRICE');
});

test('direct consumption preserves exact value above IEEE-754 range and uint8 decimal endpoints', () => {
  for (const scale of [0, 255]) {
    const i = control(); i.evidence.mantissa = '9007199254740993'; i.evidence.decimals = scale; i.context.feed_decimals = scale;
    const result = recompute(i); assert.equal(result.relation_status, 'PASS');
    assert.equal(result.value, '9007199254740993'); assert.equal(result.decimals, scale);
  }
});

test('all non-direct transformations are rejected without multiplication', () => {
  for (const operation of ['MULTIPLY', 'APPLY_MULTIPLIER', 'DOUBLE_ADJUST', 'DIVIDE']) {
    const i = control(); i.consumption.operation = operation;
    const r = recompute(i); assert.equal(r.reason_code, 'DOUBLE_ADJUSTMENT'); assert.equal(r.value, null);
  }
});

test('unknown code/state/feed declarations remain cannot-establish instead of false or pass', () => {
  for (const change of [i => i.context.registered_feed = null, i => i.evidence.feed_address = null,
    i => i.context.feed_code_present = null, i => i.evidence.state_id = null, i => i.context.state_id = null]) {
    const i = control(); change(i); assert.equal(recompute(i).relation_status, 'CANNOT_ESTABLISH');
  }
});

test('fresh processes produce byte-identical full receipts', () => {
  const script = fileURLToPath(new URL('../recompute.mjs', import.meta.url));
  const a = execFileSync(process.execPath, [script]), b = execFileSync(process.execPath, [script]);
  assert.deepEqual(a, b); assert.deepEqual(JSON.parse(a), vectors.map(v => v.expected));
});

test('expected vector outcomes are not evaluator inputs and input objects are not mutated', () => {
  const v = structuredClone(vectors[0]), before = structuredClone(v.input);
  v.expected = { relation_status: 'FAIL', value: 'fake' };
  assert.deepEqual(recompute(v.input), vectors[0].expected); assert.deepEqual(v.input, before);
  const poisoned = { ...v.input, expected: { relation_status: 'PASS' } };
  assert.equal(recompute(poisoned).reason_code, 'INVALID_INPUT');
});

test('canonicalization is key-order invariant and binds every scalar input coordinate', () => {
  const i = control();
  assert.equal(digest(i), digest(Object.fromEntries(Object.entries(i).reverse())));
  assert.equal(canonical({ z: 1, a: [2, 1] }), '{"a":[2,1],"z":1}');
  const paths = [];
  const walk = (value, path = []) => {
    if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, [...path, k]);
    else paths.push(path);
  }; walk(i);
  for (const path of paths) {
    const changed = structuredClone(i); let at = changed;
    for (const part of path.slice(0, -1)) at = at[part];
    const key = path.at(-1), value = at[key];
    at[key] = typeof value === 'string' ? value + '-changed' : typeof value === 'boolean' ? !value : value === null ? 'changed' : value + 1;
    assert.notEqual(digest(i), digest(changed), path.join('.'));
  }
});

test('comparison reference is non-authorizing and unnecessary for a valid direct feed', () => {
  const i = control(); i.context.comparison_adjusted_price = null;
  assert.equal(recompute(i).relation_status, 'PASS');
  const raw = structuredClone(vectors[1].input); raw.context.comparison_adjusted_price = null;
  assert.equal(recompute(raw).relation_status, 'FAIL');
});

test('malformed numeric/schema fields cannot establish: no float, exponent, coercion or missing identity', () => {
  for (const change of [i => i.evidence.mantissa = 1.2, i => i.evidence.mantissa = '1e6',
    i => i.evidence.mantissa = '-0', i => i.evidence.mantissa = '01', i => i.evidence.decimals = 1.5,
    i => i.evidence.decimals = 256, i => i.evidence.round_id = '-1', i => i.evidence.updated_at = -1,
    i => i.context.execution_time = Number.MAX_SAFE_INTEGER + 1, i => { delete i.evidence.asset.chain_id; },
    i => i.evidence.extra = true, i => i.fixture_kind = 'LIVE_OBSERVATION']) {
    const i = control(); change(i); assert.equal(recompute(i).reason_code, 'INVALID_INPUT');
  }
});

test('EVM numeric bounds are explicit unsupported states, not floating-point truncation', () => {
  const i = control(); i.evidence.mantissa = String(1n << 255n);
  assert.equal(recompute(i).reason_code, 'UNSUPPORTED_NUMERIC_RANGE');
  i.evidence.mantissa = String((1n << 255n) - 1n); assert.equal(recompute(i).relation_status, 'PASS');
  i.evidence.round_id = String(1n << 80n); assert.equal(recompute(i).reason_code, 'UNSUPPORTED_NUMERIC_RANGE');
});

test('context relabeling cannot redefine the profile authority; zero token identity fails', () => {
  for (const change of [i => { i.evidence.source_surface = i.context.expected_source_surface = 'CALLER_PRICE'; },
    i => { i.evidence.authority_class = i.context.expected_authority_class = 'CALLER_AUTHORITY'; },
    i => { i.evidence.asset.contract_address = i.context.asset.contract_address = '0x' + '0'.repeat(40); }]) {
    const i = control(); change(i); assert.equal(recompute(i).relation_status, 'FAIL');
  }
});
