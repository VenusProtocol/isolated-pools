// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../Comptroller.sol";
import "../Unitroller.sol";
import "../PriceOracle.sol";

/**
 * @title PoolDirectory
 * @notice PoolDirectory is a directory for Venus interest rate pools.
 */
contract PoolDirectory is OwnableUpgradeable {
    /**
     * @dev Initializes a deployer whitelist if desired.
     * @param _enforceDeployerWhitelist Boolean indicating if the deployer whitelist is to be enforced.
     * @param _deployerWhitelist Array of Ethereum accounts to be whitelisted.
     */
    function initialize(
        bool _enforceDeployerWhitelist,
        address[] memory _deployerWhitelist
    ) public initializer {
        __Ownable_init();
        enforceDeployerWhitelist = _enforceDeployerWhitelist;
        for (uint256 i = 0; i < _deployerWhitelist.length; i++)
            deployerWhitelist[_deployerWhitelist[i]] = true;
    }

    /**
     * @dev Struct for a Fuse interest rate pool.
     */
    struct FusePool {
        string name;
        address creator;
        address comptroller;
        uint256 blockPosted;
        uint256 timestampPosted;
    }

    /**
     * @dev Array of Fuse interest rate pools.
     */
    FusePool[] public pools;

    /**
     * @dev Maps Ethereum accounts to arrays of Fuse pool indexes.
     */
    mapping(address => uint256[]) private _poolsByAccount;

    /**
     * @dev Maps Fuse pool Comptroller addresses to bools indicating if they have been registered via the directory.
     */
    mapping(address => bool) public poolExists;

    /**
     * @dev Emitted when a new Fuse pool is added to the directory.
     */
    event PoolRegistered(uint256 index, FusePool pool);

    /**
     * @dev Booleans indicating if the deployer whitelist is enforced.
     */
    bool public enforceDeployerWhitelist;

    /**
     * @dev Maps Ethereum accounts to booleans indicating if they are allowed to deploy pools.
     */
    mapping(address => bool) public deployerWhitelist;

    /**
     * @dev Controls if the deployer whitelist is to be enforced.
     * @param enforce Boolean indicating if the deployer whitelist is to be enforced.
     */
    function _setDeployerWhitelistEnforcement(bool enforce) external onlyOwner {
        enforceDeployerWhitelist = enforce;
    }

    /**
     * @dev Adds/removes Ethereum accounts to the deployer whitelist.
     * @param deployers Array of Ethereum accounts to be whitelisted.
     * @param status Whether to add or remove the accounts.
     */
    function _editDeployerWhitelist(address[] calldata deployers, bool status)
        external
        onlyOwner
    {
        require(deployers.length > 0, "No deployers supplied.");
        for (uint256 i = 0; i < deployers.length; i++)
            deployerWhitelist[deployers[i]] = status;
    }

    /**
     * @dev Adds a new Fuse pool to the directory (without checking msg.sender).
     * @param name The name of the pool.
     * @param comptroller The pool's Comptroller proxy contract address.
     * @return The index of the registered Fuse pool.
     */
    function _registerPool(string memory name, address comptroller)
        internal
        returns (uint256)
    {
        require(
            !poolExists[comptroller],
            "Pool already exists in the directory."
        );
        require(
            !enforceDeployerWhitelist || deployerWhitelist[msg.sender],
            "Sender is not on deployer whitelist."
        );
        require(bytes(name).length <= 100, "No pool name supplied.");
        FusePool memory pool = FusePool(
            name,
            msg.sender,
            comptroller,
            block.number,
            block.timestamp
        );
        pools.push(pool);
        _poolsByAccount[msg.sender].push(pools.length - 1);
        poolExists[comptroller] = true;
        emit PoolRegistered(pools.length - 1, pool);
        return pools.length - 1;
    }

    /**
     * @dev Deploys a new Fuse pool and adds to the directory.
     * @param name The name of the pool.
     * @param implementation The Comptroller implementation contract address.
     * @param closeFactor The pool's close factor (scaled by 1e18).
     * @param liquidationIncentive The pool's liquidation incentive (scaled by 1e18).
     * @param priceOracle The pool's PriceOracle contract address.
     * @return The index of the registered Fuse pool and the Unitroller proxy address.
     */
    function deployPool(
        string memory name,
        address implementation,
        // bool enforceWhitelist,
        uint256 closeFactor,
        uint256 liquidationIncentive,
        address priceOracle
    ) external virtual returns (uint256, address) {
        // Input validation
        require(
            implementation != address(0),
            "No Comptroller implementation contract address specified."
        );
        require(
            priceOracle != address(0),
            "No PriceOracle contract address specified."
        );

        // Deploy Unitroller using msg.sender, name, and block.number as a salt
        // bytes
        //     memory unitrollerCreationCode = hex"60806040526001805460ff60a81b1960ff60a01b19909116600160a01b1716600160a81b17905534801561003257600080fd5b50600080546001600160a01b03191633179055610ae1806100546000396000f3fe6080604052600436106100a75760003560e01c8063bb82aa5e11610064578063bb82aa5e14610437578063c1e803341461044c578063dcfbc0c714610461578063e992a04114610476578063e9c714f2146104a9578063f851a440146104be576100a7565b80630225ab9d1461032b5780630a755ec21461036957806326782247146103925780632f1069ba146103c35780636f63af0b146103d8578063b71d1a0c14610404575b3330146102a85760408051600481526024810182526020810180516001600160e01b0316633757348b60e21b1781529151815160009360609330939092909182918083835b6020831061010b5780518252601f1990920191602091820191016100ec565b6001836020036101000a038019825116818451168082178552505050505050905001915050600060405180830381855afa9150503d806000811461016b576040519150601f19603f3d011682016040523d82523d6000602084013e610170565b606091505b5091509150600082156101975781806020019051602081101561019257600080fd5b505190505b80156102a4576002546040805163bbcdd6d360e01b81526001600160a01b0390921660048301525160009173a731585ab05fc9f83555cf9bff8f58ee94e18f859163bbcdd6d391602480820192602092909190829003018186803b1580156101fe57600080fd5b505afa158015610212573d6000803e3d6000fd5b505050506040513d602081101561022857600080fd5b50516002549091506001600160a01b038083169116146102a257600280546001600160a01b038381166001600160a01b0319831617928390556040805192821680845293909116602083015280517fd604de94d45953f9138079ec1b82d533cb2160c906d1076d1f7ed54befbca97a9281900390910190a1505b505b5050505b6002546040516000916001600160a01b031690829036908083838082843760405192019450600093509091505080830381855af49150503d806000811461030b576040519150601f19603f3d011682016040523d82523d6000602084013e610310565b606091505b505090506040513d6000823e818015610327573d82f35b3d82fd5b34801561033757600080fd5b506103576004803603602081101561034e57600080fd5b503515156104d3565b60408051918252519081900360200190f35b34801561037557600080fd5b5061037e61056f565b604080519115158252519081900360200190f35b34801561039e57600080fd5b506103a761057f565b604080516001600160a01b039092168252519081900360200190f35b3480156103cf57600080fd5b5061037e61058e565b3480156103e457600080fd5b50610357600480360360208110156103fb57600080fd5b5035151561059e565b34801561041057600080fd5b506103576004803603602081101561042757600080fd5b50356001600160a01b031661063a565b34801561044357600080fd5b506103a76106bd565b34801561045857600080fd5b506103576106cc565b34801561046d57600080fd5b506103a76107c7565b34801561048257600080fd5b506103576004803603602081101561049957600080fd5b50356001600160a01b03166107d6565b3480156104b557600080fd5b506103576108f6565b3480156104ca57600080fd5b506103a76109dc565b60006104dd6109eb565b6104f4576104ed60016005610a46565b905061056a565b60015460ff600160a81b90910416151582151514156105145760006104ed565b60018054831515600160a81b810260ff60a81b199092169190911790915560408051918252517f10f9a0a95673b0837d1dce21fd3bffcb6d760435e9b5300b75a271182f75f8229181900360200190a160005b90505b919050565b600154600160a81b900460ff1681565b6001546001600160a01b031681565b600154600160a01b900460ff1681565b60006105a86109eb565b6105b8576104ed60016005610a46565b60015460ff600160a01b90910416151582151514156105d85760006104ed565b60018054831515600160a01b90810260ff60a01b199092169190911791829055604080519190920460ff161515815290517fabb56a15fd39488c914b324690b88f30d7daec63d2131ca0ef47e5739068c86e9181900360200190a16000610567565b60006106446109eb565b610654576104ed60016010610a46565b600180546001600160a01b038481166001600160a01b0319831681179093556040805191909216808252602082019390935281517fca4f2f25d0898edd99413412fb94012f9e54ec8142f9b093e7720646a95b16a9929181900390910190a160005b9392505050565b6002546001600160a01b031681565b6003546000906001600160a01b0316331415806106f257506003546001600160a01b0316155b1561070957610702600180610a46565b90506107c4565b60028054600380546001600160a01b038082166001600160a01b031980861682179687905590921690925560408051938316808552949092166020840152815190927fd604de94d45953f9138079ec1b82d533cb2160c906d1076d1f7ed54befbca97a92908290030190a1600354604080516001600160a01b038085168252909216602083015280517fe945ccee5d701fc83f9b8aa8ca94ea4219ec1fcbd4f4cab4f0ea57c5c3e1d8159281900390910190a160005b925050505b90565b6003546001600160a01b031681565b60006107e06109eb565b6107f0576104ed60016012610a46565b60025460408051639d244f9f60e01b81526001600160a01b03928316600482015291841660248301525173a731585ab05fc9f83555cf9bff8f58ee94e18f8591639d244f9f916044808301926020929190829003018186803b15801561085557600080fd5b505afa158015610869573d6000803e3d6000fd5b505050506040513d602081101561087f57600080fd5b5051610891576104ed60016011610a46565b600380546001600160a01b038481166001600160a01b0319831617928390556040805192821680845293909116602083015280517fe945ccee5d701fc83f9b8aa8ca94ea4219ec1fcbd4f4cab4f0ea57c5c3e1d8159281900390910190a160006106b6565b6001546000906001600160a01b031633141580610911575033155b156109225761070260016000610a46565b60008054600180546001600160a01b038082166001600160a01b031980861682179687905590921690925560408051938316808552949092166020840152815190927ff9ffabca9c8276e99321725bcb43fb076a6c66a54b7f21c4e8146d8519b417dc92908290030190a1600154604080516001600160a01b038085168252909216602083015280517fca4f2f25d0898edd99413412fb94012f9e54ec8142f9b093e7720646a95b16a99281900390910190a160006107bf565b6000546001600160a01b031681565b600080546001600160a01b031633148015610a0f5750600154600160a81b900460ff165b80610a4157503373a731585ab05fc9f83555cf9bff8f58ee94e18f85148015610a415750600154600160a01b900460ff165b905090565b60007f45b96fe442630264581b197e84bbada861235052c5a1aadfff9ea4e40a969aa0836015811115610a7557fe5b83601b811115610a8157fe5b604080519283526020830191909152600082820152519081900360600190a18260158111156106b657fefea265627a7a72315820a5cf9491a370c17ee98b3c08c728cc0ddad83bd43ca76c92dc106835bfccb25664736f6c63430005110032";
        // bytes32 salt = keccak256(
        //     abi.encodePacked(msg.sender, name, block.number)
        // );
        // address payable proxy;

        // assembly {
        //     proxy := create2(
        //         0,
        //         add(unitrollerCreationCode, 32),
        //         mload(unitrollerCreationCode),
        //         salt
        //     )
        //     if iszero(extcodesize(proxy)) {
        //         revert(0, "Failed to deploy Unitroller.")
        //     }
        // }

        // // Setup Unitroller
        // Unitroller unitroller = Unitroller(proxy);
        Unitroller unitroller = new Unitroller();
        address proxy = address(unitroller);
        require(
            unitroller._setPendingImplementation(implementation) == 0,
            "Failed to set pending implementation on Unitroller."
        ); // Checks Comptroller implementation whitelist
        Comptroller comptrollerImplementation = Comptroller(implementation);
        comptrollerImplementation._become(unitroller);
        Comptroller comptrollerProxy = Comptroller(proxy);

        // Set pool parameters
        require(
            comptrollerProxy._setCloseFactor(closeFactor) == 0,
            "Failed to set pool close factor."
        );
        require(
            comptrollerProxy._setLiquidationIncentive(liquidationIncentive) ==
                0,
            "Failed to set pool liquidation incentive."
        );
        require(
            comptrollerProxy._setPriceOracle(PriceOracle(priceOracle)) == 0,
            "Failed to set pool price oracle."
        );

        // Whitelist
        // if (enforceWhitelist)
        //     require(
        //         comptrollerProxy._setWhitelistEnforcement(true) == 0,
        //         "Failed to enforce supplier/borrower whitelist."
        //     );

        // Enable auto-implementation
        // require(
        //     comptrollerProxy._toggleAutoImplementations(true) == 0,
        //     "Failed to enable pool auto implementations."
        // );

        // Make msg.sender the admin
        require(
            unitroller._setPendingAdmin(msg.sender) == 0,
            "Failed to set pending admin on Unitroller."
        );

        // Register the pool with this PoolDirectory
        return (_registerPool(name, proxy), proxy);
    }

    /**
     * @notice Returns arrays of all Fuse pools' data.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
     */
    function getAllPools() external view returns (FusePool[] memory) {
        return pools;
    }

    /**
     * @notice Returns arrays of all public Fuse pool indexes and data.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
     */
    function getPublicPools()
        external
        view
        returns (uint256[] memory, FusePool[] memory)
    {
        uint256 arrayLength = 0;

        for (uint256 i = 0; i < pools.length; i++) {
            arrayLength++;
        }

        uint256[] memory indexes = new uint256[](arrayLength);
        FusePool[] memory publicPools = new FusePool[](arrayLength);
        uint256 index = 0;

        for (uint256 i = 0; i < pools.length; i++) {
            indexes[index] = i;
            publicPools[index] = pools[i];
            index++;
        }

        return (indexes, publicPools);
    }

    /**
     * @notice Returns arrays of Fuse pool indexes and data created by `account`.
     */
    function getPoolsByAccount(address account)
        external
        view
        returns (uint256[] memory, FusePool[] memory)
    {
        uint256[] memory indexes = new uint256[](
            _poolsByAccount[account].length
        );
        FusePool[] memory accountPools = new FusePool[](
            _poolsByAccount[account].length
        );

        for (uint256 i = 0; i < _poolsByAccount[account].length; i++) {
            indexes[i] = _poolsByAccount[account][i];
            accountPools[i] = pools[_poolsByAccount[account][i]];
        }

        return (indexes, accountPools);
    }

    /**
     * @dev Maps Ethereum accounts to arrays of Fuse pool Comptroller proxy contract addresses.
     */
    mapping(address => address[]) private _bookmarks;

    /**
     * @notice Returns arrays of Fuse pool Unitroller (Comptroller proxy) contract addresses bookmarked by `account`.
     */
    function getBookmarks(address account)
        external
        view
        returns (address[] memory)
    {
        return _bookmarks[account];
    }

    /**
     * @notice Bookmarks a Fuse pool Unitroller (Comptroller proxy) contract addresses.
     */
    function bookmarkPool(address comptroller) external {
        _bookmarks[msg.sender].push(comptroller);
    }

    /**
     * @notice Modify existing Fuse pool name.
     */
    function setPoolName(uint256 index, string calldata name) external {
        Comptroller _comptroller = Comptroller(pools[index].comptroller);

        // Note: Compiler throws stack to deep if autoformatted with Prettier
        // prettier-ignore
        require(msg.sender == _comptroller.admin() || msg.sender == owner());

        pools[index].name = name;
    }

    /**
     * @dev Maps Ethereum accounts to booleans indicating if they are a whitelisted admin.
     */
    mapping(address => bool) public adminWhitelist;

    /**
     * @dev Event emitted when the admin whitelist is updated.
     */
    event AdminWhitelistUpdated(address[] admins, bool status);

    /**
     * @dev Adds/removes Ethereum accounts to the admin whitelist.
     * @param admins Array of Ethereum accounts to be whitelisted.
     * @param status Whether to add or remove the accounts.
     */
    function _editAdminWhitelist(address[] calldata admins, bool status)
        external
        onlyOwner
    {
        require(admins.length > 0, "No admins supplied.");
        for (uint256 i = 0; i < admins.length; i++)
            adminWhitelist[admins[i]] = status;
        emit AdminWhitelistUpdated(admins, status);
    }

    /**
     * @notice Returns arrays of all public Fuse pool indexes and data with whitelisted admins.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
     */
    function getPublicPoolsByVerification(bool whitelistedAdmin)
        external
        view
        returns (uint256[] memory, FusePool[] memory)
    {
        uint256 arrayLength = 0;

        for (uint256 i = 0; i < pools.length; i++) {
            Comptroller comptroller = Comptroller(pools[i].comptroller);
            arrayLength++;
        }

        uint256[] memory indexes = new uint256[](arrayLength);
        FusePool[] memory publicPools = new FusePool[](arrayLength);
        uint256 index = 0;

        for (uint256 i = 0; i < pools.length; i++) {
            Comptroller comptroller = Comptroller(pools[i].comptroller);
            indexes[index] = i;
            publicPools[index] = pools[i];
            index++;
        }

        return (indexes, publicPools);
    }
}