/**
 * 任务与日常奖励操作 Mixin
 * 封装各种领奖逻辑（免费礼包、分享、月卡、邮箱、QQ会员、化肥购买/使用、图鉴、成长任务）
 */

const { types } = require('../../src/proto');
const { getItemName } = require('../../src/gameConfig');
const { toLong, toNum, sleep, sleepJitter } = require('./utils');

const RewardActions = {
    async checkAndClaimTasks() {
        try {
            const body = types.TaskInfoRequest.encode(types.TaskInfoRequest.create({})).finish();
            const { body: replyBody } = await this.sendMsgAsync('gamepb.taskpb.TaskService', 'TaskInfo', body);
            const reply = types.TaskInfoReply.decode(replyBody);
            if (!reply.task_info) return;

            const allTasks = [
                ...(reply.task_info.growth_tasks || []),
                ...(reply.task_info.daily_tasks || []),
                ...(reply.task_info.tasks || []),
            ];
            const claimable = [];
            for (const task of allTasks) {
                const id = toNum(task.id);
                const progress = toNum(task.progress);
                const totalProgress = toNum(task.total_progress);
                if (task.is_unlocked && !task.is_claimed && progress >= totalProgress && totalProgress > 0) {
                    claimable.push({ id, desc: task.desc || `任务#${id}`, shareMultiple: toNum(task.share_multiple), rewards: task.rewards || [] });
                }
            }
            if (claimable.length === 0) return;
            this.log('任务', `发现 ${claimable.length} 个可领取任务`);

            for (const task of claimable) {
                try {
                    const useShare = task.shareMultiple > 1;
                    const claimBody = types.ClaimTaskRewardRequest.encode(types.ClaimTaskRewardRequest.create({ id: toLong(task.id), do_shared: useShare })).finish();
                    const { body: claimReplyBody } = await this.sendMsgAsync('gamepb.taskpb.TaskService', 'ClaimTaskReward', claimBody);
                    const claimReply = types.ClaimTaskRewardReply.decode(claimReplyBody);
                    const items = claimReply.items || [];
                    const rewardParts = items.map(item => {
                        const id = toNum(item.id);
                        const count = toNum(item.count);
                        if (id === 1) return `💰金币+${count}`;
                        if (id === 2) return `⭐经验+${count}`;
                        return `${getItemName(id)} ×${count}`;
                    });
                    this.log('任务', `✅ 领取成功: ${task.desc} → ${rewardParts.join(' | ') || '无奖励'}`);
                    await sleepJitter(300, 800);
                } catch (e) { this.logWarn('任务', `领取失败 #${task.id}: ${e.message}`); }
            }
        } catch (e) { this.logWarn('任务', `检查任务状态失败: ${e.message}`); }
    },

    _handleTaskNotify(taskInfo) {
        const allTasks = [...(taskInfo.growth_tasks || []), ...(taskInfo.daily_tasks || []), ...(taskInfo.tasks || [])];
        const hasClaimable = allTasks.some(t => t.is_unlocked && !t.is_claimed && toNum(t.progress) >= toNum(t.total_progress) && toNum(t.total_progress) > 0);
        if (hasClaimable) {
            setTimeout(() => this.checkAndClaimTasks(), 1000);
        }
    },

    _initTaskSystem() {
        setTimeout(() => this.checkAndClaimTasks(), 4000);
        this._initDailyRewardSystem();
    },

    _getDateKey() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    _isDoneToday(key) {
        return this.dailyRewardState[key] === this._getDateKey();
    },

    _markDoneToday(key) {
        this.dailyRewardState[key] = this._getDateKey();
        this.emit('rewardStateUpdate', { userId: this.userId, dailyRewardState: this.dailyRewardState });
    },

    _getRewardSummary(items) {
        if (!items || items.length === 0) return '无奖励';
        const parts = [];
        for (const item of items) {
            const id = toNum(item.id);
            const count = toNum(item.count);
            if (count <= 0) continue;
            if (id === 1 || id === 1001) parts.push(`💰金币+${count}`);
            else if (id === 2 || id === 1101) parts.push(`⭐经验+${count}`);
            else if (id === 1002) parts.push(`💎点券+${count}`);
            else parts.push(`${getItemName(id)}×${count}`);
        }
        return parts.join(' | ') || '无奖励';
    },

    _initDailyRewardSystem() {
        setTimeout(() => this._runDailyRewards(), 8000);
        this.dailyRoutineTimer = setInterval(() => this._runDailyRewards(), 60 * 60 * 1000);
    },

    async _runDailyRewards() {
        if (this.status !== 'running') return;
        const toggles = this.featureToggles;

        try {
            if (toggles.autoFreeGifts) await this._claimFreeGifts();
            await sleep(500);
            if (toggles.autoShareReward) await this._claimShareReward();
            await sleep(500);
            if (toggles.autoMonthCard) await this._claimMonthCard();
            await sleep(500);
            if (toggles.autoEmailReward) await this._claimEmailRewards();
            await sleep(500);
            if (toggles.autoVipGift) await this._claimVipGift();
            await sleep(500);
            if (toggles.autoIllustrated) await this._claimIllustratedRewards();
            await sleep(500);
            if (toggles.autoFertilizerUse) await this._useFertilizerGiftPacks();
            await sleep(500);
            if (toggles.autoFertilizerBuy) await this._buyOrganicFertilizer();
        } catch (e) {
            this.logWarn('奖励', `每日奖励检查出错: ${e.message}`);
        }
    },

    async _claimFreeGifts(force = false) {
        if (!force && this._isDoneToday('freeGifts')) return 0;

        try {
            const reqBody = types.GetMallListBySlotTypeRequest.encode(
                types.GetMallListBySlotTypeRequest.create({ slot_type: 1 })
            ).finish();
            const { body: replyBody } = await this.sendMsgAsync(
                'gamepb.mallpb.MallService', 'GetMallListBySlotType', reqBody
            );
            const reply = types.GetMallListBySlotTypeResponse.decode(replyBody);
            const goodsList = reply.goods_list || [];

            let claimed = 0;
            for (const goodsBytes of goodsList) {
                try {
                    const goods = types.MallGoods.decode(goodsBytes);
                    if (goods.is_free && goods.goods_id > 0) {
                        const purchaseReq = types.PurchaseRequest.encode(
                            types.PurchaseRequest.create({ goods_id: goods.goods_id, count: 1 })
                        ).finish();
                        await this.sendMsgAsync('gamepb.mallpb.MallService', 'Purchase', purchaseReq);
                        claimed++;
                        await sleepJitter(400, 1000);
                    }
                } catch (e) { this.logWarn('商城', `单个商品解析失败: ${e.message}`); }
            }

            if (claimed > 0) {
                this.log('商城', `🎁 领取免费礼包 ×${claimed}`);
            }
            this._markDoneToday('freeGifts');
            return claimed;
        } catch (e) {
            if (!e.message.includes('已领取')) {
                this.logWarn('商城', `免费礼包领取失败: ${e.message}`);
            }
            this._markDoneToday('freeGifts');
            return 0;
        }
    },

    async _claimShareReward(force = false) {
        if (!force && this._isDoneToday('share')) return false;

        try {
            const checkReq = types.CheckCanShareRequest.encode(types.CheckCanShareRequest.create({})).finish();
            const { body: checkBody } = await this.sendMsgAsync('gamepb.sharepb.ShareService', 'CheckCanShare', checkReq);
            const checkReply = types.CheckCanShareReply.decode(checkBody);

            if (!checkReply.can_share) {
                this._markDoneToday('share');
                return false;
            }

            const reportReq = types.ReportShareRequest.encode(types.ReportShareRequest.create({ shared: true })).finish();
            await this.sendMsgAsync('gamepb.sharepb.ShareService', 'ReportShare', reportReq);
            await sleepJitter(400, 1000);

            const claimReq = types.ClaimShareRewardRequest.encode(types.ClaimShareRewardRequest.create({ claimed: true })).finish();
            const { body: claimBody } = await this.sendMsgAsync('gamepb.sharepb.ShareService', 'ClaimShareReward', claimReq);
            const claimReply = types.ClaimShareRewardReply.decode(claimBody);

            if (claimReply.success || claimReply.items?.length > 0) {
                this.log('分享', `📤 分享奖励已领取: ${this._getRewardSummary(claimReply.items)}`);
                this._markDoneToday('share');
                return true;
            }
            this._markDoneToday('share');
            return false;
        } catch (e) {
            if (e.message.includes('已领取') || e.message.includes('已分享')) {
                this._markDoneToday('share');
            } else {
                this.logWarn('分享', `分享奖励领取失败: ${e.message}`);
            }
            return false;
        }
    },

    async _claimMonthCard(force = false) {
        if (!force && this._isDoneToday('monthCard')) return false;

        try {
            const infoReq = types.GetMonthCardInfosRequest.encode(
                types.GetMonthCardInfosRequest.create({})
            ).finish();
            const { body: infoBody } = await this.sendMsgAsync(
                'gamepb.mallpb.MallService', 'GetMonthCardInfos', infoReq
            );
            const infoReply = types.GetMonthCardInfosReply.decode(infoBody);
            const infos = infoReply.infos || [];

            const claimable = infos.filter(x => x.can_claim && x.goods_id > 0);
            if (claimable.length === 0) {
                this._markDoneToday('monthCard');
                return false;
            }

            let claimed = 0;
            for (const info of claimable) {
                try {
                    const claimReq = types.ClaimMonthCardRewardRequest.encode(
                        types.ClaimMonthCardRewardRequest.create({ goods_id: info.goods_id })
                    ).finish();
                    const { body: claimBody } = await this.sendMsgAsync(
                        'gamepb.mallpb.MallService', 'ClaimMonthCardReward', claimReq
                    );
                    const claimReply = types.ClaimMonthCardRewardReply.decode(claimBody);
                    this.log('月卡', `📅 月卡奖励已领取: ${this._getRewardSummary(claimReply.items)}`);
                    claimed++;
                    await sleepJitter(400, 900);
                } catch (e) { this.logWarn('月卡', `单个月卡领取异常: ${e.message}`); }
            }

            this._markDoneToday('monthCard');
            return claimed > 0;
        } catch (e) {
            this._markDoneToday('monthCard');
            return false;
        }
    },

    async _claimEmailRewards(force = false) {
        if (!force && this._isDoneToday('email')) return { claimed: 0 };

        try {
            const emails = [];
            for (const boxType of [1, 2]) {
                try {
                    const req = types.GetEmailListRequest.encode(types.GetEmailListRequest.create({ box_type: boxType })).finish();
                    const { body: replyBody } = await this.sendMsgAsync('gamepb.emailpb.EmailService', 'GetEmailList', req);
                    const reply = types.GetEmailListReply.decode(replyBody);
                    for (const email of (reply.emails || [])) {
                        if (email.has_reward && !email.claimed) {
                            emails.push({ ...email, boxType });
                        }
                    }
                } catch (e) { this.logWarn('邮箱', `解析邮箱列表失败: ${e.message}`); }
            }

            if (emails.length === 0) {
                this._markDoneToday('email');
                return { claimed: 0 };
            }

            let claimed = 0;
            let totalRewards = [];

            for (const email of emails) {
                try {
                    const batchReq = types.BatchClaimEmailRequest.encode(
                        types.BatchClaimEmailRequest.create({ box_type: email.boxType, email_id: email.id })
                    ).finish();
                    const { body: batchBody } = await this.sendMsgAsync('gamepb.emailpb.EmailService', 'BatchClaimEmail', batchReq);
                    const batchReply = types.BatchClaimEmailReply.decode(batchBody);
                    if (batchReply.items) totalRewards.push(...batchReply.items);
                    claimed++;
                } catch (e) {
                    try {
                        const singleReq = types.ClaimEmailRequest.encode(
                            types.ClaimEmailRequest.create({ box_type: email.boxType, email_id: email.id })
                        ).finish();
                        const { body: singleBody } = await this.sendMsgAsync('gamepb.emailpb.EmailService', 'ClaimEmail', singleReq);
                        const singleReply = types.ClaimEmailReply.decode(singleBody);
                        if (singleReply.items) totalRewards.push(...singleReply.items);
                        claimed++;
                    } catch (e2) { this.logWarn('邮箱', `领取邮件补偿失败: ${e2.message}`); }
                }
                await sleepJitter(300, 800);
            }

            if (claimed > 0) {
                this.log('邮箱', `📧 领取邮件奖励 ×${claimed}: ${this._getRewardSummary(totalRewards)}`);
            }
            this._markDoneToday('email');
            return { claimed };
        } catch (e) {
            this._markDoneToday('email');
            return { claimed: 0 };
        }
    },

    async _claimVipGift(force = false) {
        if (!force && this._isDoneToday('vipGift')) return false;

        try {
            const statusReq = types.GetDailyGiftStatusRequest.encode(types.GetDailyGiftStatusRequest.create({})).finish();
            const { body: statusBody } = await this.sendMsgAsync('gamepb.qqvippb.QQVipService', 'GetDailyGiftStatus', statusReq);
            const statusReply = types.GetDailyGiftStatusReply.decode(statusBody);

            if (!statusReply.can_claim) {
                this._markDoneToday('vipGift');
                return false;
            }

            const claimReq = types.ClaimDailyGiftRequest.encode(types.ClaimDailyGiftRequest.create({})).finish();
            const { body: claimBody } = await this.sendMsgAsync('gamepb.qqvippb.QQVipService', 'ClaimDailyGift', claimReq);
            const claimReply = types.ClaimDailyGiftReply.decode(claimBody);

            if (claimReply.items?.length > 0) {
                this.log('会员', `👑 QQ会员奖励已领取: ${this._getRewardSummary(claimReply.items)}`);
                this._markDoneToday('vipGift');
                return true;
            }
            this._markDoneToday('vipGift');
            return false;
        } catch (e) {
            if (e.message.includes('1021002') || e.message.includes('已领取')) {
                this._markDoneToday('vipGift');
            } else {
                this.logWarn('会员', `领取异常: ${e.message}`);
            }
            return false;
        }
    },

    async _buyOrganicFertilizer(force = false) {
        const COOLDOWN_MS = 10 * 60 * 1000;
        const now = Date.now();

        if (!force && now - this.lastFertilizerBuyAt < COOLDOWN_MS) return 0;
        if (!force && this._isDoneToday('fertilizerBuy')) return 0;

        try {
            const reqBody = types.GetMallListBySlotTypeRequest.encode(
                types.GetMallListBySlotTypeRequest.create({ slot_type: 1 })
            ).finish();
            const { body: replyBody } = await this.sendMsgAsync('gamepb.mallpb.MallService', 'GetMallListBySlotType', reqBody);
            const reply = types.GetMallListBySlotTypeResponse.decode(replyBody);
            const goodsList = reply.goods_list || [];

            let fertilizerGoods = null;
            for (const goodsBytes of goodsList) {
                try {
                    const goods = types.MallGoods.decode(goodsBytes);
                    if (goods.goods_id === 1002) {
                        fertilizerGoods = goods;
                        break;
                    }
                } catch (e) { this.logWarn('商城', `化肥商品解析失败: ${e.message}`); }
            }

            if (!fertilizerGoods) {
                this._markDoneToday('fertilizerBuy');
                return 0;
            }

            let totalBought = 0;
            const MAX_ROUNDS = 100;
            const BUY_PER_ROUND = 10;

            for (let i = 0; i < MAX_ROUNDS; i++) {
                try {
                    const purchaseReq = types.PurchaseRequest.encode(
                        types.PurchaseRequest.create({ goods_id: fertilizerGoods.goods_id, count: BUY_PER_ROUND })
                    ).finish();
                    await this.sendMsgAsync('gamepb.mallpb.MallService', 'Purchase', purchaseReq);
                    totalBought += BUY_PER_ROUND;
                    await sleepJitter(500, 1500); // 买化肥频率不能过高
                } catch (e) {
                    if (e.message.includes('余额不足') || e.message.includes('点券不足') ||
                        e.message.includes('1000019') || e.message.includes('不足')) {
                        break;
                    }
                    this.logWarn('商城', `购买重试遇到错误: ${e.message}`);
                    break;
                }
            }

            if (totalBought > 0) {
                this.log('商城', `🧪 点券购买有机化肥 ×${totalBought}`);
                this.lastFertilizerBuyAt = now;
            }

            return totalBought;
        } catch (e) {
            this.logWarn('商城', `化肥购买功能异常: ${e.message}`);
            return 0;
        }
    },

    async _useFertilizerGiftPacks(force = false) {
        if (!force && this._isDoneToday('fertilizerUse')) return 0;

        const FERTILIZER_GIFT_IDS = new Set([100003, 100004]);
        const FERTILIZER_ITEM_IDS = new Map([
            [80001, { type: 'normal', hours: 1 }], [80002, { type: 'normal', hours: 4 }],
            [80003, { type: 'normal', hours: 8 }], [80004, { type: 'normal', hours: 12 }],
            [80011, { type: 'organic', hours: 1 }], [80012, { type: 'organic', hours: 4 }],
            [80013, { type: 'organic', hours: 8 }], [80014, { type: 'organic', hours: 12 }],
        ]);
        const CONTAINER_LIMIT_HOURS = 990;
        const NORMAL_CONTAINER_ID = 1011;
        const ORGANIC_CONTAINER_ID = 1012;

        try {
            const bagReply = await this._getBag();
            const items = this._getBagItems(bagReply);

            let normalSec = 0, organicSec = 0;
            for (const it of items) {
                const id = toNum(it.id);
                const count = toNum(it.count);
                if (id === NORMAL_CONTAINER_ID) normalSec = count;
                if (id === ORGANIC_CONTAINER_ID) organicSec = count;
            }
            const containerHours = { normal: normalSec / 3600, organic: organicSec / 3600 };

            const toUse = [];
            for (const it of items) {
                const id = toNum(it.id);
                const count = toNum(it.count);
                if (count <= 0) continue;

                if (FERTILIZER_GIFT_IDS.has(id)) {
                    toUse.push({ id, count, isGift: true });
                } else if (FERTILIZER_ITEM_IDS.has(id)) {
                    const info = FERTILIZER_ITEM_IDS.get(id);
                    const currentHours = info.type === 'normal' ? containerHours.normal : containerHours.organic;
                    if (currentHours < CONTAINER_LIMIT_HOURS) {
                        const remainHours = CONTAINER_LIMIT_HOURS - currentHours;
                        const maxCount = Math.floor(remainHours / info.hours);
                        const useCount = Math.min(count, maxCount);
                        if (useCount > 0) {
                            toUse.push({ id, count: useCount, isGift: false, type: info.type, hours: info.hours });
                        }
                    }
                }
            }

            if (toUse.length === 0) {
                this._markDoneToday('fertilizerUse');
                return 0;
            }

            let used = 0;
            for (const item of toUse) {
                try {
                    const batchReq = types.BatchUseRequest.encode(
                        types.BatchUseRequest.create({
                            items: [{ item_id: toLong(item.id), count: toLong(item.count) }]
                        })
                    ).finish();
                    await this.sendMsgAsync('gamepb.itempb.ItemService', 'BatchUse', batchReq);
                    used += item.count;

                    if (!item.isGift && item.type && item.hours) {
                        if (item.type === 'normal') containerHours.normal += item.count * item.hours;
                        else containerHours.organic += item.count * item.hours;
                    }
                } catch (e) {
                    try {
                        const singleReq = types.UseRequest.encode(
                            types.UseRequest.create({ item_id: toLong(item.id), count: toLong(item.count) })
                        ).finish();
                        await this.sendMsgAsync('gamepb.itempb.ItemService', 'Use', singleReq);
                        used += item.count;
                    } catch (e2) {
                        if (e2.message.includes('1003002') || e2.message.includes('上限')) {
                            continue;
                        }
                        this.logWarn('包裹', `化肥使用异常拦截: ${e2.message}`);
                    }
                }
                await sleepJitter(500, 1200);
            }

            if (used > 0) {
                this.log('仓库', `🧴 使用化肥道具 ×${used}`);
            }
            this._markDoneToday('fertilizerUse');
            return used;
        } catch (e) {
            this._markDoneToday('fertilizerUse');
            return 0;
        }
    },

    async _claimIllustratedRewards(force = false) {
        if (!force && this._isDoneToday('illustrated')) return false;

        try {
            const claimReq = types.ClaimAllRewardsV2Request.encode(
                types.ClaimAllRewardsV2Request.create({ only_claimable: true })
            ).finish();
            const { body: claimBody } = await this.sendMsgAsync(
                'gamepb.illustratedpb.IllustratedService', 'ClaimAllRewardsV2', claimReq
            );
            const claimReply = types.ClaimAllRewardsV2Reply.decode(claimBody);

            const allItems = [...(claimReply.items || []), ...(claimReply.bonus_items || [])];
            if (allItems.length > 0) {
                this.log('图鉴', `📖 图鉴奖励已领取: ${this._getRewardSummary(allItems)}`);
                this._markDoneToday('illustrated');
                return true;
            }
            this._markDoneToday('illustrated');
            return false;
        } catch (e) {
            this._markDoneToday('illustrated');
            return false;
        }
    },

    async _updateExtraUserInfo(force = false) {
        const now = Date.now();
        if (!force && this._lastExtraUserUpdateAt && now - this._lastExtraUserUpdateAt < 300000) return;

        try {
            const bagReply = await this._getBag();
            const items = this._getBagItems(bagReply);

            let coupon = 0;
            let normalFert = 0, organicFert = 0;
            let normalPoints = 0, classicPoints = 0;

            for (const it of items) {
                const id = toNum(it.id);
                const count = toNum(it.count);
                if (id === 1002) coupon = count;
                else if (id === 1011) normalFert = count;
                else if (id === 1012) organicFert = count;
                else if (id === 3001) normalPoints = count;
                else if (id === 3002) classicPoints = count;
            }

            this.userState.coupon = coupon;
            this.userState.fertilizer = { normal: normalFert, organic: organicFert };
            this.userState.collectionPoints = { normal: normalPoints, classic: classicPoints };

            this._lastExtraUserUpdateAt = now;
            this._emitStateUpdate();
        } catch (e) {
            this.logWarn('系统', `更新额外用户信息失败: ${e.message}`);
        }
    }
};

module.exports = RewardActions;
