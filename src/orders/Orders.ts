import IB from '@stoqey/ib';
import isEmpty from 'lodash/isEmpty';
import findIndex from 'lodash/findIndex';
import compact from 'lodash/compact';
import {
    ORDER,
    OrderState,
    CreateSale,
    OrderWithContract,
    OrderStatus,
    OrderStatusType,
    OrderGeneral,
    ContractDictionary,
    ContractType,
    ContractEnum,
    OrderFop,
    OrderOption,
    OrderFuture,
    OrderForex,
    OrderCombo,
    ComboLeg,
} from './orders.interfaces';

import {publishDataToTopic, IbkrEvents, IBKREVENTS} from '../events';
import IBKRConnection from '../connection/IBKRConnection';
import {log, verbose} from '../log';
import {createSymbolAndTickerId} from './Orders.util';
import {handleEventfulError} from '../events/HandleError';

const ibkrEvents = IbkrEvents.Instance;

// Place Order + Cancel Order
// Get Filled open orders

interface SymbolTickerOrder {
    id: string;
    tickerId: number;
    orderPermId?: number; // for reference when closing it
    symbol: string;
    contractOrderRequest: OrderGeneral;
    orderStatus?: OrderStatusType;
}

export class Orders {
    ib: IB = null;

    // ContractOrders
    tickerId = 0;
    processing = false;

    /**
     * Orders to be taken from nextValidId
     * These are always deleted after order is submitted to IB
     */
    contractOrders: OrderGeneral[] = [];

    timeoutRetries: {[x: string]: NodeJS.Timeout[]} = {};

    /**
     * A ledger of orders that are being executed,
     * This is to avoid duplicate orders
     * @unique
     * new order overrides old one
     * only filled, canceled, error orders can be overridden
     */
    tickersAndOrders: SymbolTickerOrder[] = [];

    /**
     * Redundant orderIdNext recorded
     */
    orderIdNext: number = null;

    // OPEN ORDERS
    // public openOrders: {[x: string]: OrderWithContract} = {};

    public openedOrders: OrderWithContract[] = [];

    public receivedOrders = false; // stopper

    private static _instance: Orders;

    public static get Instance(): Orders {
        return this._instance || (this._instance = new this());
    }

    private constructor() {
        const self = this;

        // only when connected createSale
        ibkrEvents.on(IBKREVENTS.CONNECTED, async () => {
            self.init();
        });

        ibkrEvents.emit(IBKREVENTS.PING); // ping connection
    }

