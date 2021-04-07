import {ComboLeg, TagValue} from '@stoqey/ib-updated';
import {ContractObject} from '../contracts';

export {ComboLeg, TagValue} from '@stoqey/ib-updated';

export type action = 'BUY' | 'SELL';

export type ContractType =
    | 'fop'
    | 'future'
    | 'option'
    | 'stock'
    | 'combo'
    | 'cfd'
    | 'forex'
    | 'ind';

export const ContractEnum = {
    FOP: 'fop' as ContractType,
    FUTURE: 'future' as ContractType,
    OPTION: 'option' as ContractType,
    STOCK: 'stock' as ContractType,
    COMBO: 'combo' as ContractType,
    CFD: 'cfd' as ContractType,
    FOREX: 'forex' as ContractType,
    IND: 'ind' as ContractType,
};

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

export interface OrderWithContract extends ORDER, ContractObject {
    orderId: number;
    orderState: OrderState;
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

export interface OrderState {
    status: OrderStatusType;
    initMargin: string;
    maintMargin: string;
    equityWithLoan: string;
    commission: number;
    minCommission: number;
    maxCommission: number;
    commissionCurrency: string;
    warningText: string;
}

// ORDER TRADE
export type OrderAction = 'BUY' | 'SELL';

export type OrderType =
    | 'limit' // ib.order.limit('SELL', 1, 9999)
    | 'market' // .order.market(action, quantity, transmitOrder, goodAfterTime, goodTillDate)
    | 'marketClose' // .order.marketClose(action, quantity, price, transmitOrder)
    | 'stop' // .order.stop(action, quantity, price, transmitOrder, parentId, tif)
    | 'stopLimit' // .order.stopLimit(action, quantity, limitPrice, stopPrice, transmitOrder, parentId, tif)
    | 'trailingStop'; // .order.trailingStop(action, quantity, auxPrice, tif, transmitOrder, parentId)

interface OrderBase {
    symbol: string;
    action: OrderAction;
    type: OrderType;
    parameters: any[]; // 'SELL', 1, 9999,
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
}

interface OrderOptBase extends OrderBase {
    strike: string;
    right: OptionType;
    expiry: string; // "20210423"
}

export interface OrderStock extends OrderBase {
    kind: 'stock';
}

export interface OrderCfd extends OrderBase {
    kind: 'cfd';
}

export interface OrderCombo extends OrderBase {
    kind: 'combo';
    comboLegs: ComboLeg[];
    /**
     * Advanced parameters for Smart combo routing.
     *
     * These features are for both guaranteed and non-guaranteed combination orders routed to Smart, and are available based on combo type and order type.
     * SmartComboRoutingParams is similar to AlgoParams in that it makes use of tag/value pairs to add parameters to combo orders.
     *
     * Make sure that you fully understand how Advanced Combo Routing works in TWS itself first: https://www.interactivebrokers.com/en/software/tws/usersguidebook/specializedorderentry/advanced_combo_routing.htm
     *
     * The parameters cover the following capabilities:
     *
     * - Non-Guaranteed - Determine if the combo order is Guaranteed or Non-Guaranteed.
     *
     * Tag = NonGuaranteed
     *
     * Value = 0: The order is guaranteed
     *
     * Value = 1: The order is non-guaranteed
     *
     * - Select Leg to Fill First - User can specify which leg to be executed first.
     *
     * Tag = LeginPrio
     *
     * Value = -1: No priority is assigned to either combo leg
     *
     * Value = 0: Priority is assigned to the first leg being added to the comboLeg
     *
     * Value = 1: Priority is assigned to the second leg being added to the comboLeg
     *
     * Note: The LeginPrio parameter can only be applied to two-legged combo.
     *
     * - Maximum Leg-In Combo Size - Specify the maximum allowed leg-in size per segment
     *
     * Tag = MaxSegSize
     *
     * Value = Unit of combo size
     *
     * - Do Not Start Next Leg-In if Previous Leg-In Did Not Finish - Specify whether or not the system should attempt to fill the next segment before the current segment fills.
     *
     * Tag = DontLeginNext
     *
     *
     * Value = 0: Start next leg-in even if previous leg-in did not finish
     * Value = 1: Do not start next leg-in if previous leg-in did not finish
     *
     * - Price Condition - Combo order will be rejected or cancelled if the leg market price is outside of the specified price range [CondPriceMin, CondPriceMax]
     *
     * Tag = PriceCondConid: The ContractID of the combo leg to specify price condition on
     *
     * Value = The ContractID
     *
     * Tag = CondPriceMin: The lower price range of the price condition
     *
     * Value = The lower price
     *
     * Tag = CondPriceMax: The upper price range of the price condition
     *
     * Value = The upper price
     */
    smartComboRoutingParams: TagValue[];
    currency?: string;
    exchange?: string;
}

export interface OrderInd extends OrderBase {
    kind: 'ind';
}

export interface OrderForex extends OrderBase {
    kind: 'forex';
    currency: string; // "USD"
}

export interface OrderFuture extends OrderBase {
    kind: 'future';
    expiry: string; // "20210423" || "202104"
    currency: string;
    exchange: string;
    multiplier: number;
}

export interface OrderOption extends OrderOptBase {
    kind: 'option';
    currency?: string;
    exchange?: string;
}

export interface OrderFop extends OrderOptBase {
    kind: 'fop';
    multiplier?: number;
    exchange?: string;
    currency?: string;
}

export type OrderGeneral =
    | OrderCfd
    | OrderCombo
    | OrderInd
    | OrderForex
    | OrderFuture
    | OrderOption
    | OrderFop
    | OrderStock;

/**
 * Option types.
 */
export enum OptionType {
    /** Put option. */
    Put = 'P',

    /** Call option. */
    Call = 'C',
}

export interface ContractDictionary<T> {
    [key: string]: T;
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
