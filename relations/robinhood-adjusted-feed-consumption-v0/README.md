# Direct adjusted-feed consumption v0

Profile: `semantic-execution-guard.robinhood-adjusted-feed-consumption.v0`.

The companion profile makes the direct adjusted-feed semantic route independently
falsifiable over synthetic, exact, deterministic fixtures. It is an offline
relation/recompute component, not an execution guard or a live evidence adapter.

```text
OFFCHAIN_UNDERLYING_EQUITY_QUOTE
    DOES_NOT_ESTABLISH EXECUTABLE_TOKEN_PRICE
    even when its numeric value equals the adjusted feed value

ALREADY_ADJUSTED_ONCHAIN_PRICE
    + declared registered feed, asset, chain, token, state and freshness coordinates
    + DIRECT consumption
    CAN_ESTABLISH the local EXECUTABLE_TOKEN_PRICE claim
```

The direct route preserves `value = evidence.mantissa` and native
`decimals = evidence.decimals` exactly. No multiplier or other arithmetic
transformation is permitted. No amount or USD notional is calculated.

## Relationship to the frozen conversion route

The unchanged sibling `robinhood-stock-token-v0` at
`8c786d8134632cdb4892ed32051377e739495300` models:

```text
UNDERLYING_EQUITY_QUOTE + SHARES_PER_TOKEN_MULTIPLIER
    -> MULTIPLIER_ADJUSTED_TOKEN_PRICE through explicit exact conversion
```

This new profile models:

```text
already-adjusted registered on-chain feed
    -> executable token price through direct consumption
```

Neither supersedes the other. The old profile's
`ALREADY_ADJUSTED_ONCHAIN_PRICE -> DOUBLE_ADJUSTMENT` rule means already-adjusted
evidence cannot enter the RAW-CONVERSION route. It does **not** mean that a separate
direct-feed profile can never consume already-adjusted evidence. This profile does
not reinterpret that rule, reuse the old profile ID, or modify the old handoff.

## Input and trust model

`relation.schema.json` is a normalized fixture schema, not a Robinhood or Chainlink
wire schema. Every vector is `SYNTHETIC_RELATION_FIXTURE`. Asset names, addresses,
chain IDs 31337/31338, state labels, observations, rounds and times are invented.
Raw adversarial records intentionally retain plausible feed-related coordinates;
those are not assertions that a real off-chain API supplies Chainlink rounds.

The profile evaluates:

- Exact asset ID, chain ID and nonzero token contract identity in evidence/context.
- Nonzero registered feed equal to the evidence feed; no fallback feed.
- Declared `feed_code_present = true`. False rejects; unknown/null cannot establish.
  This field does not query bytecode or authenticate any contract.
- Exact non-null evidence/context state ID. This opaque synthetic snapshot label
  is not independently established latest state, an anchored block or a version proof.
- Input claim `ALREADY_ADJUSTED_ONCHAIN_PRICE` and requested claim
  `EXECUTABLE_TOKEN_PRICE`; raw or unrelated claims cannot be promoted.
- Fixed source `REGISTERED_ONCHAIN_ADJUSTED_FEED` and authority
  `DECLARED_REGISTERED_ADJUSTED_FEED` in both evidence and context. Relabeling both
  to some other role cannot redefine the profile's accepted authority.
- Declared USD denomination and native feed decimals matching the context.
- Positive int256 answer, uint80 round coordinates, `answered_in_round >= round_id`.
- The timestamp policy below and operation `DIRECT`.

`context.comparison_adjusted_price` is a nullable **non-authorizing** numeric
reference used to describe L2/L3 and the equality-collapse mutant. The production
evaluator never compares prices against it. A valid direct feed still passes when
it is null; a raw quote still fails. Only the deliberately faulty M2 source mutant
treats equality with this declared comparison value as authority. It is not a
runtime mutation switch, second trusted feed or live observation.

Prices are canonical signed decimal integer strings: no leading zeros, plus sign,
negative zero, exponent notation or fractional mantissa. Rounds are unsigned
decimal strings. The evaluator checks int256/uint80 bounds exactly using BigInt;
unsupported ranges return CANNOT_ESTABLISH. Decimals are uint8 integers (0..255).
Times and other numeric metadata are nonnegative safe JSON integers. No binary
floating-point price arithmetic occurs. Direct consumption requires no rounding
and does not normalize to 18 decimals or use ERC-20 amount decimals.

