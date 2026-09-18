# Price-carrying protected state transition v0

This v0 is a protected-state transition prototype, **NOT a token trade or settlement
engine**. It demonstrates that the price established by the configured guard is the
exact price consumed and persisted by a downstream action in the same transaction.
Local synthetic tests establish this behavior; no deployment or live-feed evidence
is introduced here.

## Composition and provenance

```text
SemanticExecutionGuard
    -> ProtectedPriceConsumer
    -> ProtectedPriceActionTarget

price evidence -> same-transaction protected effect
```

Execution starts at `consumer.execute(actionId, assetId)`. The consumer calls the
guard and forwards its return tuple into the target; the diagram shows the flow of
price evidence, not an externally initiated call from the guard.

Frozen guard base: `babyblueviper1/semantic-execution-guard` at
`686d9247451d68c6910c2e6bae79664cb763b33f` (parent
`8dc4f920bfbebf3531d6ebdbfcc3f16c154b5d04`). Every existing base file, including
the guard, its tests/mock, documentation and dependency pins, is preserved.
The new local branch starts directly at that exact guard commit; no guard repair
or modification is part of this milestone.

Read-only semantic companion: [Pavlo PR #3](https://github.com/pipavlo82/semantic-execution-guard/pull/3),
exact head `16cd529c315f37c46678575c2dfe340287400692`, profile
`semantic-execution-guard.robinhood-adjusted-feed-consumption.v0` in
`relations/robinhood-adjusted-feed-consumption-v0/`. That branch/profile is neither
merged nor copied here. Its declared-coordinate evaluator and this runtime
composition have different interfaces; full normalized chain/token/state/scale
mapping remains integration work.

The older `robinhood-stock-token-v0` profile is unchanged: it performs explicit
raw underlying quote + shares/token multiplier conversion. This consumer follows
the separate direct already-adjusted-feed route. It does not execute the old
conversion relation and never applies another multiplier.

New files are limited to the two contracts, `test/ProtectedPriceConsumer.t.sol`,
and this document. New Solidity uses `UNLICENSED` to avoid inventing a team license
grant; existing source licenses are untouched. No new dependency is introduced.

## Immutable construction and callable surface

`ProtectedPriceConsumer(address guard_, bytes32 boundAssetId_)` rejects a zero
guard (`ZeroGuardAddress`) and an address without code (`GuardNotAContract`). It
stores immutable `guard` and `boundAssetId`, then deploys its own target and stores
immutable `target`. No setter, arbitrary target argument, upgrade path, signature,
nonce or replay registry is provided.

`ProtectedPriceActionTarget(bytes32 boundAssetId_)` binds its deployer as immutable
`authorizedConsumer` and stores immutable `boundAssetId`. In this composition the
deployer is the consumer constructor, so no mutable registration or circular setup
is required. A separately deployed target is a different instance and does not
mutate this consumer's target.

Consumer execution API:

```solidity
execute(bytes32 actionId, bytes32 assetId) external
```

It accepts no price, quote, multiplier, feed answer, cached receipt or alternate
target. Execution is permissionless: `actionId` labels an execution and receipt,
not a permit, signature, nonce or caller authorization. Repeating the same ID is
allowed, increments the count again, and requires another current guard call.

Target mutation API:

```solidity
applyPrice(bytes32 actionId, bytes32 assetId, int256 consumedPrice,
           uint8 feedDecimals, uint80 roundId, uint256 updatedAt) external
```

This internal composition boundary necessarily carries a price. An arbitrary
caller cannot supply that price: the target first requires its immutable consumer
(`NotAuthorizedConsumer(caller)`), then requires its bound asset
(`AssetBindingMismatch(expectedAssetId, suppliedAssetId)`). There is no other
protected-state mutation function. The target has no external calls.

## Exact carry and atomic failure

Every execution calls the frozen guard's
`establishExecutablePrice(assetId)` inside the same transaction and receives:

```text
int256 adjustedPrice, uint8 feedDecimals, uint80 roundId, uint256 updatedAt
```

The consumer passes those four returned values unchanged to the target. It neither
normalizes decimals, multiplies/divides price, calculates notional, nor replaces the
tuple with a second oracle read. Its successful receipt is emitted only after the
target returns successfully.

The target increments `uint256 executionCount` once and writes:

| Field | Type | Value |
| --- | --- | --- |
| lastActionId | bytes32 | Supplied receipt identity |
| lastAssetId | bytes32 | Validated bound asset |
| lastConsumedPrice | int256 | Exact guard-returned answer |
| lastFeedDecimals | uint8 | Exact guard-returned native scale |
| lastRoundId | uint80 | Exact guard-returned round |
| lastUpdatedAt | uint256 | Exact guard-returned observation time |

**ANY guard or downstream binding revert -> ZERO protected target state effect.**
All seven mutable fields retain their pre-call bytes, including when they already
contain a previous successful execution. Reverts propagate without being caught.
The EVM rolls back this call's logs as well as its state: a guard establishment log
earlier in a failed consumer call is not a successful transaction receipt. A debug
trace/cheatcode may expose attempted logs; that is not evidence of committed logs.
Earlier successful transactions remain unaffected.

In particular, a valid registered asset B can pass the guard, then fail the target
bound to A. The target's check deliberately occurs downstream, demonstrating:

```text
valid current price for B != authority to mutate action bound to A
```

No previous off-chain PASS or emitted price receipt authorizes a new execution.
The pinned guard checks positivity, round completeness and time at the point of
this call. With that guard's static feed reads and the target's absence of external
calls, no separate transaction can interleave between validation and this effect.
This does not freeze a feed or authorize any later transaction.

## Events and what they prove

Successful execution emits, in order:

1. Guard `ExecutablePriceEstablished(assetId, adjustedPrice, feedDecimals,
   roundId, updatedAt)`.
2. Target `ProtectedPriceApplied(actionId, assetId, consumedPrice, feedDecimals,
   roundId, updatedAt)`.
3. Consumer `ProtectedActionExecuted(actionId, assetId, guard, target,
   consumedPrice, feedDecimals, roundId, updatedAt)`.

The target/consumer events index `actionId` and `assetId`; the log emitter
identifies the contract. Consumer receipt data explicitly includes guard and target.
Tests compare the exact ABI-encoded tuple across all three events and the persisted
target state. The frozen guard emits the same tuple that it returns. Example local
control: price `35000000000`, decimals `8`, round `1`, updatedAt `999990`, one state
transition. These numbers are synthetic; no live denomination is inferred.

For correctly identified deployed code and its configured trust root, a successful
transaction would establish this consumer's call to this immutable guard, the
same-transaction returned tuple, its exact delivery to this immutable target, and
the target's specific state effect. This task demonstrates that sequence in local
tests only; it does not claim a mined Robinhood transaction.

It does **not** independently establish Chainlink identity, Robinhood approval,
USD denomination, real Stock Token authenticity, economic correctness, token
settlement, trade execution or authenticity beyond the configured guard/feed trust
root. A code-presence check does not authenticate the guard implementation or rule
out proxies. Deployment must independently verify the pinned code and bindings.
The guard owner remains the feed-registration authority; incorrect owner binding
is not repaired by this consumer. Pauses, sequencer availability, feed governance,
block provenance/finality and live asset/feed association remain integration work.

The semantic claim is that an off-chain quote cannot enter the consumer's price
path, even when numerically equal: `OFFCHAIN_UNDERLYING_EQUITY_QUOTE
DOES_NOT_ESTABLISH EXECUTED_PROTECTED_ACTION_PRICE`. Numeric equality is not source
authority. Extra ignored ABI bytes likewise do not become price inputs.

## Local tests and falsifiability

The unchanged synthetic `MockAggregatorV3` supplies local observations. No RPC,
real feed, controlled TSLA deployment or prior JSON result is used.

| Test | Boundary |
| --- | --- |
| T1_CONTROL_EXACT_PRICE_CARRIED_INTO_STATE | One fresh guard read; exact state and both new events |
| T2_STALE_FEED_REVERT_ZERO_EFFECT | StaleAnswer; all protected fields unchanged |
| T3_FUTURE_TIMESTAMP_REVERT_ZERO_EFFECT | FutureUpdatedAt; all fields unchanged |
| T4_ZERO_TIMESTAMP_REVERT_ZERO_EFFECT | ZeroUpdatedAt; all fields unchanged |
| T5_INCOMPLETE_ROUND_REVERT_ZERO_EFFECT | IncompleteRound; all fields unchanged |
| T6_NONPOSITIVE_REVERT_ZERO_EFFECT | Zero and negative answers; all fields unchanged |
| T7_UNREGISTERED_ASSET_REVERT_ZERO_EFFECT | UnknownAsset; all fields unchanged |
| T8_VALID_WRONG_ASSET_DOWNSTREAM_REVERT_ZERO_EFFECT | Successful guard evaluation and exact target call followed by binding error |
| T9_TARGET_DIRECT_CALL_REJECTED | Caller restriction; all fields unchanged |
| T10_NO_CALLER_PRICE_ABI | Exact execute selector; price-bearing selector rejected |
| T11_NO_DOUBLE_ADJUSTMENT | Recognizable native price remains unchanged |
| T12_RECEIPT_AND_STATE_AGREE | Exact guard/target/consumer event and persisted-state agreement |
| T13_REPEATED_ACTION_ID_SCOPE | Same ID succeeds twice with two current, different tuples |

Additional tests cover a prior receipt becoming stale, invalid guard construction,
immutable binding getters/permissionless triggering, and ignored trailing equal or
unequal raw-quote bytes. Revert tests start with populated target state, not merely
zero defaults.

Disposable, uncommitted source mutants make these tests fail through assertions:
constant fake forwarded price (T1), extra multiplier (T11), removed asset binding
(T8), removed authorized-consumer check (T9), and reuse of the previous target tuple
after the first execution (T13). Compilation errors, test selection failures and
runtime crashes are not counted as kills. The unmodified baseline and unaffected
controls are run separately. No runtime mutation mode exists in final contracts.

Run from repository root:

```sh
forge --version
forge fmt --check
forge build
forge test -vvv
forge lint
node --test
node relations/robinhood-stock-token-v0/recompute.mjs
node relations/robinhood-stock-token-v0/mutations.mjs
git diff --check
```

The Node suite here is the old relation regression suite from the guard base, not
PR #3's 82-test branch. Local test success is not deployment, live acceptance,
independent verification by another author, or economic safety.
