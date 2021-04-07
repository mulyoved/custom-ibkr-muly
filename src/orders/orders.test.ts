import 'mocha';
import {expect} from 'chai';
import {Orders} from './Orders';
import { OrderWithContract, OrderStatus, OrderForex, OrderStock, OrderOption, OrderCfd, OrderCombo, OrderInd, OrderFuture, OrderFop, ComboLeg, TagValue } from './orders.interfaces';
import {IbkrEvents, IBKREVENTS} from '../events';
import ibkr from '..';
import {log} from '../log';
import { OptionType } from '.';
import { ContractDetailsParams, getContractDetails } from '../contracts';

const ibkrEvents = IbkrEvents.Instance;

const symbolZ = 'EUR';
const symbolX = 'FB';
const symbolXcfd = 'NFLX';
const symbolXind = 'SET';
const symbolY = 'ACHC'; // portfolio
const symbolOpt = "GOOG";
const symbolFut = "L";
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
    symbol: symbolOpt,
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

async function getAllContractDetails(): Promise<ComboLeg[]> {
    let m_contract_object1: ContractDetailsParams = {
        secType: 'STK',
        symbol: 'EWA',
        currency: 'USD',
        exchange: 'SMART'
    };
    
    let m_contract_object2: ContractDetailsParams = {
        secType: 'STK',
        symbol: 'EWC',
        currency: 'USD',
        exchange: 'SMART'
    };
    const cdetails1 = await getContractDetails(m_contract_object1)
    const cdetails2 = await getContractDetails(m_contract_object2)

    const leg1: ComboLeg = {
        conId: cdetails1[0].summary.conId,
        ratio: 1,
        action: "BUY",
        exchange: 'SMART'
    }
    const leg2: ComboLeg = {
        conId: cdetails2[0].summary.conId,
        ratio: 1,
        action: "SELL",
        exchange: 'SMART',
    }

    return [leg1, leg2];
}

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
    symbol: symbolFut,
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
    symbol: symbolFut,
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

            const tagValue: TagValue = { tag: 'NonGuaranteed', value: '1' };
            const comboOrderBuyInX: OrderCombo = {
                kind: "combo",
                symbol: "EWA",
                action: 'BUY',
                type: 'market',
                parameters: [1], // 'SELL', 1, 9999,
                size: 1,
                currency: 'USD',
                exchange: 'SMART',
                comboLegs: await getAllContractDetails(),
                smartComboRoutingParams: [tagValue]
            };

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
