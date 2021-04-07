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
import { OptionType, OrderOption } from '../orders.interfaces';
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
    totalQuantity: 100,
    lmtPrice: 1,
    transmit: true,
    conditionsIgnoreRth: true,
    conditionsCancelOrder: false
};

const optionContractBuyInM: Contract = {
    symbol: symbolOpt,
    lastTradeDateOrContractMonth: "20210416",
    strike: 2210,
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
            const timeCondition: TimeCondition = new TimeCondition("20210402 11:32:50", true, ConjunctionConnection.OR);
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
});
