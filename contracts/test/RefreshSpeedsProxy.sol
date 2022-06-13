pragma solidity ^0.8.4;

interface IComptroller {
	function refreshVenusSpeeds() external;
}

contract RefreshSpeedsProxy {
	constructor(address comptroller) public {
		IComptroller(comptroller).refreshVenusSpeeds();
	}
}
