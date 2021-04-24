import 'mocha';
import {expect} from 'chai';
import {ConditionOrders} from './ConditionOrders';
import { IbkrEvents } from '../../events/IbkrEvents';
import { SecTypeCondition, Contract, Order } from './condition-order.interfaces';
import { OrderActionCondition, Orders, OrderTypeCondition } from '..';
import ibkr from '../..';
import dotenv from 'dotenv';
import { ContractDetails, ContractDetailsParams, getContractDetails } from '../../contracts';
import { log } from '../../log';
import { IBKREVENTS } from '../../events/IBKREVENTS.const';
import PriceCondition from './condition/price-condition';
import ExecutionCondition from './condition/execution-condition';
import MarginCondition from './condition/margin-condition';
import PercentChangeCondition from './condition/percent-change-condition';
import TimeCondition from './condition/time-condition';
import VolumeCondition from './condition/volume-condition';
import TriggerMethod from './enum/trigger-method';
import ConjunctionConnection from './enum/conjunction-connection';
import { OptionType, OrderWithContract } from '../orders.interfaces';
import OrderAction from './enum/order-action';

const ibkrEvents = IbkrEvents.Instance;
const symbol = "A"
const symbolOpt = "GOOG";

const contract: Contract = {
    symbol,
    exchange: "NYSE",
    currency: "USD",
    secType: SecTypeCondition.STK
};

const order: Order = {
    orderType: OrderTypeCondition.OrderType.LMT,
    action: OrderActionCondition.OrderAction.BUY,
    totalQuantity: 10,
    lmtPrice: 100,
    transmit: true,
    conditionsIgnoreRth: true,
    conditionsCancelOrder: false
};

const optionContractBuyInM: Contract = {
    symbol: symbolOpt,
    lastTradeDateOrContractMonth: "20210618",
    strike: 2000,
    right: OptionType.Put,
    exchange: 'SMART',
    secType: SecTypeCondition.OPT
}

const optionOrderBuyInM: Order = {
    action: OrderAction.BUY,
    orderType: OrderTypeCondition.OrderType.MKT,
    totalQuantity: 3,
    conditionsIgnoreRth: true,
    conditionsCancelOrder: false
};

const optionOrderBuyInX: Order = {
    action: OrderAction.BUY,
    orderType: OrderTypeCondition.OrderType.LMT,
    totalQuantity: 3,
    lmtPrice: 100,
    conditionsIgnoreRth: true,
    conditionsCancelOrder: true
};

dotenv.config({path: '.env.test'});
const args = {
    port: Number(process.env.TEST_IBKR_PORT),
    host: process.env.TEST_IBKR_HOST,
};
// console.log('args:', args);

function delay(t: number): Promise<any> {
    return new Promise(function (resolve) {
        setTimeout(resolve.bind(null, {d: true}), t);
    });
}

before((done) => {
    ibkr(args).then((started) => {
        if (started) {
            return done();
        }
        done(new Error('error starting ibkr'));
    });
});
 // Note: Must use ISLAND if you want to refer to NASDAQ
