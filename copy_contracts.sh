#! /bin/sh
# For convience we are going to copy contracts locally

rm -rf ./contracts/oracle
mkdir -p ./contracts/oracle
cp -rf ./node_modules/@venusprotocol/oracle/contracts/ ./contracts/oracle
