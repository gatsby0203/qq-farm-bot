const { FRUIT_ID_SET } = require('./constants');
const Long = require('long');

// ============ 工具函数 (无状态，可复用) ============
function toLong(val) { return Long.isLong(val) ? val : Long.fromValue(val || 0); }
function toNum(val) { return Long.isLong(val) ? val.toNumber() : Number(val || 0); }

function nowStr() {
    return new Date().toLocaleString('zh-CN', { hour12: false });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * sleepJitter - 随机延迟函数，用于防封控
 * @param {number} min 最小毫秒数
 * @param {number} max 最大毫秒数
 */
function sleepJitter(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isFruitId(id) { return FRUIT_ID_SET.has(Number(id)); }

module.exports = {
    toLong,
    toNum,
    nowStr,
    sleep,
    sleepJitter,
    isFruitId
};
