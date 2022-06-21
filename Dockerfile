FROM ubuntu:18.04

RUN apt -y update
RUN apt -y install curl git wget make gcc
SHELL ["/bin/bash", "-c"]
RUN curl -sL https://deb.nodesource.com/setup_12.x | bash
RUN apt -y install nodejs
RUN wget https://github.com/ethereum/solidity/releases/download/v0.8.13/solc-static-linux -O /usr/bin/solc && chmod +x /usr/bin/solc

RUN mkdir -p /compound-protocol
WORKDIR /compound-protocol

# First add deps
ADD ./package.json /compound-protocol
RUN npm install -g yarn
RUN yarn install

# Then rest of code and build
ADD . /compound-protocol

ENV SADDLE_CONTRACTS="contracts/*.sol contracts/**/*.sol"
RUN npx saddle compile

RUN yarn cache clean

CMD while :; do sleep 2073600; done
