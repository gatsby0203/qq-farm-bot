const { FRUIT_ID_SET } = require('./constants');
const Long = require('long');

// ============ 工具函数 (无状态，可复用) ============
function toLong(val) { return Long.isLong(val) ? val : Long.fromValue(val || 0); }
function toNum(val) { return Long.isLong(val) ? val.toNumber() : Number(val || 0); }

function nowStr() {
    return new Date().toLocaleString('zh-CN', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isFruitId(id) { return FRUIT_ID_SET.has(Number(id)); }

module.exports = {
    toLong,
    toNum,
    nowStr,
    sleep,
    isFruitId
};
