import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validate } from './schema-validator.mjs';

export const PROFILE = 'semantic-execution-guard.robinhood-adjusted-feed-consumption.v0';
export const TYPES = Object.freeze({ RAW: 'OFFCHAIN_UNDERLYING_EQUITY_QUOTE', ADJUSTED: 'ALREADY_ADJUSTED_ONCHAIN_PRICE', EXECUTABLE: 'EXECUTABLE_TOKEN_PRICE' });
const SOURCE = 'REGISTERED_ONCHAIN_ADJUSTED_FEED', AUTHORITY = 'DECLARED_REGISTERED_ADJUSTED_FEED';
const ZERO = `0x${'0'.repeat(40)}`;
export const schema = JSON.parse(readFileSync(new URL('./relation.schema.json', import.meta.url)));
// Same canonicalization as the frozen sibling at 8c786d8134632cdb4892ed32051377e739495300.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => `0x${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
export const serialize = value => `${JSON.stringify(value, null, 2)}\n`;

// Domain: JSON values, as opposed to JS objects containing functions, BigInt or cycles.
export function recompute(input) {
  const e = input?.evidence, c = input?.context, operation = input?.consumption?.operation;
  const receipt = {
    relation_profile_id: input?.relation_profile_id ?? null, fixture_kind: input?.fixture_kind ?? null,
    case_id: input?.case_id ?? null,
    asset_id: e?.asset?.asset_id ?? null, chain_id: e?.asset?.chain_id ?? null,
    contract_address: e?.asset?.contract_address ?? null,
    input_claim_type: e?.claim_type ?? null, requested_claim_type: input?.requested_claim_type ?? null,
    source_surface: e?.source_surface ?? null, authority_class: e?.authority_class ?? null,
    feed_address: e?.feed_address ?? null, registered_feed: c?.registered_feed ?? null,
    feed_code_present: c?.feed_code_present ?? null,
    state_id: e?.state_id ?? null, expected_state_id: c?.state_id ?? null,
    currency: e?.currency ?? null, input_value: e?.mantissa ?? null, input_decimals: e?.decimals ?? null,
    round_id: e?.round_id ?? null, answered_in_round: e?.answered_in_round ?? null,
    updated_at: e?.updated_at ?? null, execution_time: c?.execution_time ?? null,
    max_staleness_seconds: c?.max_staleness_seconds ?? null,
    value: null, decimals: null, consumption_operation: operation ?? null,
    relation_status: 'CANNOT_ESTABLISH', reason_code: 'INVALID_INPUT', explicit_boundary_hit: false,
    input_digest: digest(input),
  };
  const finish = (relation_status, reason_code, explicit_boundary_hit = true) => ({ ...receipt, relation_status, reason_code, explicit_boundary_hit });
  const establish = () => ({ ...finish('PASS', 'DIRECT_ADJUSTED_FEED_ESTABLISHED', false), value: e.mantissa, decimals: e.decimals });
  if (validate(input, schema).length) return finish('CANNOT_ESTABLISH', 'INVALID_INPUT', false);
  const answer = BigInt(e.mantissa), round = BigInt(e.round_id), answered = BigInt(e.answered_in_round);
  if (answer < -(1n << 255n) || answer >= (1n << 255n) || round >= (1n << 80n) || answered >= (1n << 80n))
    return finish('CANNOT_ESTABLISH', 'UNSUPPORTED_NUMERIC_RANGE', false);
  if (input.requested_claim_type !== TYPES.EXECUTABLE) return finish('FAIL', 'REQUESTED_CLAIM_TYPE');
  if (e.claim_type === TYPES.RAW) return finish('FAIL', 'RAW_QUOTE_DOES_NOT_ESTABLISH_EXECUTABLE_PRICE'); // MUTATION:RAW
  if (e.claim_type !== TYPES.ADJUSTED) return finish('FAIL', 'INPUT_CLAIM_TYPE');
  if (e.source_surface !== SOURCE || e.authority_class !== AUTHORITY || c.expected_source_surface !== SOURCE || c.expected_authority_class !== AUTHORITY) return finish('FAIL', 'SOURCE_AUTHORITY_SUBSTITUTION'); // MUTATION:ROLE
  if (c.registered_feed === null) return finish('CANNOT_ESTABLISH', 'MISSING_REGISTERED_FEED');
  if (c.registered_feed === ZERO) return finish('FAIL', 'ZERO_REGISTERED_FEED');
  if (e.feed_address === null) return finish('CANNOT_ESTABLISH', 'MISSING_EVIDENCE_FEED');
  if (e.feed_address !== c.registered_feed) return finish('FAIL', 'FEED_BINDING_MISMATCH'); // MUTATION:FEED
  if (c.feed_code_present === null) return finish('CANNOT_ESTABLISH', 'FEED_CODE_UNESTABLISHED');
  if (!c.feed_code_present) return finish('FAIL', 'FEED_HAS_NO_CODE'); // MUTATION:CODE
  if (e.asset.asset_id !== c.asset.asset_id) return finish('FAIL', 'ASSET_IDENTITY_MISMATCH'); // MUTATION:ASSET
  if (e.asset.chain_id !== c.asset.chain_id) return finish('FAIL', 'CHAIN_IDENTITY_MISMATCH'); // MUTATION:CHAIN
  if (e.asset.contract_address !== c.asset.contract_address) return finish('FAIL', 'TOKEN_IDENTITY_MISMATCH'); // MUTATION:TOKEN
  if (e.asset.contract_address === ZERO || c.asset.contract_address === ZERO) return finish('FAIL', 'ZERO_TOKEN_CONTRACT');
  if (e.currency !== 'USD' || c.currency !== 'USD') return finish('FAIL', 'CURRENCY_MISMATCH');
  if (e.state_id === null || c.state_id === null) return finish('CANNOT_ESTABLISH', 'STATE_IDENTITY_UNESTABLISHED');
  if (e.state_id !== c.state_id) return finish('FAIL', 'STATE_IDENTITY_MISMATCH'); // MUTATION:STATE
  if (e.decimals !== c.feed_decimals) return finish('FAIL', 'FEED_DECIMALS_MISMATCH'); // MUTATION:DECIMALS
  if (answer <= 0n) return finish('FAIL', 'NONPOSITIVE_PRICE'); // MUTATION:POSITIVE
  if (answered < round) return finish('FAIL', 'INCOMPLETE_ROUND'); // MUTATION:ROUND
  if (e.updated_at === 0) return finish('FAIL', 'ZERO_TIMESTAMP'); // MUTATION:ZERO_TIME
  if (e.updated_at > c.execution_time) return finish('FAIL', 'FUTURE_TIMESTAMP'); // MUTATION:FUTURE
  if (BigInt(c.execution_time) - BigInt(e.updated_at) > BigInt(c.max_staleness_seconds)) return finish('FAIL', 'STALE_FEED'); // MUTATION:STALE
  if (operation !== 'DIRECT') return finish('FAIL', 'DOUBLE_ADJUSTMENT'); // MUTATION:DIRECT
  return establish();
}

export const loadVectors = () => JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url)));
export const runVectors = () => loadVectors().map(({ input }) => recompute(input));
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = serialize(runVectors());
  if (process.argv[2]) writeFileSync(process.argv[2], output); else process.stdout.write(output);
}
