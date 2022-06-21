FROM mhart/alpine-node:12.22.3

RUN apk update && apk add --no-cache --virtual build-dependencies git python g++ make
RUN wget https://github.com/ethereum/solidity/releases/download/v0.8.13/solc-static-linux -O /bin/solc && chmod +x /usr/solc

RUN mkdir -p /compound-protocol
WORKDIR /compound-protocol

# First add deps
ADD ./package.json /compound-protocol
RUN yarn install

# Then rest of code and build
ADD . /compound-protocol

CMD while :; do sleep 2073600; done
