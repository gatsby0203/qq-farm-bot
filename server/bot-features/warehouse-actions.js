/**
 * 仓库/背包操作 Mixin
 * 封装与获取背包信息、出售道具相关的操作
 */

const { types } = require('../../src/proto');
const { getFruitName } = require('../../src/gameConfig');
const { GOLD_ITEM_ID } = require('./constants');
const { toLong, toNum, isFruitId } = require('./utils');

const WarehouseActions = {
    async _getBag() {
        const body = types.BagRequest.encode(types.BagRequest.create({})).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.itempb.ItemService', 'Bag', body);
        return types.BagReply.decode(replyBody);
    },

    _getBagItems(bagReply) {
        if (bagReply.item_bag && bagReply.item_bag.items && bagReply.item_bag.items.length) {
            return bagReply.item_bag.items;
        }
        return bagReply.items || [];
    },

    async _sellItems(items) {
        const payload = items.map(item => ({
            id: item.id != null ? toLong(item.id) : undefined,
            count: item.count != null ? toLong(item.count) : undefined,
            uid: item.uid != null ? toLong(item.uid) : undefined,
        }));
        const body = types.SellRequest.encode(types.SellRequest.create({ items: payload })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.itempb.ItemService', 'Sell', body);
        return types.SellReply.decode(replyBody);
    },

    _extractGold(sellReply) {
        if (sellReply.get_items && sellReply.get_items.length > 0) {
            for (const item of sellReply.get_items) {
                if (toNum(item.id) === GOLD_ITEM_ID) return toNum(item.count);
            }
            return 0;
        }
        return sellReply.gold !== undefined ? toNum(sellReply.gold) : 0;
    },

    async sellAllFruits() {
        try {
            const bagReply = await this._getBag();
            const items = this._getBagItems(bagReply);
            const toSell = [];
            const names = [];

            for (const item of items) {
                const id = toNum(item.id);
                const count = toNum(item.count);
                const uid = item.uid ? toNum(item.uid) : 0;

                if (isFruitId(id) && count > 0 && uid !== 0) {
                    toSell.push(item);
                    names.push(`${getFruitName(id)}x${count}`);
                }
            }

            if (toSell.length === 0) { return; }

            const reply = await this._sellItems(toSell);
            const totalGold = this._extractGold(reply);
            this._checkDailyReset();
            this.dailyStats.sellGold += totalGold;
            this.log('仓库', `出售果实: ${names.join(', ')} | 获得 💰${totalGold} 金币`);
        } catch (e) {
            this.logWarn('仓库', `出售失败: ${e.message}`);
        }
    },

    async _debugSellFruits() {
        try {
            const bagReply = await this._getBag();
            const items = this._getBagItems(bagReply);
            const toSell = items.filter(item => isFruitId(toNum(item.id)) && toNum(item.count) > 0);
            if (toSell.length === 0) return;

            const reply = await this._sellItems(toSell);
            const totalGold = this._extractGold(reply);
            this.log('仓库', `初始出售完成 | 获得 💰${totalGold} 金币`);
        } catch (e) {
            this.logWarn('仓库', `初始出售获取异常: ${e.message}`);
        }
    },

    _startSellLoop(interval = 60000) {
        if (this.sellTimer) return;
        setTimeout(() => {
            this.sellAllFruits();
            this.sellTimer = setInterval(() => this.sellAllFruits(), interval);
        }, 10000);
    }
};

module.exports = WarehouseActions;
