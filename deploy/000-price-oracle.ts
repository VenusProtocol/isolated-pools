import deployOracle from '@venusprotocol/oracle/deploy/oracles';

deployOracle.skip = async () => process.env.PACKAGE == 'venus-governace';

export default deployOracle;
