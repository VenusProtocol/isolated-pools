FROM mhart/alpine-node:12.22.3

RUN apk update && apk add --no-cache --virtual build-dependencies git python g++ make
RUN wget https://github.com/ethereum/solidity/releases/download/v0.8.13/solc-static-linux -O /usr/bin/solc && chmod +x /usr/bin/solc

RUN mkdir -p /compound-protocol
WORKDIR /compound-protocol

# First add deps
ADD ./package.json /compound-protocol
RUN yarn install

# Then rest of code and build
ADD . /compound-protocol

ENV SADDLE_SHELL=/bin/sh
ENV SADDLE_CONTRACTS="contracts/*.sol contracts/**/*.sol"
RUN npx saddle compile

RUN apk del build-dependencies
RUN yarn cache clean

CMD while :; do sleep 2073600; done