    /**
     * init
     */
    public init = async (): Promise<void> => {
        const self = this;

        if (!self.ib) {
            const ib = IBKRConnection.Instance.getIBKR();
            self.ib = ib;

            ib.on('openOrderEnd', () => {
                // Initialise OrderTrader
                // OrderTrade.Instance.init();
                publishDataToTopic({
                    topic: IBKREVENTS.OPEN_ORDERS,
                    data: self.openedOrders,
                });
            });

            ib.on(
                'orderStatus',
                (
                    id,
                    status,
                    filled,
                    remaining,
                    avgFillPrice,
                    permId,
                    parentId,
                    lastFillPrice,
                    clientId,
                    whyHeld
                ) => {
                    const currentOrder = self.openedOrders.find((oo) => oo.orderId === id);

                    const orderStatus: OrderStatus = {
                        status,
                        filled,
                        remaining,
                        avgFillPrice,
                        permId,
                        parentId,
                        lastFillPrice,
                        clientId,
                        whyHeld,
                    };

                    publishDataToTopic({
                        topic: IBKREVENTS.ORDER_STATUS, //push to topic below,
                        data: {
                            order: currentOrder,
                            orderStatus,
                        },
                    });

                    verbose(
                        `Orders > orderStatus ${currentOrder && currentOrder.symbol}`,
                        JSON.stringify({
                            id,
                            status,
                            filled,
                            remaining,
                            symbol: currentOrder && currentOrder.symbol,
                        })
                    );
                }
            );

            ib.on('openOrder', (orderId, contract, order: ORDER, orderState: OrderState) => {
                // 1. Update OpenOrders
                // Orders that need to be filled
                // -----------------------------------------------------------------------------------
                self.receivedOrders = true;

                const openedOrders = self.openedOrders;

                const currentOrderindex = findIndex(openedOrders, {orderId});
                openedOrders[currentOrderindex] = {
                    // OrderId + orderState
                    orderId,
                    orderState,

                    // Add order
                    ...order,
                    // Add contract
                    ...contract,
                };

                // update orders
                self.openedOrders = compact(openedOrders);

                //  Delete order from openOrders list
                if (orderState.status === 'Filled') {
                    log(
                        `Filled -----> DELETE FROM OPEN ORDERS -------> symbol=${
                            contract && contract.symbol
                        }`
                    );

                    // update orders
                    self.openedOrders = compact(
                        (self.openedOrders || []).filter((i) => i.orderId !== orderId)
                    );
                }

                //  Delete order from openOrders list
                if (['PendingCancel', 'Cancelled', 'ApiCancelled'].includes(orderState.status)) {
                    log(
                        `${orderState.status} -----> DELETE FROM OPEN ORDERS -------> ${
                            contract && contract.symbol
                        }`
                    );
                    self.openedOrders = compact(
                        (self.openedOrders || []).filter((i) => i.orderId !== orderId)
                    );
                }

                const openOrdersArr = self.openedOrders;
                log(`OPEN ORDERS ${openOrdersArr && openOrdersArr.length}`);
                // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
                // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

                // 2. Update OrderContracts
                // Orders requests to send to transmit
                // Using ticker Ids
                // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
                const allTickerOrder: SymbolTickerOrder[] = self.tickersAndOrders;

                const thisOrderTicker = allTickerOrder.find(
                    (tickerOrder) => tickerOrder.tickerId === orderId
                );

                // Add permId to orderTickObject
                if (!isEmpty(thisOrderTicker)) {
                    let updatedSymbolTicker: SymbolTickerOrder = null;
                    // update this symbolTickerOrder
                    self.tickersAndOrders = self.tickersAndOrders.map((i) => {
                        if (i.tickerId === orderId) {
                            const updatedSymbolTickerX = {
                                ...i,
                                orderPermId: order.permId,
                                symbol: thisOrderTicker.symbol,
                                orderStatus: orderState.status, // update order state
                            };
                            updatedSymbolTicker = updatedSymbolTickerX;
                            return updatedSymbolTickerX;
                        }
                        return i;
                    });

                    // create sale if order is filled
                    if (orderState.status === 'Filled') {
                        // Order is filled we can record it
                        // Check if we can create new trade
                        // on if contractOrderRequest is present
                        // that.symbolsTickerOrder[thisOrderTicker.symbol]
                        if (!isEmpty(updatedSymbolTicker.contractOrderRequest)) {
                            const {contractOrderRequest} = updatedSymbolTicker;
                            const {exitTrade, exitParams, symbol, capital} = contractOrderRequest;

                            const dataSaleSymbolOrder: OrderWithContract = {
                                ...order,
                                ...contract,
                                orderState,
                                orderId,
                            };

                            if (exitTrade) {
                                const {exitPrice, exitTime, entryTime, entryPrice} = exitParams;
                                // If this trade is for exiting then record the sale
                                // create sale now
                                const newSale: CreateSale = {
                                    capital,
                                    exitPrice,
                                    exitTime,
                                    entryTime,
                                    entryPrice,
                                    symbol,
                                    profit: entryPrice - exitPrice,
                                };

                                log(
                                    `AccountOrderContract.openOrder`,
                                    `FILLED, TO CREATE SALE -> ${contract.symbol} ${order.action} ${order.totalQuantity}  ${orderState.status}`
                                );

                                return publishDataToTopic({
                                    topic: IBKREVENTS.ORDER_FILLED,
                                    data: {sale: newSale, order: dataSaleSymbolOrder},
                                });
                            }

                            log(
                                `AccountOrderContract.openOrder`,
                                `FILLED, but no sale created -> ${contract.symbol} ${order.action} ${order.totalQuantity}  ${orderState.status}`
                            );

                            publishDataToTopic({
                                topic: IBKREVENTS.ORDER_FILLED,
                                data: {sale: null, order: dataSaleSymbolOrder},
                            });
                        }
                    }
                }
            });

            // placeOrder event
            ibkrEvents.on(
                IBKREVENTS.PLACE_ORDER,
                async ({contractOrder}: {contractOrder: OrderGeneral}) => {
                    await self.placeOrder(contractOrder);
                }
            );
        }
    };