Missing feed binding, evidence feed, declared code availability or state identity
is CANNOT_ESTABLISH; an explicitly conflicting coordinate is FAIL. Structural
schema errors are CANNOT_ESTABLISH / INVALID_INPUT. Domain is parsed JSON values,
not cyclic JavaScript objects, functions, NaN, Infinity or BigInt objects.

## Deliberate timestamp and round policy

```text
updated_at > 0
updated_at <= execution_time
execution_time - updated_at <= max_staleness_seconds
```

Zero and future timestamps fail explicitly. The future check precedes subtraction;
age arithmetic uses BigInt. Exactly the freshness limit passes; one second beyond
fails. Zero staleness window permits only the same timestamp. These are this
profile's policies, not a universal assertion about all Chainlink implementations.

The round policy rejects `answered_in_round < round_id`. It does not independently
ban zero round IDs: L28 deliberately permits both IDs zero with otherwise valid
coordinates. `startedAt` is not modeled and no nonzero rule for it is invented.
Feed-specific assumptions require later authoritative documentation/live evidence.

Only DIRECT consumption is accepted. A request for MULTIPLY, APPLY_MULTIPLIER,
DOUBLE_ADJUST or another non-DIRECT transformation fails as DOUBLE_ADJUSTMENT.
This status rejects the attempted route; it does not claim a transformation ran.

## Receipts and canonicalization

Each vector stores an independently specified **full expected receipt** outside its
`input`. `recompute(input)` never reads expected outcomes. PASS exposes the exact
input mantissa/native decimals. FAIL and CANNOT_ESTABLISH expose null value/decimals
and distinct reason codes; they are not collapsed into a boolean. The receipt
retains source/type, asset/chain/token, feed/binding, state, round and time fields.

`input_digest` uses the frozen sibling's discipline: SHA-256 over UTF-8 JSON with
recursively sorted object keys, preserved array order and no whitespace, formatted
as `0x` plus 64 lowercase hexadecimal digits. Every input field, including the
non-authorizing comparison reference, is committed. Expected results are not.
This is the repository's JSON convention, not a new claim of universal JCS
interoperability. Do not substitute keccak256 or another canonicalization.

PASS means only that supplied profile coordinates establish this local semantic
relation. It does **not** independently prove:

- That a feed is Chainlink, really registered on Robinhood, correctly associated
  with the asset, USD-denominated or genuinely multiplier-adjusted.
- That a real Robinhood API response or Chainlink round was captured.
- Authentic state/version, RPC provenance, consensus/finality or current live state.
- Authorization, a mined transaction, guarded action execution or economic safety.

Matching caller-controlled facts can manufacture internally consistent input. A
digest does not make those facts authentic. Temporal consistency with a supplied
execution time is not an event-time enforcement guarantee. FAIL and
CANNOT_ESTABLISH must both block any future consumer that requires this claim;
PASS alone must never confer execution permission.

## Corpus and mutation falsifiability

30 vectors: **4 PASS / 22 FAIL / 4 CANNOT_ESTABLISH**. L1-L18 implement the requested
control, raw equality/inequality, feed/asset/chain binding, timestamp/round,
positivity, operation and authority/claim boundaries. L19-L30 cover distinct token
identity, zero/missing binding, false/unknown code, decimals, currency and state
coordinates, plus positive zero-round and zero-window policies and unrelated input
claim rejection. All four positive controls preserve exact native value/decimals.

