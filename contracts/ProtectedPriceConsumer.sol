// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SemanticExecutionGuard} from "./SemanticExecutionGuard.sol";
import {ProtectedPriceActionTarget} from "./ProtectedPriceActionTarget.sol";

/// @notice Carries a current guard price into a bound target's state in the same transaction.
/// @dev Permissionless trigger, not a trade, permit or settlement engine. Deployment must
/// independently establish the configured guard's code identity; code presence is not authenticity.
contract ProtectedPriceConsumer {
    SemanticExecutionGuard public immutable guard;
    ProtectedPriceActionTarget public immutable target;
    bytes32 public immutable boundAssetId;

    error ZeroGuardAddress();
    error GuardNotAContract(address guardAddress);

    event ProtectedActionExecuted(
        bytes32 indexed actionId,
        bytes32 indexed assetId,
        address guard,
        address target,
        int256 consumedPrice,
        uint8 feedDecimals,
        uint80 roundId,
        uint256 updatedAt
    );

    constructor(address guard_, bytes32 boundAssetId_) {
        if (guard_ == address(0)) revert ZeroGuardAddress();
        if (guard_.code.length == 0) revert GuardNotAContract(guard_);
        guard = SemanticExecutionGuard(guard_);
        boundAssetId = boundAssetId_;
        target = new ProtectedPriceActionTarget(boundAssetId_);
    }

    /// @notice Establish and consume the exact native price tuple; no external price input.
    /// @dev Repeated actionId values are allowed, with a new guard call on every execution.
    /// Any guard or target revert bubbles up, rolling back this entire call and its logs.
    function execute(bytes32 actionId, bytes32 assetId) external {
        (int256 adjustedPrice, uint8 feedDecimals, uint80 roundId, uint256 updatedAt) =
            guard.establishExecutablePrice(assetId);
        target.applyPrice(actionId, assetId, adjustedPrice, feedDecimals, roundId, updatedAt);
        emit ProtectedActionExecuted(
            actionId, assetId, address(guard), address(target), adjustedPrice, feedDecimals, roundId, updatedAt
        );
    }
}