describe('Condition Orders', () => {
    it('should get open orders', async () => {
        const OrderInstance = Orders.Instance;

        log('connected now, placing order now');
        const results = await OrderInstance.getOpenOrders();

        log('Open orders are', JSON.stringify(results));

        for (const res of results) {
            OrderInstance.cancelOrder(res.orderId);
            await delay(1000);
        };
        expect(results).to.be.not.null;
    });

    it('should get contracts', async () => {

        const contractDetails: ContractDetailsParams = {
            symbol: 'MMM',
            exchange: 'SMART',
            currency: 'USD', // Valid Currency
            secType: 'STK' // Provide a valid secType
        };

        const contracts: ContractDetails[] = await getContractDetails(contractDetails); // Or query contracts and choose one, use as contracts[i].summary.conId

        for (const conts of contracts) {
            log('Contracts based on query are', JSON.stringify(conts));
            await delay(1000);
        };
        expect(contracts).to.be.not.null;
    });

    it('Place Conditional Order', async (done) => {

        let completed = false;

        const getPlacedOrder = async () => {
            const handleData = (data) => {
                ibkrEvents.off(IBKREVENTS.ORDER_FILLED, handleData);
                if (!completed) {
                    done()
                    completed = true;
                }
            };

            const conditionOrderInstance = ConditionOrders.Instance;

            const contractDetails: ContractDetailsParams = {
                symbol: 'MMM',
                exchange: 'SMART',
                currency: 'USD', // Valid Currency
                secType: 'STK' // Provide a valid secType
            };
        
            const contracts: ContractDetails[] = await getContractDetails(contractDetails); // Query contracts and choose one, use as contracts[i].summary.conId
        
            log('Entered in callback');

             // Reference for parameters in conditions: https://interactivebrokers.github.io/tws-api/order_conditions.html
            const priceCondition: PriceCondition = new PriceCondition(10, TriggerMethod.Default, contracts[0].summary.conId, "SMART", true, ConjunctionConnection.AND);
            const execCondition: ExecutionCondition = new ExecutionCondition("ISLAND", SecTypeCondition.STK, "FB", ConjunctionConnection.OR);
            const marginCondition: MarginCondition = new MarginCondition(10, true, ConjunctionConnection.OR);
            const percentChangeCondition: PercentChangeCondition = new PercentChangeCondition(10, contracts[0].summary.conId, 'ISLAND', true, ConjunctionConnection.OR); // Exchange must be the same that the contract has
            const timeCondition: TimeCondition = new TimeCondition("20210428 11:32:50", true, ConjunctionConnection.OR);
            const volumeCondition: VolumeCondition = new VolumeCondition(500, contracts[0].summary.conId, "SMART", true, ConjunctionConnection.AND) // Volume in values of hundreds E.g.: 100, 200, 300...
            
            order.conditions = [priceCondition, execCondition, marginCondition, percentChangeCondition, timeCondition, volumeCondition];

            optionOrderBuyInM.conditions = [priceCondition, execCondition, marginCondition, percentChangeCondition, timeCondition, volumeCondition];

            const delayTime = 1000;

            const orders = [
                async () => conditionOrderInstance.placeOrder(order, contract),
                async () => delay(delayTime),
                async () => conditionOrderInstance.placeOrder(optionOrderBuyInM, optionContractBuyInM),
                async () => delay(delayTime)
            ];

            for (const order of orders) {
                await order();
            }
        };

        await getPlacedOrder();

    });

    it('Place bracket conditional order', async (done) => {
        let completed = false;
        const getPlacedOrder = async () => {
            const handleData = (data) => {
                ibkrEvents.off(IBKREVENTS.ORDER_FILLED, handleData);
                if (!completed) {
                    done()
                    completed = true;
                }
            };

            const conditionOrderInstance = ConditionOrders.Instance;
        
            log('Entered in callback');

            const timeCondition: TimeCondition = new TimeCondition("20210428 11:32:50", true, ConjunctionConnection.OR);
            
            order.conditions = [timeCondition];

            optionOrderBuyInM.conditions = [timeCondition];

            const delayTime = 1000;

            const orders = [
                async () => conditionOrderInstance.placeBracketOrder(order, contract, order.lmtPrice + 5, order.lmtPrice - 5),
                async () => delay(delayTime),
                async () => conditionOrderInstance.placeBracketOrder(optionOrderBuyInX, optionContractBuyInM, optionOrderBuyInX.lmtPrice + 5, optionOrderBuyInX.lmtPrice - 5),
                async () => delay(delayTime)
            ];

            for (const order of orders) {
                await order();
            }
        };

        await getPlacedOrder();
    });

    it('Should update bracket order', async (done) => {
        const OrderInstance = Orders.Instance;
        const conditionOrderInstance = ConditionOrders.Instance;
        const results = await OrderInstance.getOpenOrders();
        const parent: OrderWithContract = results.find( (orderRes) => orderRes.symbol === contract.symbol && orderRes.secType === contract.secType && orderRes.lmtPrice === order.lmtPrice && orderRes.action === order.action );
        let stopLoss: OrderWithContract;
        let takeProfit: OrderWithContract;
    
        const len = results.length;
        for (let i = 0; i < len; i++) {
            const value = results[i];
            if (value.parentId === parent.orderId && value.orderType === parent.orderType) {
                takeProfit = value;
            }
            if (value.parentId === parent.orderId && value.auxPrice < parent.lmtPrice) {
                stopLoss = value
            }
        }
        const cleanedTP = conditionOrderInstance.convertToOrder(takeProfit);
        cleanedTP.lmtPrice = cleanedTP.lmtPrice - 2.5;
        const cleanedSL = conditionOrderInstance.convertToOrder(stopLoss);
        cleanedSL.auxPrice = cleanedSL.auxPrice + 2.5;
        
        const delayTime = 1000;

        const orders = [
            async () => conditionOrderInstance.placeOrder(cleanedTP, contract, takeProfit.orderId, true),
            async () => delay(delayTime),
            async () => conditionOrderInstance.placeOrder(cleanedSL, contract, stopLoss.orderId, true),
            async () => delay(delayTime),
        ];

        for (const order of orders) {
            await order();
        }
    });
    
    
});
