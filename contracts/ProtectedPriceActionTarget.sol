// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @notice Records a protected price-carrying state transition; no trade or settlement.
/// @dev Deployed by its consumer. No external calls, mutable bindings, or price arithmetic.
contract ProtectedPriceActionTarget {
    address public immutable authorizedConsumer;
    bytes32 public immutable boundAssetId;

    uint256 public executionCount;
    bytes32 public lastActionId;
    bytes32 public lastAssetId;
    int256 public lastConsumedPrice;
    uint8 public lastFeedDecimals;
    uint80 public lastRoundId;
    uint256 public lastUpdatedAt;

    error NotAuthorizedConsumer(address caller);
    error AssetBindingMismatch(bytes32 expectedAssetId, bytes32 suppliedAssetId);

    event ProtectedPriceApplied(
        bytes32 indexed actionId,
        bytes32 indexed assetId,
        int256 consumedPrice,
        uint8 feedDecimals,
        uint80 roundId,
        uint256 updatedAt
    );

    constructor(bytes32 boundAssetId_) {
        authorizedConsumer = msg.sender;
        boundAssetId = boundAssetId_;
    }

    /// @dev The price tuple is trusted only from the immutable consumer, not arbitrary callers.
    /// actionId labels an execution; it is not authorization, a nonce, or replay protection.
    function applyPrice(
        bytes32 actionId,
        bytes32 assetId,
        int256 consumedPrice,
        uint8 feedDecimals,
        uint80 roundId,
        uint256 updatedAt
    ) external {
        if (msg.sender != authorizedConsumer) revert NotAuthorizedConsumer(msg.sender);
        if (assetId != boundAssetId) revert AssetBindingMismatch(boundAssetId, assetId);

        executionCount += 1;
        lastActionId = actionId;
        lastAssetId = assetId;
        lastConsumedPrice = consumedPrice;
        lastFeedDecimals = feedDecimals;
        lastRoundId = roundId;
        lastUpdatedAt = updatedAt;
        emit ProtectedPriceApplied(actionId, assetId, consumedPrice, feedDecimals, roundId, updatedAt);
    }
}
