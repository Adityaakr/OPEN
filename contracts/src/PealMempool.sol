// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {SwapPool} from "./SwapPool.sol";

/// @title PealMempool
/// @notice The sealed lane. An order enters as a commitment to a ciphertext
/// hash (commitSealed) — that hash is all a searcher watching the chain can
/// see, so there is nothing to wrap a sandwich around. When the cue fires and
/// the committee opens the batch, the coordinator settles the whole batch in
/// committed order (executeBatch).
///
/// executeBatch re-derives the merkle root over the revealed (position, payload)
/// leaves using the same construction as the coordinator (merkle.rs) and the
/// SDK (anchor.ts), and requires it to equal the published root. So the swaps it
/// executes are provably the revealed batch, not an ordering the coordinator
/// substituted afterwards. Every real slot's payload is the abi-encoded order
/// itself, so the executed swap is decoded from the same bytes that went into
/// the root — the binding is end to end.
///
/// v0 trust: the coordinator is a single trusted address here (see `coordinator`),
/// and it supplies the ordered plaintexts. The decentralised committee that
/// removes this trust is on the roadmap; the demo states it plainly.
contract PealMempool {
    SwapPool public immutable pool;

    /// @notice The only address allowed to settle a revealed batch.
    address public immutable coordinator;

    /// @notice conditionId => published merkle root, once settled.
    mapping(bytes32 => bytes32) public settledRoot;

    /// @notice One revealed slot. `isReal` false is dummy padding: it is folded
    /// into the merkle root (so the root matches the coordinator's, which is
    /// taken over the whole padded batch) but never executed.
    struct Slot {
        uint32 position;
        bool isReal;
        bytes payload;
    }

    event Sealed(bytes32 indexed conditionId, bytes32 indexed ctHash, address indexed from);
    event BatchExecuted(bytes32 indexed conditionId, bytes32 merkleRoot, uint256 realCount);
    event OrderFilled(bytes32 indexed conditionId, uint32 position, uint256 amountOut);

    error NotCoordinator();
    error AlreadySettled();
    error RootMismatch(bytes32 got, bytes32 want);

    constructor(SwapPool pool_, address coordinator_) {
        pool = pool_;
        coordinator = coordinator_;
    }

    /// @notice Enter the sealed mempool: commit to a sealed ciphertext by hash.
    /// The event carries only the hash — no amount, no direction, nothing a
    /// searcher can act on.
    function commitSealed(bytes32 conditionId, bytes32 ctHash) external {
        emit Sealed(conditionId, ctHash, msg.sender);
    }

    /// @notice Settle a revealed batch. Coordinator only, once per condition.
    /// Verifies the reconstructed root matches `merkleRoot`, then executes each
    /// real slot's order in position sequence against the pool.
    function executeBatch(bytes32 conditionId, Slot[] calldata slots, bytes32 merkleRoot)
        external
    {
        if (msg.sender != coordinator) revert NotCoordinator();
        if (settledRoot[conditionId] != bytes32(0)) revert AlreadySettled();

        bytes32 root = _merkleRoot(slots);
        if (root != merkleRoot) revert RootMismatch(root, merkleRoot);
        settledRoot[conditionId] = merkleRoot;

        uint256 realCount;
        for (uint256 i = 0; i < slots.length; i++) {
            if (!slots[i].isReal) continue;
            (address trader, bool baseToQuote, uint256 amountIn, uint256 minOut, address to) =
                abi.decode(slots[i].payload, (address, bool, uint256, uint256, address));
            uint256 out = pool.swap(trader, baseToQuote, amountIn, minOut, to);
            emit OrderFilled(conditionId, slots[i].position, out);
            realCount++;
        }
        emit BatchExecuted(conditionId, merkleRoot, realCount);
    }

    /// @notice Reconstruct the batch root off the settlement path, so a settler
    /// (or a test) can check its slots against the coordinator's published root
    /// before spending gas on executeBatch.
    function computeRoot(Slot[] calldata slots) external pure returns (bytes32) {
        return _merkleRoot(slots);
    }

    // ---- merkle, matching coordinator merkle.rs exactly --------------------

    /// leaf = sha256(position_le_u32 || payload)
    function _leaf(uint32 position, bytes calldata payload) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(_le32(position), payload));
    }

    /// uint32 as 4 little-endian bytes (Rust's position.to_le_bytes()).
    function _le32(uint32 x) internal pure returns (bytes4) {
        return bytes4(
            (uint32(uint8(x)) << 24) | (uint32(uint8(x >> 8)) << 16) | (uint32(uint8(x >> 16)) << 8)
                | uint32(uint8(x >> 24))
        );
    }

    /// Root over slots in the given order. parent = sha256(l || r), odd node
    /// promoted, single leaf is its own root, empty batch hashes to sha256("").
    function _merkleRoot(Slot[] calldata slots) internal pure returns (bytes32) {
        uint256 n = slots.length;
        if (n == 0) return sha256("");

        bytes32[] memory level = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            level[i] = _leaf(slots[i].position, slots[i].payload);
        }

        while (n > 1) {
            uint256 m = 0;
            for (uint256 i = 0; i < n; i += 2) {
                if (i + 1 < n) {
                    level[m] = sha256(abi.encodePacked(level[i], level[i + 1]));
                } else {
                    level[m] = level[i]; // odd node promoted
                }
                m++;
            }
            n = m;
        }
        return level[0];
    }
}
