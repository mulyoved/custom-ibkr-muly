import {IBApi, EventName, ErrorCode, Contract, Order, OrderAction} from '@stoqey/ib';
import {IB_HOST, IB_PORT} from '../../config';
import {IBKREVENTS} from '../../events';
import {IbkrEvents} from '../../events/IbkrEvents';
import {OrderWithContract} from '../orders.interfaces';
import {OrderType} from '..';
import OrderCondition from './condition/order-condition';

const ibkrEvents = IbkrEvents.Instance;

export class ConditionOrders {
    ib: IBApi = null;

    private static _instance: ConditionOrders;

    processing = false;

    public static get Instance(): ConditionOrders {
        return this._instance || (this._instance = new this());
    }

    private constructor() {
        const self = this;

        ibkrEvents.on(EventName.connected, async () => {
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
            // create IBApi object

            const ib = new IBApi({
                // clientId: 0,
                host: IB_HOST,
                port: IB_PORT,
            });

            self.ib = ib;

            ib.connect();
        }
    };

    /**
     * Place an order with condition or update an order.
     * @param order Order to place
     * @param contract Contract to place the order
     * @param orderUpdateId optional - OrderId to update
     * @param transmitUpd optional - If you put an OrderId and you want to transmit the update send true.
     */
    public placeOrder = async (
        order: Order,
        contract: Contract,
        orderUpdateId?: number,
        transmitUpd?: boolean
    ): Promise<void> => {
        const self = this;
        const ib: IBApi = self.ib;

        ib.on(EventName.error, (err: Error, code: ErrorCode, reqId: number) => {
            console.error(`${err.message} - code: ${code} - reqId: ${reqId}`, err.stack);
        }).once(EventName.nextValidId, (orderId: number) => {
            const setOrderId = orderUpdateId ? orderUpdateId : orderId;
            const {transmit, ...orderWithoutTransmit} = order;
            const setTransmit = transmitUpd ? transmitUpd : transmit;
            const orderWithId: Order = {
                ...orderWithoutTransmit,
                orderId: setOrderId,
                transmit: setTransmit,
            };
            ib.placeOrder(setOrderId, contract, orderWithId);
        });

        ib.reqIds();
    };

    /**
     * Place a bracket order, you can use conditions here.
     * @param order Order to place
     * @param contract Contract to place the order
     * @param takeProfitLimitPrice Limit price of the take profit
     * @param stopLossPrice Stop loss aux price
     */
    public placeBracketOrder = async (
        order: Order,
        contract: Contract,
        takeProfitLimitPrice: number,
        stopLossPrice: number,
        conditions?: OrderCondition[]
    ): Promise<void> => {
        const self = this;
        const ib: IBApi = self.ib;

        ib.on(EventName.error, (err: Error, code: ErrorCode, reqId: number) => {
            console.error(`${err.message} - code: ${code} - reqId: ${reqId}`, err.stack);
        }).once(EventName.nextValidId, (orderId: number) => {
            const {transmit, ...orderWithoutTransmit} = order;
            const parentOrder: Order = {
                ...orderWithoutTransmit,
                orderId,
                // The parent and children orders will need this attribute set to false to prevent accidental executions.
                // The LAST CHILD will have it set to true.
                transmit: false,
            };

            const takeProfit: Order = {
                orderId: orderId + 1,
                action: orderWithoutTransmit.action === 'BUY' ? OrderAction.SELL : OrderAction.BUY,
                orderType: OrderType.LMT,
                totalQuantity: orderWithoutTransmit.totalQuantity,
                lmtPrice: takeProfitLimitPrice,
                parentId: parentOrder.orderId,
                transmit: false,
                smartComboRoutingParams: order.smartComboRoutingParams,
            };

            const stopLoss: Order = {
                orderId: orderId + 2,
                action: orderWithoutTransmit.action === 'BUY' ? OrderAction.SELL : OrderAction.BUY,
                orderType: OrderType.STP,
                // Stop trigger price
                auxPrice: stopLossPrice,
                totalQuantity: orderWithoutTransmit.totalQuantity,
                parentId: parentOrder.orderId,
                // In this case, the low side order will be the last child being sent. Therefore, it needs to set this attribute to true
                // to activate all its predecessors
                transmit: false,
                smartComboRoutingParams: order.smartComboRoutingParams,
            };

            const orders = [parentOrder, takeProfit, stopLoss];

            if (conditions) {
                const orderExit: Order = {
                    orderId: orderId + 3,
                    action:
                        orderWithoutTransmit.action === 'BUY' ? OrderAction.SELL : OrderAction.BUY,
                    orderType: OrderType.MKT,
                    totalQuantity: orderWithoutTransmit.totalQuantity,
                    parentId: parentOrder.orderId,
                    conditions,
                    transmit,
                    smartComboRoutingParams: order.smartComboRoutingParams,
                };
                orders.push(orderExit);
            }

            orders.forEach((or) => {
                ib.placeOrder(or.orderId, contract, or);
            });
        });

        ib.reqIds();
    };

    /**
     * Converts OrderWithContract object into an Order object to use in update or modifications.
     * @param orderWithContract To convert into an Order
     * @returns Order object from orderWithContract data
     */
    public convertToOrder(orderWithContract: OrderWithContract): Order {
        const evaluate: Order = {
            orderId: 0,
            action: OrderAction.BUY,
            totalQuantity: 0,
            orderType: OrderType.LMT,
            lmtPrice: 0,
            auxPrice: 0,
            parentId: 0,
        };

        for (const key in orderWithContract) {
            if (Object.prototype.hasOwnProperty.call(orderWithContract, key)) {
                if (key in evaluate) {
                } else {
                    delete orderWithContract[key];
                }
            }
        }
        return orderWithContract as Order;
    }
}
