/**
 * 全局汇率工具
 * 从localStorage读取统一配置的汇率
 */

import {
  getLocalDateString as getNicaraguaDateString,
  getLocalDateTimeString as getNicaraguaDateTimeString,
} from './localTime';

export interface ExchangeRateConfig {
  usdToNio: number;
  pointsToCurrency: number;
  pointsEarnPerCurrency: number;
  lastUpdated: string;
}

const EXCHANGE_RATE_KEY = 'global_exchange_rate';

export const getExchangeRateStorageKey = (): string => {
  try {
    const currentUser = localStorage.getItem('current_user');
    const storeId = currentUser ? JSON.parse(currentUser).storeId : null;
    return storeId ? `store_${storeId}_${EXCHANGE_RATE_KEY}` : EXCHANGE_RATE_KEY;
  } catch {
    return EXCHANGE_RATE_KEY;
  }
};

/**
 * 🔥 获取本地日期字符串 (YYYY-MM-DD)
 * 使用系统本地时间，避免时区问题
 */
export const getLocalDateString = (date: Date = new Date()): string => {
  return getNicaraguaDateString(date);
};

/**
 * 🔥 获取本地日期时间字符串 (YYYY-MM-DD HH:mm:ss)
 * 使用系统本地时间，避免时区问题
 */
export const getLocalDateTimeString = (date: Date = new Date()): string => {
  return getNicaraguaDateTimeString(date);
};

// 默认配置
const DEFAULT_CONFIG: ExchangeRateConfig = {
  usdToNio: 36.5,
  pointsToCurrency: 100,
  pointsEarnPerCurrency: 1,
  lastUpdated: getLocalDateString(), // 🔥 使用本地时间
};

/**
 * 获取汇率配置
 */
export const getExchangeRateConfig = (): ExchangeRateConfig => {
  try {
    const saved = localStorage.getItem(getExchangeRateStorageKey());
    if (saved) {
      return {
        ...DEFAULT_CONFIG,
        ...JSON.parse(saved),
      };
    }
  } catch (e) {
    console.error('读取汇率配置失败:', e);
  }
  return DEFAULT_CONFIG;
};

/**
 * 获取美元兑科多巴汇率
 */
export const getUSDToNioRate = (): number => {
  return getExchangeRateConfig().usdToNio;
};

/**
 * 获取积分兑换率
 */
export const getPointsExchangeRate = (): number => {
  return getExchangeRateConfig().pointsToCurrency;
};

export const getPointsEarnRate = (): number => {
  return getExchangeRateConfig().pointsEarnPerCurrency;
};

/**
 * 美元转科多巴
 */
export const usdToNio = (usdAmount: number): number => {
  const rate = getUSDToNioRate();
  return usdAmount * rate;
};

/**
 * 科多巴转美元
 */
export const nioToUsd = (nioAmount: number): number => {
  const rate = getUSDToNioRate();
  return nioAmount / rate;
};

/**
 * 积分转金额
 */
export const pointsToAmount = (points: number): number => {
  const rate = getPointsExchangeRate();
  return points / rate;
};

/**
 * 金额转积分
 */
export const amountToPoints = (amount: number): number => {
  const rate = getPointsEarnRate();
  return Math.floor(amount * rate);
};

/**
 * 格式化汇率显示
 */
export const formatExchangeRate = (): string => {
  const rate = getUSDToNioRate();
  return `1 USD = C$${rate.toFixed(2)}`;
};

/**
 * 监听汇率变化
 */
export const onExchangeRateChange = (callback: (config: ExchangeRateConfig) => void) => {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent;
    callback(customEvent.detail);
  };
  
  window.addEventListener('exchangeRateUpdated', handler);
  
  // 返回取消监听的函数
  return () => {
    window.removeEventListener('exchangeRateUpdated', handler);
  };
};
