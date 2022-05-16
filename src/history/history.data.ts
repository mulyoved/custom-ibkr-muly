import includes from 'lodash/includes';
import moment from 'moment';
import isEmpty from 'lodash/isEmpty';
import ibkr, {EventName, Stock} from '@stoqey/ib';
import {getRadomReqId} from '../_utils/text.utils';
import IBKRConnection from '../connection/IBKRConnection';
import {IbkrEvents, publishDataToTopic, IBKREVENTS} from '../events';
import {
    HistoryData,
    SymbolWithTicker,
    ReqHistoricalData,
    GetMarketData,
} from './history.interfaces';
import {log} from '../log';
import {sortedMarketData} from './history.utils';
import {handleEventfulError} from '../events/HandleError';

const appEvents = IbkrEvents.Instance;

export class HistoricalData {
    ib: ibkr;
    historyData: {[x: string]: HistoryData[]} = {};
    historyDataDump: {[x: string]: {data: any[]}} = {};

    symbolsWithTicker: {tickerId: number; symbol: string}[] = [];

    private static _instance: HistoricalData;

    public static get Instance(): HistoricalData {
        return this._instance || (this._instance = new this());
    }

    private constructor() {
        const that = this;

        const ib = IBKRConnection.Instance.getIBKR();
        this.ib = ib;

        const endhistoricalData = (tickerId) => {
            ib.cancelHistoricalData(tickerId); // tickerId

            const currentSymbol = this.symbolsWithTicker.find((y) => y.tickerId === tickerId);

            if (isEmpty(currentSymbol)) {
                return null;
            }

            const allCollectedData =
                (this.historyDataDump[tickerId] && this.historyDataDump[tickerId].data) || [];

            // sort data by date
            const collectedData = sortedMarketData(allCollectedData);

            this.historyData = {
                ...this.historyData,
                [currentSymbol.symbol]: collectedData,
            };

            // Publish data to Random Generator
            const dataToPublish: {
                symbol: string;
                marketData: any[];
            } = {
                symbol: currentSymbol.symbol,
                marketData: collectedData,
            };

            publishDataToTopic({
                topic: IBKREVENTS.ON_MARKET_DATA,
                data: dataToPublish,
            });

            delete this.historyDataDump[tickerId];
        };

        ib.on(
            EventName.historicalData,
            (reqId, date, open, high, low, close, volume, barCount, WAP, hasGaps) => {
                if (includes([-1], open)) {
                    endhistoricalData(reqId);
                } else {
                    const currentSymbol = this.symbolsWithTicker.find((y) => y.tickerId === reqId);

                    const dateFormat = 'YYYYMMDD hh:mm:ss';

                    const newEntry: HistoryData = {
                        reqId,
                        date: moment(date, dateFormat).toDate(),
                        open,
                        high,
                        low,
                        close,
                        volume,
                        barCount,
                        WAP,
                        hasGaps,
                    };

                    if (!isEmpty(currentSymbol)) {
                        // Save into dumpData
                        this.historyDataDump = {
                            ...this.historyDataDump,
                            [reqId]: {
                                ...(this.historyDataDump[reqId] || null),
                                data: [
                                    ...((this.historyDataDump[reqId] &&
                                        this.historyDataDump[reqId].data) ||
                                        []),
                                    newEntry,
                                ],
                            },
                        };
                    }
                }
            }
        );

        // listen for any historicalData event
        appEvents.on(IBKREVENTS.GET_MARKET_DATA, (args: GetMarketData) => {
            // request History Data

            const {
                symbol,
                // contract = [symbol, 'SMART', 'USD'],
                endDateTime = '',
                durationStr = '1 D',
                barSizeSetting = '1 min',
                whatToShow = 'ASK',
            } = args;

            log(`on history data ${symbol}`);

            if (isEmpty(symbol)) {
                return;
            }

            // parse contract
            const ogContract = args.contract;
            let contract = ogContract;
            if (typeof ogContract === 'string' || !ogContract) {
                // make it a stock by default

                contract = new Stock(symbol, 'SMART', 'USD');
            }

            that.reqHistoryData(
                {
                    symbol,
                    tickerId: getRadomReqId(),
                },
                {
                    contract,
                    endDateTime,
                    durationStr,
                    barSizeSetting,
                    whatToShow,
                }
            );
        });
    }