| Mutation | Required killer | Rule changed |
| --- | --- | --- |
| M1_RAW_QUOTE_ACCEPTED_AS_EXECUTION_PRICE | L3 | Raw promotion regardless of value |
| M2_NUMERIC_EQUALITY_COLLAPSES_AUTHORITY | L2 | Equality with declared reference grants authority |
| M3_FEED_BINDING_IGNORED | L4 | Feed identity |
| M4A_ASSET_BINDING_IGNORED | L6 | Asset identity |
| M4B_CHAIN_BINDING_IGNORED | L7 | Chain identity |
| M4C_TOKEN_BINDING_IGNORED | L19 | Token identity |
| M5A_STALENESS_REMOVED | L16 | Maximum age |
| M5B_FUTURE_TIMESTAMP_ACCEPTED | L9 | Future-time exclusion |
| M5C_ZERO_TIMESTAMP_ACCEPTED | L10 | Zero-time exclusion |
| M6_INCOMPLETE_ROUND_ACCEPTED | L11 | Round completeness |
| M7_DOUBLE_ADJUSTMENT_ALLOWED | L14 | Forbidden operation accepted as direct consumption |
| M8_SOURCE_AUTHORITY_ROLE_IGNORED | L17 | Source/authority roles |
| M9_NONPOSITIVE_PRICE_ACCEPTED | L12 | Positive answer |
| M10_FEED_DECIMALS_IGNORED | L24 | Native decimal metadata |
| M11_STATE_IDENTITY_IGNORED | L26 | Snapshot identity |
| M12_FEED_CODE_ABSENCE_IGNORED | L22 | Explicit absence of code |

All 16 mutations patch exactly one source site in a unique temporary module.
M4 and M5 are split because their predicates are separate. L10 uses an age window
that includes timestamp zero so M5C cannot be masked by a separate stale check.
M2 must leave the unequal raw quote L3 rejected. Every required killer must become
PASS and every positive control must preserve its **entire expected receipt**,
including reason, coordinates and digest. Crashes, unchanged/unapplied patches,
wrong killers or broken positive controls fail the runner; they are never kills.
No production runtime mutation mode exists. Mutation receipts include source
digests and per-mutant observations. The suite itself tests these rejection rules.

## Read-only Fede reference; compatibility is not final

Inspected repository `babyblueviper1/semantic-execution-guard`, branch
`guard/robinhood-semantic-execution-guard-v0`, exact commit
`8dc4f920bfbebf3531d6ebdbfcc3f16c154b5d04`, parent
`8c786d8134632cdb4892ed32051377e739495300`.

