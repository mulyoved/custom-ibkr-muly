import 'mocha';
import {expect} from 'chai';
import {Orders} from './Orders';
import { OrderWithContract, OrderStatus, OrderForex, OrderStock, OrderOption, OrderCfd, OrderCombo, OrderInd, OrderFuture, OrderFop } from './orders.interfaces';
import {IbkrEvents, IBKREVENTS} from '../events';
import ibkr from '..';
import {log} from '../log';
import { OptionType } from '.';

const ibkrEvents = IbkrEvents.Instance;

const symbolZ = 'EUR';
const symbolX = 'FB';
const symbolXcfd = 'NFLX';
const symbolXind = 'SET';
const symbolY = 'ACHC'; // portfolio
const orderParams = [1];

const forexOrderBuyInZ: OrderForex = {
    kind: "forex",
    symbol: symbolZ,
    action: 'BUY',
    type: 'market',
    parameters: orderParams, // 'SELL', 1, 9999,
    size: 3,
    capital: 1000,
    exitTrade: false,
    currency: "USD"
};

const stockOrderBuyInY: OrderStock = {
    kind: "stock",
    symbol: symbolY, // portfolio
    action: 'BUY',
    type: 'market',
    parameters: orderParams, // 'SELL', 1, 9999,
    size: 3,
    capital: 1000,
    exitTrade: false,
};

const stockOrderBuyInX: OrderStock = {
    kind: "stock",
    symbol: symbolX,
    action: 'BUY',
    type: 'market',
    parameters: orderParams, // 'SELL', 1, 9999,
    size: 3,
    capital: 1000,
    exitTrade: false,
};

const optionOrderBuyInM: OrderOption = {
    kind: "option",
    symbol: "GOOG",
    action: 'BUY',
    type: 'market',
    parameters: orderParams, // 'SELL', 1, 9999,
    size: 3,
    capital: 1000,
    exitTrade: false,
    expiry: "20210401",
    strike: "2055",
    right: OptionType.Put
};

const cfdOrderBuyInX: OrderCfd = {
    kind: "cfd",
    symbol: symbolXcfd,
    action: 'BUY',
    type: 'market',
    parameters: orderParams, // 'SELL', 1, 9999,
    size: 3,
    capital: 1000,
    exitTrade: false,
};

const comboOrderBuyInX: OrderCombo = {
    kind: "combo",
    symbol: "MMM",
    action: 'SELL',
    type: 'limit',
    parameters: [100, 193.97], // 'SELL', 1, 9999,
    size: 100,
    capital: 20000,
    exitTrade: false
};

const indOrderBuyInX: OrderInd = {
    kind: "ind",
    symbol: symbolXind,
    action: 'BUY',
    type: 'market',
    parameters: orderParams, // 'SELL', 1, 9999,
    size: 3,
    capital: 10000,
    exitTrade: false,
};

const futureOrderBuyInX: OrderFuture = {
    kind: "future",
    symbol: "L",
    action: 'BUY',
    type: 'market',
    parameters: orderParams, // 'SELL', 1, 9999,
    size: 3,
    capital: 1000,
    exitTrade: false,
    expiry: "202106",
    currency: "GBP",
    exchange: "ICEEU",
    multiplier: 1250
};

const fopOrderBuyInM: OrderFop = {
    kind: "fop",
    symbol: "L",
    action: 'BUY',
    type: 'market',
    parameters: orderParams, // 'SELL', 1, 9999,
    size: 1,
    capital: 1000,
    exitTrade: false,
    expiry: "20220615",
    strike: "99",
    right: OptionType.Call,
    currency: "GBP",
    exchange: "ICEEU",
    multiplier: 1250
};

function delay(t: number): Promise<any> {
    return new Promise(function (resolve) {
        setTimeout(resolve.bind(null, {d: true}), t);
    });
}

before((done) => {
    ibkr().then((started) => {
        if (started) {
            return done();
        }
        done(new Error('error starting ibkr'));
    });
});

describe('Orders', () => {
    it('should get open orders', async () => {
        const OrdersManager = Orders.Instance;

        log('connected now, placing order now');
        const results = await OrdersManager.getOpenOrders();

        log('Open orders are', JSON.stringify(results));

        for (const res of results) {
            OrdersManager.cancelOrder(res.orderId);
            await delay(1000);
        };
        expect(results).to.be.not.null;
    });

    it('Place Order', (done) => {

        let completed = false;
        const orderTrade = Orders.Instance;

        const getPlacedOrder = async () => {
            const handleData = (data) => {
                ibkrEvents.off(IBKREVENTS.ORDER_FILLED, handleData);
                if (!completed) {
                    done()
                    completed = true;
                }
            };
            // ibkrEvents.on(IBKREVENTS.ORDER_FILLED, handleData);

            // ibkrEvents.on(IBKREVENTS.ORDER_STATUS, (data: { order: OrderWithContract, orderStatus: OrderStatus }) => {

            //     const { order, orderStatus } = data;

            //     if (['PreSubmitted', 'Filled', 'Submitted'].includes(orderStatus.status)) {
            //         console.log('filled')
            //         if (!completed) {
            //             done()
            //             completed = true;
            //         }
            //     }

            // });

            await Orders.Instance.getOpenOrders();

            const delayTime = 1000;

            const opt = { unique: true };

            const orders = [
                async () => orderTrade.placeOrder(stockOrderBuyInX, "stock", opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(stockOrderBuyInY, "stock", opt), // portfolio
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(forexOrderBuyInZ, "forex", opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(cfdOrderBuyInX, "cfd", opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(indOrderBuyInX, "ind", opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(futureOrderBuyInX, "future", opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(optionOrderBuyInM, "option", opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(fopOrderBuyInM, "fop", opt),
                async () => delay(delayTime),

                async () => orderTrade.placeOrder(comboOrderBuyInX, "combo", opt),
                async () => delay(delayTime),
            ];

            for (const order of orders) {
                await order();
            }
        };

        getPlacedOrder();

    });
});
