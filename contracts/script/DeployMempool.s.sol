// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {SwapPool, IERC20} from "../src/SwapPool.sol";
import {PublicBuilder} from "../src/PublicBuilder.sol";
import {PealMempool} from "../src/PealMempool.sol";

/// @notice Deploy the encrypted-mempool demo to Tempo (or any EVM chain).
///
/// Env:
///   DEPLOYER_PRIVATE_KEY  broadcasts; also the token owner and the coordinator
///   RELAYER_ADDRESS       gets a trading balance (sponsors visitor swaps)
///   SEARCHER_ADDRESS      gets a trading balance (the sandwich bot)
///
/// The two lanes get identical pools ($6M: 3,000,000 mUSDC / 1000 mETH). The
/// deployer mints trading balances to the relayer and searcher, but each of
/// those must approve the pools from its own key on boot (approval can only
/// come from the token holder). Prints a JSON blob of addresses for the
/// services and the explorer to consume.
contract DeployMempool is Script {
    uint256 constant BASE_RESERVE = 3_000_000 ether;
    uint256 constant QUOTE_RESERVE = 1000 ether;
    uint256 constant TRADER_USDC = 2_000_000 ether;
    uint256 constant TRADER_ETH = 1000 ether;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address coordinator = deployer; // deployer doubles as the settler
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        address searcher = vm.envAddress("SEARCHER_ADDRESS");

        vm.startBroadcast(pk);

        DemoToken usdc = new DemoToken("Mock USDC", "mUSDC", deployer);
        DemoToken eth = new DemoToken("Mock ETH", "mETH", deployer);

        // Public lane: pool driven by an unprotected, adversarial builder.
        SwapPool publicPool = new SwapPool(IERC20(address(usdc)), IERC20(address(eth)));
        PublicBuilder builder = new PublicBuilder(publicPool);
        publicPool.initOperator(address(builder));
        usdc.mint(address(publicPool), BASE_RESERVE);
        eth.mint(address(publicPool), QUOTE_RESERVE);
        publicPool.sync();

        // Peal lane: pool opened only by the sealed-batch coordinator.
        SwapPool pealPool = new SwapPool(IERC20(address(usdc)), IERC20(address(eth)));
        PealMempool mempool = new PealMempool(pealPool, coordinator);
        pealPool.initOperator(address(mempool));
        usdc.mint(address(pealPool), BASE_RESERVE);
        eth.mint(address(pealPool), QUOTE_RESERVE);
        pealPool.sync();

        // Trading balances. Approvals happen from the relayer/searcher keys.
        usdc.mint(relayer, TRADER_USDC);
        eth.mint(relayer, TRADER_ETH);
        usdc.mint(searcher, TRADER_USDC);
        eth.mint(searcher, TRADER_ETH);

        vm.stopBroadcast();

        console2.log("{");
        console2.log('  "chainId":', block.chainid, ",");
        _line("usdc", address(usdc));
        _line("eth", address(eth));
        _line("publicPool", address(publicPool));
        _line("publicBuilder", address(builder));
        _line("pealPool", address(pealPool));
        _line("pealMempool", address(mempool));
        _line("coordinator", coordinator);
        _line("relayer", relayer);
        _lineLast("searcher", searcher);
        console2.log("}");
    }

    function _line(string memory k, address v) internal pure {
        console2.log(string.concat('  "', k, '": "'), v, '",');
    }

    function _lineLast(string memory k, address v) internal pure {
        console2.log(string.concat('  "', k, '": "'), v, '"');
    }
}
