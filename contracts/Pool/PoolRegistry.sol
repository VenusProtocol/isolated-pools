// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../Comptroller.sol";
import "../Unitroller.sol";
import "../PriceOracle.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";

/**
 * @title PoolRegistry
 * @notice PoolRegistry is a registry for Venus interest rate pools.
 */
contract PoolRegistry is OwnableUpgradeable {
    /**
     * @dev Initializes the deployer to owner.
     */
    function initialize(
    ) public initializer {
        __Ownable_init();
    }

    /**
     * @dev Struct for a Fuse interest rate pool.
     */
    struct VenusPool {
        string name;
        address creator;
        address comptroller;
        uint256 blockPosted;
        uint256 timestampPosted;
    }

    /**
     * @dev Array of Venus pools.
     */
    VenusPool[] private _poolsByID;

    /**
     * @dev Maps Ethereum accounts to arrays of Venus pool indexes.
     */
    mapping(address => uint256[]) private _poolsByAccount;

    /**
     * @dev Maps Venus pool Comptroller addresses to bools indicating if it's registered or not.
     */
    mapping(address => bool) public isPoolRegistered;

    /**
     * @dev Emitted when a new Venus pool is added to the directory.
     */
    event PoolRegistered(uint256 index, VenusPool pool);

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
            !isPoolRegistered[comptroller],
            "Pool already exists in the directory."
        );
        require(bytes(name).length <= 100, "No pool name supplied.");
        VenusPool memory pool = VenusPool(
            name,
            msg.sender,
            comptroller,
            block.number,
            block.timestamp
        );
        _poolsByID.push(pool);
        _poolsByAccount[msg.sender].push(_poolsByID.length - 1);
        isPoolRegistered[comptroller] = true;
        emit PoolRegistered(_poolsByID.length - 1, pool);
        return _poolsByID.length - 1;
    }

    /**
     * @dev Deploys a new Venus pool and adds to the directory.
     * @param name The name of the pool.
     * @param implementation The Comptroller implementation address.
     * @param closeFactor The pool's close factor (scaled by 1e18).
     * @param liquidationIncentive The pool's liquidation incentive (scaled by 1e18).
     * @param priceOracle The pool's PriceOracle address.
     * @return The index of the registered Venus pool and the proxy(Unitroller ) address.
     */
    function createRegistryPool(
        string memory name,
        address implementation,
        uint256 closeFactor,
        uint256 liquidationIncentive,
        address priceOracle
    ) external virtual returns (uint256, address) {
        // Input validation
        require(
            implementation != address(0),
            "RegistryPool: Invalid Comptroller implementation address."
        );
        require(
            priceOracle != address(0),
            "RegistryPool: Invalid PriceOracle address."
        );

        // Setup Unitroller(Proxy)
        Unitroller unitroller = new Unitroller();
        address proxy = address(unitroller);
        require(
            unitroller._setPendingImplementation(implementation) == 0,
            "RegistryPool: Failed to set pending implementation in Unitroller."
        );
        Comptroller comptrollerImplementation = Comptroller(implementation);
        comptrollerImplementation._become(unitroller);
        Comptroller comptrollerProxy = Comptroller(proxy);

        // Set Venus pool parameters
        require(
            comptrollerProxy._setCloseFactor(closeFactor) == 0,
            "RegistryPool: Failed to set close factor of Pool."
        );
        require(
            comptrollerProxy._setLiquidationIncentive(liquidationIncentive) ==
                0,
            "RegistryPool: Failed to set liquidation incentive of Pool."
        );
        require(
            comptrollerProxy._setPriceOracle(PriceOracle(priceOracle)) == 0,
            "RegistryPool: Failed to set price oracle of Pool."
        );

        // Make msg.sender the admin
        require(
            unitroller._setPendingAdmin(msg.sender) == 0,
            "RegistryPool: Failed to set pending admin in Unitroller."
        );

        // Register the pool with this PoolRegistry
        return (_registerPool(name, proxy), proxy);
    }

    /**
     * @notice Modify existing Venus pool name.
     */
    function setPoolName(uint256 index, string calldata name) external {
        Comptroller _comptroller = Comptroller(_poolsByID[index].comptroller);

        // Note: Compiler throws stack to deep if autoformatted with Prettier
        // prettier-ignore
        require(msg.sender == _comptroller.admin() || msg.sender == owner());

        _poolsByID[index].name = name;
    }

    /**
     * @notice Returns arrays of all Venus pools' data.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
     */
    function getAllPools() external view returns (VenusPool[] memory) {
        return _poolsByID;
    }

    /**
     * @notice Returns Venus pool by PoolID.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
     */
    function getPoolByID(uint256 index) external view returns (VenusPool memory) {
        return _poolsByID[index];
    }

    /**
     * @notice Returns arrays of all public Fuse pool indexes and data.
     * @dev This function is not designed to be called in a transaction: it is too gas-intensive.
     */
    function getPublicPools()
        external
        view
        returns (uint256[] memory, VenusPool[] memory)
    {
        uint256 poolsLength = _poolsByID.length;

        uint256[] memory PoolIndexes = new uint256[](poolsLength);
        VenusPool[] memory publicPools = new VenusPool[](poolsLength);
        uint256 index = 0;

        for (uint256 i = 0; i < poolsLength; i++) {
            PoolIndexes[index] = i;
            publicPools[index] = _poolsByID[i];
            index++;
        }

        return (PoolIndexes, publicPools);
    }

    /**
     * @notice Returns arrays of Fuse pool indexes and data created by `account`.
     */
    function getPoolsByAccount(address account)
        external
        view
        returns (uint256[] memory, VenusPool[] memory)
    {
        uint256[] memory indexes = new uint256[](
            _poolsByAccount[account].length
        );
        VenusPool[] memory accountPools = new VenusPool[](
            _poolsByAccount[account].length
        );

        for (uint256 i = 0; i < _poolsByAccount[account].length; i++) {
            indexes[i] = _poolsByAccount[account][i];
            accountPools[i] = _poolsByID[_poolsByAccount[account][i]];
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

}