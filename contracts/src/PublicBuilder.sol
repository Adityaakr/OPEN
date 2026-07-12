// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {SwapPool} from "./SwapPool.sol";

/// @title PublicBuilder
/// @notice Models an UNPROTECTED mempool with an adversarial block builder.
/// An order is submitted in cleartext and DEFERRED (not executed on arrival);
/// that gap between "visible" and "executed" is the whole opportunity. The
/// builder (the searcher) then reads the pending order and chooses how to
/// execute it: honestly via execute(), or wrapped in a sandwich via sandwich().
///
/// This is the same builder capability the PealMempool lane's coordinator has.
/// The only difference between the lanes is that here the order is readable, so
/// the builder can sandwich it, and there it is sealed, so it cannot.
contract PublicBuilder {
    SwapPool public immutable pool;

    struct Order {
        address trader;
        bool baseToQuote;
        uint256 amountIn;
        uint256 minOut;
        address to;
    }

    mapping(bytes32 => Order) public pending;
    mapping(bytes32 => bool) public executed;
    uint256 public nonce;

    /// @notice A pending order, in full cleartext. This is exactly what a
    /// searcher watching the public mempool gets to see.
    event Pending(
        bytes32 indexed id,
        address indexed trader,
        bool baseToQuote,
        uint256 amountIn,
        uint256 minOut
    );
    event Executed(bytes32 indexed id, uint256 amountOut);
    event Sandwiched(bytes32 indexed id, uint256 victimOut, uint256 searcherProfit);

    error UnknownOrder();
    error AlreadyExecuted();

    constructor(SwapPool pool_) {
        pool = pool_;
    }

    /// @notice Submit an order to the public mempool. Deferred: it is recorded
    /// and broadcast in the clear, but not executed until a builder includes it.
    function submitOrder(Order calldata order) external returns (bytes32 id) {
        id = keccak256(abi.encode(order, nonce++));
        pending[id] = order;
        emit Pending(id, order.trader, order.baseToQuote, order.amountIn, order.minOut);
    }

    /// @notice Honest inclusion: execute the order as submitted, no reordering.
    /// This is the fill a victim gets when nobody sandwiches them.
    function execute(bytes32 id) external returns (uint256 amountOut) {
        Order memory o = _take(id);
        amountOut = pool.swap(o.trader, o.baseToQuote, o.amountIn, o.minOut, o.to);
        emit Executed(id, amountOut);
    }

    /// @notice Sandwich the pending order. The caller (the searcher) front-runs
    /// in the victim's direction with `frontAmountIn` of its own tokens, lets
    /// the victim fill at the worsened price, then unwinds. Atomic: if the
    /// front-run pushes the victim below its own minOut, the victim swap reverts
    /// and the whole sandwich reverts with it, so the searcher must size the
    /// front-run to exactly the victim's revert floor (it does this off-chain).
    /// @param frontAmountIn input-token amount for the front-run leg.
    function sandwich(bytes32 id, uint256 frontAmountIn)
        external
        returns (uint256 victimOut, uint256 searcherProfit)
    {
        Order memory o = _take(id);

        // Front-run: same direction as the victim, paid by the searcher.
        uint256 frontOut =
            pool.swap(msg.sender, o.baseToQuote, frontAmountIn, 0, msg.sender);

        // Victim fills at the price the front-run left behind. Reverts here if
        // it can no longer clear its slippage floor.
        victimOut = pool.swap(o.trader, o.baseToQuote, o.amountIn, o.minOut, o.to);

        // Back-run: unwind the front-run inventory into the victim's buy.
        uint256 backOut =
            pool.swap(msg.sender, !o.baseToQuote, frontOut, 0, msg.sender);

        searcherProfit = backOut > frontAmountIn ? backOut - frontAmountIn : 0;
        emit Sandwiched(id, victimOut, searcherProfit);
    }

    function _take(bytes32 id) internal returns (Order memory o) {
        o = pending[id];
        if (o.trader == address(0)) revert UnknownOrder();
        if (executed[id]) revert AlreadyExecuted();
        executed[id] = true;
    }
}