    public getOpenOrders = async (): Promise<OrderWithContract[]> => {
        const self = this;
        const openedOrders: OrderWithContract[] = [];

        return new Promise((resolve) => {
            let done = false;
            // listen for account summary
            const handleOpenOrders = (ordersData) => {
                if (!done) {
                    self.ib.off('openOrder', handleOpenOrders);
                    self.ib.off('openOrderEnd', openOrderEnd);
                    done = true;

                    // update  openedOrders
                    self.openedOrders = ordersData;

                    return resolve(ordersData);
                }
            };

            const openOrderEnd = () => {
                handleOpenOrders(openedOrders);
            };

            self.ib.once('openOrderEnd', openOrderEnd);

            self.ib.on(
                'openOrder',
                function (orderId, contract, order: ORDER, orderState: OrderState) {
                    // Only check pending orders
                    if (
                        ['PendingSubmit', 'PreSubmitted', 'Submitted'].includes(orderState.status)
                    ) {
                        openedOrders.push({
                            // OrderId + orderState
                            orderId,
                            orderState,

                            // Add order
                            ...order,
                            // Add contract
                            ...contract,
                        });
                    }
                }
            );

            self.ib.reqAllOpenOrders(); // refresh orders

            return;
        });
    };

    public isActive = (): boolean => {
        return this.receivedOrders;
    };

