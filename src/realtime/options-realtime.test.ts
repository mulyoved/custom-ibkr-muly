import 'mocha';
import {IBApi, EventName, ErrorCode, OptionTypeIB} from './options-realtime';
import {Contract, SecTypeCondition} from '../orders/ConditionOrders/condition-order.interfaces';

const ibApi = new IBApi({
    // clientId: 0,
    // host: '127.0.0.1',
    port: 7497,
});

describe('Realtime', () => {
    it('should get options prices', (done) => {
        const getData = async () => {
            ibApi
                .on(EventName.error, (err: Error, code: ErrorCode, reqId: number) => {
                    console.error(`${err.message} - code: ${code} - reqId: ${reqId}`);
                })
                .on(
                    EventName.tickOptionComputation,
                    (
                        tickerId,
                        field,
                        tickAttrib,
                        impliedVolatility,
                        delta,
                        optPrice,
                        pvDividend,
                        gamma,
                        vega,
                        theta,
                        undPrice
                    ) => {
                        console.log(
                            `tickerId: ${tickerId} - field: ${field} - tickAttrib: ${tickAttrib} - impliedVolatility: ${impliedVolatility} - delta: ${delta} - optPrice: ${optPrice} - pvDividend: ${pvDividend} - gamma: ${gamma} - vega: ${vega} - theta: ${theta} - undPrice: ${undPrice}`
                        );
                    }
                )
                .on(EventName.tickPrice, (tickerId, field, value, attribs) => {
                    console.log(
                        `tickerId: ${tickerId} - field: ${field} - value: ${value} - attribs: ${attribs}`
                    );
                })
                .on(
                    EventName.tickByTickAllLast,
                    (reqId, tickType, time, price, size, tickAttribLast) => {
                        console.log(
                            `reqId: ${reqId} - tickType: ${tickType} - time: ${time} - price: ${price} - size: ${size} - tickAttribLast: ${tickAttribLast}`
                        );
                    }
                );

            const leContract: Contract = {
                exchange: 'SMART',
                conId: 456051881,
                multiplier: 100,
                secType: SecTypeCondition.OPT,
                strike: 120,
                lastTradeDateOrContractMonth: '20210716',
                symbol: 'AAPL',
                right: OptionTypeIB.Call,
                localSymbol: 'AAPL  210716C00120000',
            };

            const underlying: Contract = {
                exchange: 'SMART',
                symbol: 'AAPL',
                secType: SecTypeCondition.STK,
                currency: 'USD',
            };
            ibApi.connect();
            ibApi.reqMarketDataType(4);
            setTimeout(async () => {
                // ibApi.reqMktData(9922, underlying, '', true, false);
                ibApi.reqMktData(9923, leContract, '', true, false);
            }, 1000);
            // ibApi.calculateOptionPrice(9026, leContract, 0.2814667842630517, value);
        };
        getData();
    });
});
