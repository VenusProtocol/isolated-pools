# Ensure npm 11.5.1 or later is installed
npm install -g npm@latest

cd slim

# Extract to PRE_RELEASE_TAG the tag in the version field of the package json, or the empty string if it doesn't exist
PRE_RELEASE_TAG=$(jq -r '.version | if test("-") then capture("^[0-9]+\\.[0-9]+\\.[0-9]+-(?<tag>[a-zA-Z-]+)") | .tag else "" end' package.json)

# Publish the package to a custom tag for slim versions
npm publish --provenance --access public --tag $PRE_RELEASE_TAG