    /**
     * Place Order
     * Order is added to queue if is already processing one order
     * @contractOrder
     * @contractType "fop" | "future" | "option" | "stock" | "combo" | "cfd" | "forex" | "ind"
     * required in order to correctly place an order
     * @options ? {}
     * @when Until IBKR releases a new OrderId, then order is placed and process can pick other orders
     */
    public placeOrder = async (
        contractOrder: OrderGeneral,
        contractType?: ContractType,
        options?: {unique: boolean}
    ): Promise<any> => {
        const self = this;
        const ib = self.ib;

        const {symbol} = contractOrder;

        const shouldBeUniqueOrder = (options && options.unique) || false;

        const success = (): boolean => {
            ib.off('nextValidId', handleOrderIdNext);
            self.processing = false; // reset processing
            return true;
        };

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const erroredOut = (error?: Error): boolean => {
            ib.off('nextValidId', handleOrderIdNext);
            self.processing = false; // reset processing
            return false;
        };

        const checkPending = (): boolean => {
            // -1 Validate size
            const orderSize = contractOrder.size;

            const orderIsPending = () => {
                log(
                    'placingOrderNow',
                    `*********************** Order is already being processed for ${contractOrder.action} symbol=${symbol} `
                );
                return erroredOut();
            };

            if (Number.isNaN(orderSize)) {
                log(
                    'placingOrderNow.checkPending',
                    `*********************** orderSize is NaN size=${orderSize} action=${contractOrder.action} symbol=${symbol}`
                );
                return erroredOut();
            }

            /**
             * Check existing orders from tickersAndOrders
             */
            const currentOpenOrders = self.tickersAndOrders;

            const currentOpenOrdersSymbolId = currentOpenOrders.filter(
                (cos) => cos.symbol === symbol
            );

            verbose(
                'currentOpenOrdersSymbolId',
                JSON.stringify(currentOpenOrdersSymbolId.map((o) => o.symbol))
            );

            // Should check whether orders  in queue should be unique/ no duplicates
            if (!isEmpty(currentOpenOrdersSymbolId)) {
                const existingOrdersStatuses = currentOpenOrdersSymbolId.map((i) => i.orderStatus);

                const allOrdersThatArePending = existingOrdersStatuses.filter((status) =>
                    ['PreSubmitted', 'Submitted', 'PendingSubmit'].includes(status)
                );

                if (shouldBeUniqueOrder) {
                    if (!isEmpty(allOrdersThatArePending)) {
                        return orderIsPending();
                    }
                }
            }

            /**
             * Check existing opened placed orders
             */
            const checkExistingOrders = self.openedOrders;

            log(
                'placingOrderNow',
                `Existing orders in queue -> ${(checkExistingOrders || []).map((i) => i.symbol)}`
            );

            if (!isEmpty(checkExistingOrders)) {
                // check if we have the same order from here
                const findMatchingAction = checkExistingOrders.filter(
                    (exi) =>
                        exi.action === contractOrder.action && exi.symbol === contractOrder.symbol
                );

                if (!isEmpty(findMatchingAction)) {
                    if (shouldBeUniqueOrder) {
                        log(
                            'placingOrderNow',
                            `Order already exist for ${contractOrder.action}, ${findMatchingAction[0].symbol} ->  @${contractOrder.parameters[0]}`
                        );
                        return erroredOut();
                    }
                }
            }
            return true;
        };

        const handleOrderIdNext = (orderIdNext: number) => {
            const tickerToUse = ++orderIdNext;

            const currentOrders = self.contractOrders;

            if (isEmpty(currentOrders)) {
                log('handleOrderIdNext', `Contract Orders are empty`);
                return erroredOut();
            }

            // get order by it's tickerId
            const contractOrder = self.contractOrders.shift();

            if (isEmpty(contractOrder)) {
                log('handleOrderIdNext', `First Contract Orders Item is empty`);
                return erroredOut();
            }

            const {symbol, size} = contractOrder;

            // eslint-disable-next-line @typescript-eslint/ban-types
            const orderCommand: Function = ib.order[contractOrder.type];

            const args = contractOrder.parameters;

            if (isEmpty(args)) {
                log('handleOrderIdNext', `Arguments cannot be null`);
                return erroredOut();
            }

            const tickerIdWithSymbol = createSymbolAndTickerId(symbol, tickerToUse);

            const oldTickerSymbol = self.tickersAndOrders.find((t) => t.id === tickerIdWithSymbol);

            if (oldTickerSymbol) {
                log('handleOrderIdNext', `Order already exists`);
                return erroredOut();
            }

            // Just save tickerId and contractOrder
            const tickerNOrder: SymbolTickerOrder = {
                id: tickerIdWithSymbol,
                tickerId: tickerToUse,
                symbol,
                orderStatus: 'PendingSubmit',
                contractOrderRequest: contractOrder, // for reference when closing trade,
            };

            type stock = ReturnType<typeof ib.contract.stock>;
            type cfd = ReturnType<typeof ib.contract.cfd>;
            type combo = ReturnType<typeof ib.contract.combo>;
            type forex = ReturnType<typeof ib.contract.forex>;
            type ind = ReturnType<typeof ib.contract.ind>;
            type future = ReturnType<typeof ib.contract.future>;
            type option = ReturnType<typeof ib.contract.option>;
            type fop = ReturnType<typeof ib.contract.fop>;

            type comboWithLegs = combo & {comboLegs: ComboLeg[]};

            type ValidTypes = stock | cfd | comboWithLegs | forex | ind | future | option | fop;

            const dict: ContractDictionary<ValidTypes> = {
                [ContractEnum.STOCK]: ib.contract.stock(contractOrder.symbol),
                [ContractEnum.CFD]: ib.contract.cfd(contractOrder.symbol),
                [ContractEnum.COMBO]: {
                    ...ib.contract.combo(
                        contractOrder.symbol,
                        (contractOrder as OrderCombo).currency,
                        (contractOrder as OrderCombo).exchange
                    ),
                    comboLegs: (contractOrder as OrderCombo).comboLegs,
                },
                [ContractEnum.IND]: ib.contract.ind(contractOrder.symbol),
                [ContractEnum.FOREX]: ib.contract.forex(
                    contractOrder.symbol,
                    (contractOrder as OrderForex).currency
                ),
                [ContractEnum.FUTURE]: ib.contract.future(
                    contractOrder.symbol,
                    (contractOrder as OrderFuture).expiry,
                    (contractOrder as OrderFuture).currency,
                    (contractOrder as OrderFuture).exchange,
                    (contractOrder as OrderFuture).multiplier
                ),
                [ContractEnum.OPTION]: ib.contract.option(
                    contractOrder.symbol,
                    (contractOrder as OrderOption).expiry,
                    (contractOrder as OrderOption).strike,
                    (contractOrder as OrderOption).right,
                    (contractOrder as OrderOption).exchange,
                    (contractOrder as OrderOption).currency
                ),
                [ContractEnum.FOP]: ib.contract.fop(
                    contractOrder.symbol,
                    (contractOrder as OrderFop).expiry,
                    (contractOrder as OrderFop).strike,
                    (contractOrder as OrderFop).right,
                    (contractOrder as OrderFop).multiplier,
                    (contractOrder as OrderFop).exchange,
                    (contractOrder as OrderFop).currency
                ),
            };

            // Place order
            if (contractOrder.kind === 'combo') {
                ib.placeOrder(tickerToUse, dict[contractType], {
                    ...orderCommand(contractOrder.action, ...args),
                    smartComboRoutingParams: contractOrder.smartComboRoutingParams,
                });
            } else {
                ib.placeOrder(
                    tickerToUse,
                    dict[contractType],
                    orderCommand(contractOrder.action, ...args)
                );
            }

            // Add it
            self.tickersAndOrders.push(tickerNOrder);
            self.tickerId = tickerToUse;
            ib.reqAllOpenOrders(); // refresh orders

            log(
                'handleOrderIdNext',
                `Placing order for ... tickerToUse=${tickerToUse} orderIdNext=${orderIdNext} tickerId=${self.tickerId} symbol=${symbol} size=${size}`
            );

            return success();
        };

        function placingOrderNow(): void {
            if (isEmpty(contractOrder.symbol)) {
                erroredOut(new Error('Please enter order'));
                return;
            }
            if (contractType === 'forex' && !(contractOrder as OrderForex).currency) {
                erroredOut(new Error('Please enter currency'));
                return;
            }
            if (
                (contractType === 'future' ||
                    contractType === 'fop' ||
                    contractType === 'option') &&
                !(contractOrder as OrderFuture).expiry
            ) {
                erroredOut(new Error('Please enter expiry'));
                return;
            }
            if (
                (contractType === 'fop' || contractType === 'option') &&
                !(contractOrder as OrderOption).strike
            ) {
                erroredOut(new Error('Please enter strike'));
                return;
            }
            if (
                (contractType === 'fop' || contractType === 'option') &&
                !(contractOrder as OrderOption).right
            ) {
                erroredOut(new Error('Please enter right'));
                return;
            }
            if (contractType !== contractOrder.kind) {
                erroredOut(new Error('Non matching contractType and contractOrder'));
                return;
            }

            self.contractOrders.push(contractOrder);
            self.ib.reqIds(++self.orderIdNext);
            verbose(
                'placingOrderNow',
                `Order > placeOrder -> tickerId=${self.tickerId} symbol=${contractOrder.symbol}`
            );
        }

        async function run(): Promise<void> {
            const canProceed = await checkPending();

            if (canProceed === true) {
                if (self.processing) {
                    return log(
                        `Broker is already processing an order for ${self.tickerId}`,
                        symbol
                    );
                }

                // Start -----------------------------
                self.processing = true;

                ib.on('nextValidId', handleOrderIdNext); // start envs
                return placingOrderNow();
            }
        }

        return run();
    };

    /**
     * cancelOrder
     * @param orderId: number
     */
    cancelOrder = async (orderId: number): Promise<boolean> => {
        const self = this;
        const ib = self.ib;
        return new Promise((res) => {
            const handleResults = (r: boolean) => {
                if (r) {
                    // update orders
                    self.openedOrders = compact(
                        (self.openedOrders || []).filter((i) => i.orderId !== orderId)
                    );
                }
                res(r);
                handleError();
            };

            // handleError
            const handleError = handleEventfulError(
                undefined,
                [`OrderId ${orderId} that needs to be cancelled is not found`],
                () => handleResults(false)
            );

            ib.cancelOrder(orderId);

            setTimeout(() => handleResults(true), 2000);
        });
    };
}

export default Orders;
