// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {SemanticExecutionGuard} from "../contracts/SemanticExecutionGuard.sol";
import {ProtectedPriceConsumer} from "../contracts/ProtectedPriceConsumer.sol";
import {ProtectedPriceActionTarget} from "../contracts/ProtectedPriceActionTarget.sol";
import {MockAggregatorV3} from "./mocks/MockAggregatorV3.sol";

/// @dev Synthetic local EVM tests. No RPC, live feed, trade, or economic assertion.
contract ProtectedPriceConsumerTest is Test {
    bytes32 constant ASSET_A = keccak256("synthetic:equity-A");
    bytes32 constant ASSET_B = keccak256("synthetic:equity-B");
    bytes32 constant ACTION = keccak256("synthetic:action-1");
    uint256 constant WINDOW = 3600;
    int256 constant PRICE = 35000000000;
    SemanticExecutionGuard guard;
    ProtectedPriceConsumer consumer;
    ProtectedPriceActionTarget target;
    MockAggregatorV3 feed;

    function setUp() public {
        vm.warp(1_000_000);
        guard = new SemanticExecutionGuard(WINDOW);
        feed = new MockAggregatorV3(8);
        feed.setRound(1, PRICE, 999990, 999990, 1);
        guard.registerFeed(ASSET_A, address(feed));
        consumer = new ProtectedPriceConsumer(address(guard), ASSET_A);
        target = consumer.target();
    }

    function snapshot() internal view returns (bytes memory) {
        return abi.encode(
            target.executionCount(),
            target.lastActionId(),
            target.lastAssetId(),
            target.lastConsumedPrice(),
            target.lastFeedDecimals(),
            target.lastRoundId(),
            target.lastUpdatedAt()
        );
    }

    function seed() internal {
        consumer.execute(keccak256("synthetic:prior-success"), ASSET_A);
        assertEq(target.executionCount(), 1);
    }

    function expectZeroEffect(bytes32 assetId, bytes memory expectedError) internal {
        bytes memory beforeState = snapshot();
        vm.expectRevert(expectedError);
        consumer.execute(ACTION, assetId);
        assertEq(snapshot(), beforeState, "every protected field must remain byte-identical");
    }

    function assertState(bytes32 actionId, int256 price, uint8 decimals, uint80 round, uint256 updated) internal view {
        assertEq(target.lastActionId(), actionId);
        assertEq(target.lastAssetId(), ASSET_A);
        assertEq(target.lastConsumedPrice(), price);
        assertEq(target.lastFeedDecimals(), decimals);
        assertEq(target.lastRoundId(), round);
        assertEq(target.lastUpdatedAt(), updated);
    }

    function assertLogs(
        Vm.Log[] memory logs,
        bytes32 actionId,
        int256 price,
        uint8 decimals,
        uint80 round,
        uint256 updated
    ) internal view {
        assertEq(logs.length, 3, "guard then target then consumer, exactly once each");
        assertEq(logs[0].emitter, address(guard));
        assertEq(logs[0].topics.length, 2);
        assertEq(logs[0].topics[0], keccak256("ExecutablePriceEstablished(bytes32,int256,uint8,uint80,uint256)"));
        assertEq(logs[0].topics[1], ASSET_A);
        assertEq(logs[0].data, abi.encode(price, decimals, round, updated));
        assertEq(logs[1].emitter, address(target));
        assertEq(logs[1].topics.length, 3);
        assertEq(logs[1].topics[0], keccak256("ProtectedPriceApplied(bytes32,bytes32,int256,uint8,uint80,uint256)"));
        assertEq(logs[1].topics[1], actionId);
        assertEq(logs[1].topics[2], ASSET_A);
        assertEq(logs[1].data, logs[0].data, "guard and target price tuples differ");
        assertEq(logs[2].emitter, address(consumer));
        assertEq(logs[2].topics.length, 3);
        assertEq(
            logs[2].topics[0],
            keccak256("ProtectedActionExecuted(bytes32,bytes32,address,address,int256,uint8,uint80,uint256)")
        );
        assertEq(logs[2].topics[1], actionId);
        assertEq(logs[2].topics[2], ASSET_A);
        assertEq(logs[2].data, abi.encode(address(guard), address(target), price, decimals, round, updated));
    }

    function test_T1_CONTROL_EXACT_PRICE_CARRIED_INTO_STATE() public {
        (int256 price, uint8 decimals, uint80 round, uint256 updated) = guard.getExecutablePrice(ASSET_A);
        vm.expectCall(address(guard), abi.encodeCall(guard.establishExecutablePrice, (ASSET_A)), 1);
        vm.expectCall(address(feed), abi.encodeCall(feed.latestRoundData, ()), 1);
        vm.recordLogs();
        consumer.execute(ACTION, ASSET_A);
        assertEq(target.executionCount(), 1);
        assertState(ACTION, price, decimals, round, updated);
        assertLogs(vm.getRecordedLogs(), ACTION, price, decimals, round, updated);
    }

    function test_T2_STALE_FEED_REVERT_ZERO_EFFECT() public {
        seed();
        feed.setRound(2, PRICE, 996399, 996399, 2);
        expectZeroEffect(
            ASSET_A,
            abi.encodeWithSelector(
                SemanticExecutionGuard.StaleAnswer.selector, ASSET_A, uint256(996399), uint256(1000000), WINDOW
            )
        );
    }

    function test_T3_FUTURE_TIMESTAMP_REVERT_ZERO_EFFECT() public {
        seed();
        feed.setRound(2, PRICE, 1000001, 1000001, 2);
        expectZeroEffect(
            ASSET_A,
            abi.encodeWithSelector(
                SemanticExecutionGuard.FutureUpdatedAt.selector, ASSET_A, uint256(1000001), uint256(1000000)
            )
        );
    }

    function test_T4_ZERO_TIMESTAMP_REVERT_ZERO_EFFECT() public {
        seed();
        feed.setRound(2, PRICE, 0, 0, 2);
        expectZeroEffect(ASSET_A, abi.encodeWithSelector(SemanticExecutionGuard.ZeroUpdatedAt.selector, ASSET_A));
    }

    function test_T5_INCOMPLETE_ROUND_REVERT_ZERO_EFFECT() public {
        seed();
        feed.setRound(2, PRICE, 999990, 999990, 1);
        expectZeroEffect(
            ASSET_A,
            abi.encodeWithSelector(SemanticExecutionGuard.IncompleteRound.selector, ASSET_A, uint80(2), uint80(1))
        );
    }

    function test_T6_NONPOSITIVE_REVERT_ZERO_EFFECT() public {
        seed();
        feed.setRound(2, 0, 999990, 999990, 2);
        expectZeroEffect(
            ASSET_A, abi.encodeWithSelector(SemanticExecutionGuard.NonPositiveAnswer.selector, ASSET_A, int256(0))
        );
        feed.setRound(3, -5, 999990, 999990, 3);
        expectZeroEffect(
            ASSET_A, abi.encodeWithSelector(SemanticExecutionGuard.NonPositiveAnswer.selector, ASSET_A, int256(-5))
        );
    }

    function test_T7_UNREGISTERED_ASSET_REVERT_ZERO_EFFECT() public {
        seed();
        expectZeroEffect(ASSET_B, abi.encodeWithSelector(SemanticExecutionGuard.UnknownAsset.selector, ASSET_B));
    }

    function test_T8_VALID_WRONG_ASSET_DOWNSTREAM_REVERT_ZERO_EFFECT() public {
        seed();
        MockAggregatorV3 feedB = new MockAggregatorV3(6);
        feedB.setRound(7, 123456789, 999999, 999999, 7);
        guard.registerFeed(ASSET_B, address(feedB));
        (int256 price,,,) = guard.getExecutablePrice(ASSET_B);
        assertEq(price, 123456789, "B itself is a valid guard observation");
        vm.expectCall(address(guard), abi.encodeCall(guard.establishExecutablePrice, (ASSET_B)), 1);
        vm.expectCall(
            address(target),
            abi.encodeCall(
                target.applyPrice, (ACTION, ASSET_B, int256(123456789), uint8(6), uint80(7), uint256(999999))
            ),
            1
        );
        expectZeroEffect(
            ASSET_B, abi.encodeWithSelector(ProtectedPriceActionTarget.AssetBindingMismatch.selector, ASSET_A, ASSET_B)
        );
    }

    function test_T9_TARGET_DIRECT_CALL_REJECTED() public {
        seed();
        bytes memory beforeState = snapshot();
        vm.expectRevert(
            abi.encodeWithSelector(ProtectedPriceActionTarget.NotAuthorizedConsumer.selector, address(this))
        );
        target.applyPrice(ACTION, ASSET_A, PRICE, 8, 1, 999990);
        assertEq(snapshot(), beforeState);
    }

    function test_T10_NO_CALLER_PRICE_ABI() public {
        assertEq(ProtectedPriceConsumer.execute.selector, bytes4(keccak256("execute(bytes32,bytes32)")));
        bytes memory beforeState = snapshot();
        (bool ok,) =
            address(consumer).call(abi.encodeWithSignature("execute(bytes32,bytes32,int256)", ACTION, ASSET_A, PRICE));
        assertFalse(ok, "price-bearing selector must not dispatch");
        assertEq(snapshot(), beforeState);
    }

    function test_T11_NO_DOUBLE_ADJUSTMENT() public {
        feed.setRound(9, 123456789012345, 999999, 999999, 9);
        consumer.execute(ACTION, ASSET_A);
        assertState(ACTION, 123456789012345, 8, 9, 999999);
    }

    function test_T12_RECEIPT_AND_STATE_AGREE() public {
        vm.recordLogs();
        consumer.execute(ACTION, ASSET_A);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        // Under the frozen guard, its event encodes the exact tuple it returns to the consumer.
        (int256 price, uint8 decimals, uint80 round, uint256 updated) =
            abi.decode(logs[0].data, (int256, uint8, uint80, uint256));
        assertEq(price, PRICE);
        assertLogs(logs, ACTION, price, decimals, round, updated);
        assertState(ACTION, price, decimals, round, updated);
        assertEq(target.executionCount(), 1);
    }

    function test_T13_REPEATED_ACTION_ID_SCOPE() public {
        consumer.execute(ACTION, ASSET_A);
        assertEq(target.executionCount(), 1);
        vm.warp(1000010);
        feed.setRound(2, 42000000001, 1000009, 1000009, 2);
        vm.recordLogs();
        consumer.execute(ACTION, ASSET_A);
        assertEq(target.executionCount(), 2, "actionId is not a nonce");
        assertState(ACTION, 42000000001, 8, 2, 1000009);
        assertLogs(vm.getRecordedLogs(), ACTION, 42000000001, 8, 2, 1000009);
    }

    function test_priorPriceReceiptCannotAuthorizeAfterStaleness() public {
        seed();
        guard.establishExecutablePrice(ASSET_A);
        vm.warp(1003591);
        expectZeroEffect(
            ASSET_A,
            abi.encodeWithSelector(
                SemanticExecutionGuard.StaleAnswer.selector, ASSET_A, uint256(999990), uint256(1003591), WINDOW
            )
        );
    }

    function test_constructorRejectsZeroAndNonContractGuard() public {
        vm.expectRevert(ProtectedPriceConsumer.ZeroGuardAddress.selector);
        new ProtectedPriceConsumer(address(0), ASSET_A);
        vm.expectRevert(abi.encodeWithSelector(ProtectedPriceConsumer.GuardNotAContract.selector, address(0xBEEF)));
        new ProtectedPriceConsumer(address(0xBEEF), ASSET_A);
    }

    function test_immutableBindingsAndPermissionlessTrigger() public {
        assertEq(address(consumer.guard()), address(guard));
        assertEq(address(consumer.target()), address(target));
        assertEq(consumer.boundAssetId(), ASSET_A);
        assertEq(target.boundAssetId(), ASSET_A);
        assertEq(target.authorizedConsumer(), address(consumer));
        vm.prank(address(0xBEEF));
        consumer.execute(ACTION, ASSET_A);
        assertEq(target.executionCount(), 1);
        assertState(ACTION, PRICE, 8, 1, 999990);
    }

    function test_trailingRawQuoteBytesCannotInfluencePrice() public {
        // ABI trailing data can be ignored, but neither equality nor inequality supplies authority.
        (bool equalOk,) =
            address(consumer).call(bytes.concat(abi.encodeCall(consumer.execute, (ACTION, ASSET_A)), abi.encode(PRICE)));
        assertTrue(equalOk);
        assertEq(target.lastConsumedPrice(), PRICE);
        (bool unequalOk,) = address(consumer)
            .call(bytes.concat(abi.encodeCall(consumer.execute, (ACTION, ASSET_A)), abi.encode(int256(1))));
        assertTrue(unequalOk);
        assertEq(target.lastConsumedPrice(), PRICE);
        assertEq(target.executionCount(), 2);
    }
}