    private reqHistoryData = (args: SymbolWithTicker, params: ReqHistoricalData): void => {
        const {tickerId, symbol} = args;

        log(`HistoricalData.reqHistoryData`, `Request historyData ${symbol}`);

        // Save this symbol in this class
        this.symbolsWithTicker.push(args);

        const {contract, endDateTime, durationStr, barSizeSetting, whatToShow} = params;

        //                   tickerId, contract,                    endDateTime, durationStr,             barSizeSetting,             whatToShow,             useRTH, formatDate, keepUpToDate
        this.ib.reqHistoricalData(
            tickerId,
            contract,
            endDateTime,
            durationStr || '1800 S',
            barSizeSetting || ('1 secs' as any),
            whatToShow || 'TRADES',
            1,
            1,
            false
        );
    };

    /**
     * Get historical data using events
     */
    public getHistoricalData = (args: GetMarketData): void => {
        publishDataToTopic({
            topic: IBKREVENTS.GET_MARKET_DATA,
            data: args,
        });
    };

    /**
     * ReqHistoricalData Async Promise
     */
    public reqHistoricalData = (args: GetMarketData): Promise<HistoryData[]> => {
        const self = this;
        const ib = self.ib;
        const tickerId = getRadomReqId();

        return new Promise((resolve) => {
            let done = false;

            const marketData: HistoryData[] = [];

            const {
                symbol,
                endDateTime = '',
                durationStr = '1 D',
                barSizeSetting = '1 min',
                whatToShow = 'ASK',
            } = args;

            // parse contract
            const ogContract = args.contract;
            let contract: any = ogContract;
            if (typeof ogContract === 'string' || !ogContract) {
                // make it a stock by default
                contract = new Stock(symbol, 'SMART', 'USD');
            }

            const endhistoricalData = (tickerId): void => {
                if (!done) {
                    done = true;

                    // remove listeners
                    ib.off(EventName.historicalData, onHistoricalData);
                    eventfulError(); // close eventful errors

                    // cancel market data
                    tickerId && ib.cancelHistoricalData(tickerId); // tickerId

                    const collectedData = sortedMarketData(marketData);
                    resolve(collectedData);
                }
            };

            const onHistoricalData = (
                reqId,
                date,
                open,
                high,
                low,
                close,
                volume,
                barCount,
                WAP,
                hasGaps
            ) => {
                if (includes([-1], open)) {
                    endhistoricalData(reqId);
                } else {
                    const currentSymbol = tickerId === reqId;
                    const dateFormat = 'YYYYMMDD hh:mm:ss';

                    const newEntry: HistoryData = {
                        reqId,
                        date: moment(date, dateFormat).toDate(),
                        open,
                        high,
                        low,
                        close,
                        volume,
                        barCount,
                        WAP,
                        hasGaps,
                    };

                    if (currentSymbol) {
                        marketData.push(newEntry);
                    }
                }
            };

            ib.on(EventName.historicalData, onHistoricalData);

            // TODO all more error messages
            // handleError
            const eventfulError = handleEventfulError(
                tickerId,
                [
                    `Historical data request pacing violation`,
                    `No historical market data for ${symbol}`,
                    `The contract description specified for ${symbol} is ambiguous.`,
                ],
                endhistoricalData
            );

            //                   tickerId, contract, endDateTime, durationStr,             barSizeSetting,             whatToShow,             useRTH, formatDate, keepUpToDate
            ib.reqHistoricalData(
                tickerId,
                contract,
                endDateTime,
                durationStr || '1800 S',
                barSizeSetting || ('1 secs' as any),
                whatToShow || 'TRADES',
                1,
                1,
                false
            );
        });
    };
}

export default HistoricalData;
