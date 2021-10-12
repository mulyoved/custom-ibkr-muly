import {
    OrderState,
    Order,
    Contract,
    LimitOrder,
    MarketOrder,
    MarketCloseOrder,
    StopOrder,
    StopLimitOrder,
    TrailingStopOrder,
    OrderType,
} from '@stoqey/ib';

export {ComboLeg, TagValue, Order, Contract, SecType} from '@stoqey/ib';

export type action = 'BUY' | 'SELL';

// https://interactivebrokers.github.io/tws-api/interfaceIBApi_1_1EWrapper.html#a17f2a02d6449710b6394d0266a353313
export type OrderStatusType =
    | 'PendingSubmit' // indicates that you have transmitted the order, but have not yet received confirmation that it has been accepted by the order destination.
    | 'PendingCancel' // PendingCancel - indicates that you have sent a request to cancel the order but have not yet received cancel confirmation from the order destination. At this point, your order is not confirmed canceled. It is not guaranteed that the cancellation will be successful.
    | 'PreSubmitted' //
    | 'Submitted' //
    | 'ApiCancelled' //
    | 'Cancelled'
    | 'Filled';

export interface ORDER {
    orderId: number;
    action: action;
    totalQuantity: number;
    orderType: string;
    lmtPrice: number;
    auxPrice: number;
    tif: string;
    ocaGroup: string;
    account: string;
    openClose: string;
    origin: number;
    orderRef: string;
    clientId: number;
    permId: number;
    outsideRth: boolean;
    hidden: boolean;
    discretionaryAmt: number;
    goodAfterTime: string;
    faGroup: string;
    faMethod: string;
    faPercentage: string;
    faProfile: string;
    goodTillDate: string;
    rule80A: string;
    percentOffset: number;
    settlingFirm: string;
    shortSaleSlot: number;
    designatedLocation: string;
    exemptCode: number;
    auctionStrategy: number;
    startingPrice: number;
    stockRefPrice: number;
    delta: number;
    stockRangeLower: number;
    stockRangeUpper: number;
    displaySize?: any;
    blockOrder: boolean;
    sweepToFill: boolean;
    allOrNone: boolean;
    minQty: number;
    ocaType: number;
    eTradeOnly: boolean;
    firmQuoteOnly: boolean;
    nbboPriceCap: number;
    parentId: number;
    triggerMethod: number;
    volatility: number;
    volatilityType: number;
    deltaNeutralOrderType: string;
    deltaNeutralAuxPrice: number;
    deltaNeutralConId: number;
    deltaNeutralSettlingFirm: string;
    deltaNeutralClearingAccount: string;
    deltaNeutralClearingIntent: string;
    deltaNeutralOpenClose: string;
    deltaNeutralShortSale: boolean;
    deltaNeutralShortSaleSlot: number;
    deltaNeutralDesignatedLocation: string;
    continuousUpdate: number;
    referencePriceType: number;
    trailStopPrice: number;
    trailingPercent: number;
    basisPoints: number;
    basisPointsType: number;
    scaleInitLevelSize: number;
    scaleSubsLevelSize: number;
    scalePriceIncrement: number;
    hedgeType: string;
    optOutSmartRouting: boolean;
    clearingAccount: string;
    clearingIntent: string;
    notHeld: boolean;
    algoStrategy: string;
    whatIf: boolean;
}

export interface OrderWithContract extends Order, Contract {
    orderId: number;
    orderState: OrderState;
}

export interface OrderContractPair {
    order: Order;
    contract: Contract;
}

export interface OrderStatus {
    status: OrderStatusType;
    filled: number;
    remaining: number;
    avgFillPrice: number;
    permId: any;
    parentId: any;
    lastFillPrice: number;
    clientId: any;
    whyHeld: number;
}

// export interface OrderState {
//     status: OrderStatusType;
//     initMargin: string;
//     maintMargin: string;
//     equityWithLoan: string;
//     commission: number;
//     minCommission: number;
//     maxCommission: number;
//     commissionCurrency: string;
//     warningText: string;
// }

export const GetOrderType = (
    orderType: OrderType
):
    | typeof LimitOrder
    | typeof MarketCloseOrder
    | typeof StopOrder
    | typeof StopLimitOrder
    | typeof TrailingStopOrder
    | typeof MarketOrder => {
    switch (orderType) {
        case OrderType.LMT:
            return LimitOrder;
        case OrderType.MOC:
            return MarketCloseOrder;
        case OrderType.STP:
            return StopOrder;
        case OrderType.STP_LMT:
            return StopLimitOrder;
        case OrderType.TRAIL:
            return TrailingStopOrder;

        default:
        case OrderType.MKT:
            return MarketOrder;
    }
};

export interface OrderBase extends Order {
    symbol?: string;
    orderType?: OrderType;
    size?: number; // optional
    capital?: number; // optional
    exitTrade?: boolean; // optional
    exitParams?: {
        /**
         * When exiting a trade
         * Create sale
         */
        entryTime: Date;
        entryPrice: number;
        exitTime: Date;
        exitPrice: number;
    };
    exchange?: string;
    currency?: string;
}

/**
 * Option types.
 */
export enum OptionType {
    /** Put option. */
    Put = 'P',

    /** Call option. */
    Call = 'C',
}

// CREATE Sale
export interface CreateSale {
    entryPrice: number;
    entryTime: Date;
    exitTime: Date;
    exitPrice: number;
    symbol: string;
    capital: number;
    profit?: number;
    website?: string;
    industry?: string;
    shortName?: string;
}
