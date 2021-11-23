import IB, {EventName, Order, Contract} from '@stoqey/ib';
import isEmpty from 'lodash/isEmpty';
import findIndex from 'lodash/findIndex';
import compact from 'lodash/compact';
import {
    CreateSale,
    OrderWithContract,
    OrderStatus,
    OrderStatusType,
    OrderBase,
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
    contractOrderRequest: OrderBase;
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
    contractOrders: Contract[] = [];

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

            ib.on(EventName.openOrderEnd, () => {
                // Initialise OrderTrader
                // OrderTrade.Instance.init();
                publishDataToTopic({
                    topic: IBKREVENTS.OPEN_ORDERS,
                    data: self.openedOrders,
                });
            });

            ib.on(EventName.error, (error, code, reqId) => {
                console.log(`ERROR: ${error} - code: ${code} - reqId: ${reqId}`);
            });

            ib.on(
                EventName.orderStatus,
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
                        status: status as any,
                        filled,
                        remaining,
                        avgFillPrice,
                        permId,
                        parentId,
                        lastFillPrice,
                        clientId,
                        whyHeld: whyHeld as any,
                    };

                    publishDataToTopic({
                        topic: IBKREVENTS.ORDER_STATUS, //push to topic below,
                        data: {
                            order: currentOrder,
                            orderStatus,
                            id,
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

            ib.on(EventName.openOrder, (orderId, contract, order, orderState) => {
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
                            const updatedSymbolTickerX: SymbolTickerOrder = {
                                ...i,
                                orderPermId: order.permId,
                                symbol: thisOrderTicker.symbol,
                                orderStatus: orderState.status as any, // update order state
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
                                    data: {sale: newSale, order: dataSaleSymbolOrder, contract},
                                });
                            }

                            log(
                                `AccountOrderContract.openOrder`,
                                `FILLED, but no sale created -> ${contract.symbol} ${order.action} ${order.totalQuantity}  ${orderState.status}`
                            );

                            publishDataToTopic({
                                topic: IBKREVENTS.ORDER_FILLED,
                                data: {sale: null, order: dataSaleSymbolOrder, contract},
                            });
                        }
                    }
                }
            });

            // placeOrder event
            ibkrEvents.on(
                IBKREVENTS.PLACE_ORDER,
                async ({contract}: {contract: Contract}, {order}: {order: Order}) => {
                    await self.placeOrder(contract, order);
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
                    self.ib.off(EventName.openOrder, handleOpenOrders);
                    self.ib.off(EventName.openOrderEnd, openOrderEnd);
                    done = true;

                    // update  openedOrders
                    self.openedOrders = ordersData;

                    return resolve(ordersData);
                }
            };

            const openOrderEnd = () => {
                handleOpenOrders(openedOrders);
            };

            self.ib.once(EventName.openOrderEnd, openOrderEnd);

            self.ib.on(EventName.openOrder, function (orderId, contract, order, orderState) {
                // Only check pending orders
                if (['PendingSubmit', 'PreSubmitted', 'Submitted'].includes(orderState.status)) {
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
            });

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
     * @order Order to place
     * @contract Contract to place the order
     * @options ? {}
     * @when Until IBKR releases a new OrderId, then order is placed and process can pick other orders
     */
    public placeOrder = async (
        contract: Contract,
        order: Order,
        options?: {unique: boolean}
    ): Promise<any> => {
        const self = this;
        const ib = self.ib;

        const {symbol} = contract;

        const shouldBeUniqueOrder = (options && options.unique) || false;

        const success = (): boolean => {
            ib.off(EventName.nextValidId, handleOrderIdNext);
            self.processing = false; // reset processing
            return true;
        };

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const erroredOut = (error?: Error): boolean => {
            ib.off(EventName.nextValidId, handleOrderIdNext);
            self.processing = false; // reset processing
            return false;
        };

        const checkPending = (): boolean => {
            // -1 Validate size
            const orderSize = order.totalQuantity;

            const orderIsPending = () => {
                log(
                    'placingOrderNow',
                    `*********************** Order is already being processed for ${order.action} symbol=${symbol} `
                );
                return erroredOut();
            };

            if (Number.isNaN(orderSize)) {
                log(
                    'placingOrderNow.checkPending',
                    `*********************** orderSize is NaN size=${orderSize} action=${order.action} symbol=${symbol}`
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
                    (exi) => exi.action === order.action && exi.symbol === contract.symbol
                );

                if (!isEmpty(findMatchingAction)) {
                    if (shouldBeUniqueOrder) {
                        log(
                            'placingOrderNow',
                            `Order already exist for ${order.action}, ${findMatchingAction[0].symbol} ->  @${order.lmtPrice}`
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

            const {symbol} = contractOrder;

            const args = order;

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

            // Place order
            ib.placeOrder(tickerToUse, contract, order);

            // Add it
            self.tickersAndOrders.push(tickerNOrder);
            self.tickerId = tickerToUse;
            ib.reqAllOpenOrders(); // refresh orders

            log(
                'handleOrderIdNext',
                `Placing order for ... tickerToUse=${tickerToUse} orderIdNext=${orderIdNext} tickerId=${self.tickerId} symbol=${symbol} size=${order.totalQuantity}`
            );

            return success();
        };

        function placingOrderNow(): void {
            if (isEmpty(contract.symbol)) {
                erroredOut(new Error('Please enter order'));
                return;
            }

            self.contractOrders.push(contract);
            self.ib.reqIds();
            verbose(
                'placingOrderNow',
                `Order > placeOrder -> tickerId=${self.tickerId} symbol=${contract.symbol}`
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

                ib.on(EventName.nextValidId, handleOrderIdNext); // start envs
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
