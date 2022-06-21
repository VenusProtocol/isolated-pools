FROM ubuntu:18.04

RUN apt -y update
RUN apt -y install curl git wget make build-essential libusb-1.0-0-dev
RUN apt install -y software-properties-common && add-apt-repository ppa:deadsnakes/ppa && apt update && apt install -y python3.8
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3 1
SHELL ["/bin/bash", "-c"]
RUN curl -sL https://deb.nodesource.com/setup_12.x | bash
RUN apt -y install nodejs
RUN wget https://github.com/ethereum/solidity/releases/download/v0.8.13/solc-static-linux -O /usr/bin/solc && chmod +x /usr/bin/solc

RUN mkdir -p /compound-protocol
WORKDIR /compound-protocol

# First add deps
ADD . /compound-protocol
RUN npm install -g yarn
RUN yarn install

CMD while :; do sleep 2073600; done
