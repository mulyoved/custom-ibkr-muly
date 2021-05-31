import 'mocha';
import {expect} from 'chai';
import {Orders} from './Orders';
import {
    OrderWithContract,
    OrderStatus,
    ComboLeg,
    TagValue,
    Order,
    Contract,
    SecType,
} from './orders.interfaces';
import {IbkrEvents, IBKREVENTS} from '../events';
import ibkr from '..';
import {log} from '../log';
import {OptionType} from '.';
import {ContractDetailsParams, getContractDetails} from '../contracts';
import OrderAction from './ConditionOrders/enum/order-action';
import OrderType from './ConditionOrders/enum/orderType';

const ibkrEvents = IbkrEvents.Instance;

const symbolZ = 'EUR';
const symbolY = 'ACHC'; // portfolio
const symbolX = 'FB';
const symbolOpt = 'GOOG';
const symbolXcfd = 'NFLX';
const symbolXind = 'DAX';
const symbolFut = 'L';

// CASH | FOREX
const forexOrderBuyInZ: Order = {
    action: OrderAction.BUY,
    orderType: OrderType.MKT,
    totalQuantity: 3,
};

const forexContractBuyInZ: Contract = {
    symbol: symbolZ,
    secType: SecType.CASH,
    currency: 'USD',
    exchange: 'IDEALPRO',
};

// STK | STOCK
const stockOrderBuyInY: Order = {
    action: OrderAction.BUY,
    orderType: OrderType.MKT,
    totalQuantity: 3,
};

const stockContractBuyInY: Contract = {
    secType: SecType.STK,
    symbol: symbolY, // portfolio
    exchange: 'SMART',
};

const stockOrderBuyInX: Order = {
    action: OrderAction.BUY,
    orderType: OrderType.MKT,
    totalQuantity: 3,
};

const stockContractBuyInX: Contract = {
    secType: SecType.STK,
    symbol: symbolX,
    exchange: 'SMART',
};

// OPT | OPTIONS
const optionOrderBuy: Order = {
    action: OrderAction.BUY,
    orderType: OrderType.MKT,
    totalQuantity: 3,
};

const optionContractBuy: Contract = {
    secType: SecType.OPT,
    symbol: symbolOpt,
    lastTradeDateOrContractMonth: '20210820',
    strike: 2380,
    right: OptionType.Put,
    exchange: 'SMART',
};

// CFD
const cfdOrderBuyInX: Order = {
    action: OrderAction.BUY,
    orderType: OrderType.MKT,
    totalQuantity: 3,
};

const cfdContractBuyInX: Contract = {
    secType: SecType.CFD,
    symbol: symbolXcfd,
    exchange: 'SMART',
};

// IND | INDEX
const indOrderBuyInX: Order = {
    action: OrderAction.BUY,
    orderType: OrderType.MKT,
    totalQuantity: 3,
};

const indContractBuyInX: Contract = {
    secType: SecType.IND,
    symbol: symbolXind,
    exchange: 'DTB',
    currency: 'EUR',
};

// FUT | FUTURE
const futureOrderBuyInX: Order = {
    action: OrderAction.BUY,
    orderType: OrderType.MKT,
    totalQuantity: 3,
};

const futureContractBuyInX: Contract = {
    secType: SecType.FUT,
    symbol: symbolFut,
    lastTradeDateOrContractMonth: '20210721',
    currency: 'GBP',
    exchange: 'ICEEU',
    multiplier: 1250,
};

// FOP | Future Options
const fopOrderBuy: Order = {
    action: OrderAction.BUY,
    orderType: OrderType.MKT,
    totalQuantity: 1,
};

const fopContractBuy: Contract = {
    secType: SecType.FOP,
    symbol: symbolFut,
    lastTradeDateOrContractMonth: '20220615',
    strike: 99,
    right: OptionType.Call,
    currency: 'GBP',
    exchange: 'ICEEU',
    multiplier: 1250,
};

async function getAllContractDetails(): Promise<ComboLeg[]> {
    let m_contract_object1: ContractDetailsParams = {
        secType: 'STK',
        symbol: 'EWA',
        currency: 'USD',
        exchange: 'SMART',
    };

    let m_contract_object2: ContractDetailsParams = {
        secType: 'STK',
        symbol: 'EWC',
        currency: 'USD',
        exchange: 'SMART',
    };
    const cdetails1 = await getContractDetails(m_contract_object1);
    const cdetails2 = await getContractDetails(m_contract_object2);

    const leg1: ComboLeg = {
        conId: cdetails1[0].contract.conId,
        ratio: 1,
        action: 'BUY',
        exchange: 'SMART',
    };
    const leg2: ComboLeg = {
        conId: cdetails2[0].contract.conId,
        ratio: 1,
        action: 'SELL',
        exchange: 'SMART',
    };

    return [leg1, leg2];
}

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
        }
        expect(results).to.be.not.null;
    });

    it('Place Order', (done) => {
        let completed = false;
        const orderTrade = Orders.Instance;

        const getPlacedOrder = async () => {
            const handleData = (data) => {
                ibkrEvents.off(IBKREVENTS.ORDER_FILLED, handleData);
                if (!completed) {
                    done();
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

            const opt = {unique: true};

            // BAG | COMBO | SPREAD
            const tagValue: TagValue = {tag: 'NonGuaranteed', value: '1'};
            const comboOrderBuyInX: Order = {
                action: OrderAction.BUY,
                orderType: OrderType.MKT,
                totalQuantity: 1,
                smartComboRoutingParams: [tagValue],
            };

            const comboContractBuyInX: Contract = {
                secType: SecType.BAG,
                symbol: 'EWA',
                currency: 'USD',
                exchange: 'SMART',
                comboLegs: await getAllContractDetails(),
            };

            const orders = [
                async () => orderTrade.placeOrder(stockContractBuyInX, stockOrderBuyInX, opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(stockContractBuyInY, stockOrderBuyInY, opt), // portfolio
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(forexContractBuyInZ, forexOrderBuyInZ, opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(cfdContractBuyInX, cfdOrderBuyInX, opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(indContractBuyInX, indOrderBuyInX, opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(futureContractBuyInX, futureOrderBuyInX, opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(optionContractBuy, optionOrderBuy, opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(fopContractBuy, fopOrderBuy, opt),
                async () => delay(delayTime),
                async () => orderTrade.placeOrder(comboContractBuyInX, comboOrderBuyInX, opt),
                async () => delay(delayTime),
            ];

            for (const order of orders) {
                await order();
            }
        };

        getPlacedOrder();
    });
});
