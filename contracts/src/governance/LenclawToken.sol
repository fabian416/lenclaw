// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title LenclawToken - ERC-20 governance token with voting power
/// @notice ERC20Votes token for Lenclaw DAO governance. Max supply capped at 100M LNCL.
///         Uses block.timestamp clock mode for compatibility with the governor.
contract LenclawToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    /// @notice Maximum supply cap: 100 million tokens (18 decimals)
    uint256 public constant MAX_SUPPLY = 100_000_000e18;

    error MaxSupplyExceeded(uint256 requested, uint256 available);

    constructor(address _owner) ERC20("Lenclaw", "LNCL") ERC20Permit("Lenclaw") Ownable(_owner) {}

    /// @notice Mint new tokens. Only callable by the owner.
    /// @param to The recipient of the minted tokens
    /// @param amount The number of tokens to mint
    function mint(address to, uint256 amount) external onlyOwner {
        if (totalSupply() + amount > MAX_SUPPLY) {
            revert MaxSupplyExceeded(amount, MAX_SUPPLY - totalSupply());
        }
        _mint(to, amount);
    }

    /// @notice Returns the clock value used for voting snapshots (block.timestamp)
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    /// @notice Machine-readable description of the clock mode
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    // --------------- Required overrides ---------------

    function _update(address from, address to, uint256 value) internal override (ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner_) public view override (ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner_);
    }
}
