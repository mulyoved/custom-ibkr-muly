import {IBApi, EventName, ErrorCode, Contract, Order} from '@stoqey/ib-updated';
import {IB_HOST, IB_PORT} from '../../config';
import {IBKREVENTS} from '../../events';
import {IbkrEvents} from '../../events/IbkrEvents';

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
        }
    };

    public placeOrder = async (order: Order, contract: Contract): Promise<void> => {
        const self = this;
        const ib: IBApi = self.ib;

        ib.on(EventName.error, (err: Error, code: ErrorCode, reqId: number) => {
            console.error(`${err.message} - code: ${code} - reqId: ${reqId}`, err.stack);
        }).once(EventName.nextValidId, (orderId: number) => {
            const orderWithId: Order = {
                ...order,
                orderId,
            };
            ib.placeOrder(orderId, contract, orderWithId);
        });

        ib.connect();
        ib.reqIds();
    };
}
