#!/bin/bash

# Function to extract Solidity version from a contract file
get_solidity_version() {
    grep -Eo "pragma solidity \^?[0-9]+\.[0-9]+\.[0-9]+" "$1" | awk '{print $3}' | head -n 1 | tr -d '^'
}

# Check if Slither and solc-select are installed
if ! command -v slither &> /dev/null; then
    echo "❌ Error: Slither is not installed. Install it with: pip install slither-analyzer"
    exit 1
fi

if ! command -v solc-select &> /dev/null; then
    echo "❌ Error: solc-select is not installed. Install it from: https://github.com/crytic/solc-select"
    exit 1
fi

# Set the contract directory (modify this path if needed)
CONTRACT_DIR="./contracts"

# Check if contract directory exists
if [ ! -d "$CONTRACT_DIR" ]; then
    echo "❌ Error: Contract directory '$CONTRACT_DIR' not found!"
    exit 1
fi

echo "🔍 Searching for Solidity files in '$CONTRACT_DIR'..."

# Create a list to track installed versions
installed_versions=()

# Find and process each Solidity file
find "$CONTRACT_DIR" -type f -name "*.sol" | while read -r contract; do
    sol_version=$(get_solidity_version "$contract")

    if [ -z "$sol_version" ]; then
        echo "⚠️ Warning: Could not detect Solidity version in $contract"
        continue
    fi

    echo "🔹 Detected Solidity version: $sol_version for contract: $contract"

    # Remove `^` from version if present
    sol_version_cleaned=$(echo "$sol_version" | tr -d '^')

    # Check if version is already installed
    if [[ ! " ${installed_versions[@]} " =~ " $sol_version_cleaned " ]]; then
        echo "📥 Installing Solidity compiler version $sol_version_cleaned..."
        solc-select install "$sol_version_cleaned"
        installed_versions+=("$sol_version_cleaned")
    fi

    echo "🔄 Switching to Solidity $sol_version_cleaned..."
    solc-select use "$sol_version_cleaned"

    # Run Slither analysis
    echo "🔍 Running Slither on $contract..."
    slither "$contract" --solc-remaps "@openzeppelin=node_modules/@openzeppelin @venusprotocol=node_modules/@venusprotocol"

    echo "✅ Analysis complete for $contract"
done

echo "🎉 Static analysis completed for all Solidity files!"