That draft is an implementation reference, **not normative authority for this
profile**, not accepted for live deployment and not repaired by this work.
See its [contract](https://github.com/babyblueviper1/semantic-execution-guard/blob/8dc4f920bfbebf3531d6ebdbfcc3f16c154b5d04/contracts/SemanticExecutionGuard.sol)
and unchanged [handoff acceptance condition](https://github.com/babyblueviper1/semantic-execution-guard/blob/8dc4f920bfbebf3531d6ebdbfcc3f16c154b5d04/docs/fede-handoff.md#L34-L39).

| Relation/design requirement | Behavior at that exact guard SHA | Status |
| --- | --- | --- |
| Raw quote cannot establish executable price; no external execution-price argument | executeAtOraclePrice takes assetId/amount only and reads registered feed; owner configuration remains trust root | MATCH |
| Established nonzero contract feed binding | Mapping binds nonzero entries once, but zero/noncontract registrations are accepted; zero can be registered again | PENDING_HARDENING |
| Full asset/chain/token/state coordinates | Guard uses opaque bytes32 assetId; normalized tuple/state binding requires an agreed adapter/domain mapping | MISMATCH |
| Positive answer | Rejects answer <= 0 | MATCH |
| Complete round | Rejects answeredInRound < roundId; zero IDs not separately banned | MATCH |
| Freshness bound for positive nonfuture timestamp | Uses age > maxStalenessSeconds; exact boundary passes | MATCH |
| Explicit future timestamp rejection before subtraction | Subtraction panics with 0x11; no controlled future-time error | PENDING_HARDENING |
| Explicit zero timestamp rejection | No explicit check; zero can pass an age window covering zero | PENDING_HARDENING |
| No second multiplier | Consumes feed answer directly | MATCH |
| Native scale carried into price result | Getter/event return feed decimals; this profile additionally compares supplied context scale | MATCH |
| Explicit feed identity in receipt | Event omits feed address; successful nonzero mapping is reconstructable from guard identity/code and binding evidence; formats differ | MISMATCH |
| Defined amount/notional units | Guard returns amountTokens * answer without established token scale; this profile returns price only | OUT_OF_SCOPE |
| Protected action acceptance | Guard reads/calculates/emits; successful protected state transition remains pending | OUT_OF_SCOPE |

MATCH describes the narrow source behavior, not live correctness or full interface
compatibility. The offline evaluator accepts declared evidence mantissas; it is not
itself a Solidity no-price-argument admission API. A future trusted adapter or guard
must establish where the evidence came from.

The receipt mismatch does not automatically require duplicating a feed field in
Solidity: reconstructable immutable binding and self-contained receipt are distinct
design choices. Actual execution, amount units, replay requirements and trusted
source/state acquisition remain separate Fede/Tiago acceptance work. No Solidity
was copied and no guard repair or deployment is claimed.

## Official sources observed during this task

External-source confirmation: **CONFIRMED FOR DOCUMENTATION SEMANTICS ONLY**.
The web reader could not open these pages; direct HTTPS retrieval of the official
pages succeeded and their text was inspected. No REST price or JSON-RPC endpoint
was queried, and no live feed round was captured.

| Official URL | Access UTC | Classification | Proposition relied upon |
| --- | --- | --- | --- |
| https://docs.robinhood.com/chain/oracles-and-price-feeds/ | 2026-09-17T12:42:14.7764632Z | Normative documentation; numeric illustration is only an example | The Stock Token feed gives the per-token price including the share multiplier. Exact excerpt: "latestRoundData() returns this directly, so you don't apply the multiplier yourself." |
| https://docs.robinhood.com/chain/building-with-stock-tokens/ | 2026-09-17T12:42:14.9256781Z | Normative explanatory documentation; Solidity snippets are examples | Exact excerpt: "The Chainlink price already includes the corporate-action multiplier (dividends, splits)". Direct consumption should not multiply it again. |
| https://docs.robinhood.com/chain/stock-token-apis/ | 2026-09-17T12:49:49.7818867Z | Normative documentation | Exact excerpt: "The REST /prices endpoint returns the raw underlying-equity bid/ask (not multiplier-adjusted)." The source distinguishes this surface from adjusted on-chain prices. |

These observations do not identify any real feed address or prove deployed
behavior. Timestamp handling, normalized state labels, code-presence declarations,
fixture values and chosen freshness windows are this profile's synthetic policy.
The official oracle page also discusses oracle-paused state and sequencer uptime;
this narrow price-relation v0 does **not** model or establish those operational
conditions. They, feed heartbeat/finality, proxy authority, chain/token bindings and
event-time consumer checks require separate live integration review. A PASS must
not be presented as complete execution eligibility during a pause or outage.

## Provenance, reuse and running

This is NEW companion relation/recompute work on Pavlo's new branch from the pinned
relation base. Existing Semantic ABI/RSI concepts and methods are pre-existing
foundations as disclosed in the unchanged provenance documents. Canonicalization
and the small schema validator are reused from this repository at
`8c786d8134632cdb4892ed32051377e739495300`; the extra profile-local
`schema-validator.mjs` keeps the profile and temporary mutation modules
self-contained without editing the frozen sibling or installing dependencies.
It preserves the sibling validator verbatim after a provenance comment. Test and
mutation structure follows the same repository conventions; fixtures and direct
consumption predicates are new. No external foundation or Fede Solidity was copied.
No new license grant is selected or inferred.

From repository root (Node >=22):

```sh
node --test
node relations/robinhood-adjusted-feed-consumption-v0/recompute.mjs
node relations/robinhood-adjusted-feed-consumption-v0/mutations.mjs
forge fmt --check
forge build
forge test
git diff --check
```

The two profile CLIs emit deterministic JSON to stdout. An optional output pathname
writes that same JSON; verification outputs can remain outside the repository.
Tests spawn fresh processes and compare byte output. CI/tests never fetch official
documentation, REST, RPC, Chainlink or Blockscout.

This branch is based on Pavlo's relation SHA, not Fede's fork: it contains no
Solidity guard and has zero Solidity tests. A successful empty Foundry run is not
guard validation. No real Robinhood API response/round, testnet success, Fede repair,
Tiago deployment, Blockscout verification, protected action or production economic
correctness is established by this work. Local implementation is not publication,
merge, deployment or independent verification by another author.
