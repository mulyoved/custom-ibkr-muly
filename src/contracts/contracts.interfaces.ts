import {SecType} from '../orders/index';

export interface ContractObject {
    conId: number;
    symbol: string;
    secType: SecType | string;
    expiry?: string;
    strike?: number;
    right?: string;
    multiplier?: number;
    exchange: string;
    currency: string;
    localSymbol?: string;
    tradingClass?: string;
    comboLegsDescrip?: string;
    lastTradeDateOrContractMonth?: string;
}

export interface ContractSummary extends ContractObject {
    primaryExch: string;
}

export interface ContractDetails {
    contract: ContractSummary;
    marketName: string;
    minTick: number;
    orderTypes: string;
    validExchanges: string;
    priceMagnifier: number;
    underConId: number;
    longName: string;
    contractMonth: string;
    industry: string;
    category: string;
    subcategory: string;
    timeZoneId: string;
    tradingHours: string;
    liquidHours: string;
    evRule: string;
    evMultiplier?: any;
    lastTradeDateOrContractMonth?: string;
}

export const ibkrVersion = () => 'custome 1.0.1';
