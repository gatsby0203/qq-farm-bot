/**
 * 好友操作 Mixin
 * 封装与好友互助、偷菜、好友列表巡查相关的功能
 */

const { types } = require('../../src/proto');
const { getPlantName, getFruitName, getItemInfo } = require('../../src/gameConfig');
const { PlantPhase } = require('./constants');
const { sleep, sleepJitter, toLong, toNum } = require('./utils');
const db = require('../database');

function parseTimeToMinutes(value) {
    const m = String(value || '').trim().match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    const h = Number.parseInt(m[1], 10);
    const min = Number.parseInt(m[2], 10);
    if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}

function inFriendQuietHours(toggles, now = new Date()) {
    if (!toggles || !toggles.friendQuietEnabled) return false;
    const start = parseTimeToMinutes(toggles.friendQuietStart);
    const end = parseTimeToMinutes(toggles.friendQuietEnd);
    if (start === null || end === null) return false;

    const cur = now.getHours() * 60 + now.getMinutes();
    if (start === end) return true;
    if (start < end) return cur >= start && cur < end;
    return cur >= start || cur < end;
}

const FriendActions = {
    async getAllFriends() {
        if (this.platform === 'qq') {
            const syncReq = types.SyncAllRequest || types.SyncAllFriendsRequest;
            const syncRep = types.SyncAllReply || types.SyncAllFriendsReply;
            if (!syncReq || !syncRep) throw new Error('SyncAll 接口类型未加载');

            const body = syncReq.encode(syncReq.create({ open_ids: [] })).finish();
            const { body: replyBody } = await this.sendMsgAsync('gamepb.friendpb.FriendService', 'SyncAll', body);
            return syncRep.decode(replyBody);
        }
        const body = types.GetAllFriendsRequest.encode(types.GetAllFriendsRequest.create({})).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.friendpb.FriendService', 'GetAll', body);
        return types.GetAllFriendsReply.decode(replyBody);
    },

    async checkCanOperateRemote(friendGid, operationId) {
        if (!types.CheckCanOperateRequest || !types.CheckCanOperateReply) {
            return { canOperate: true, canStealNum: 0 };
        }
        try {
            const body = types.CheckCanOperateRequest.encode(types.CheckCanOperateRequest.create({
                host_gid: toLong(friendGid),
                operation_id: toLong(operationId),
            })).finish();
            const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'CheckCanOperate', body);
            const reply = types.CheckCanOperateReply.decode(replyBody);
            return {
                canOperate: !!reply.can_operate,
                canStealNum: toNum(reply.can_steal_num),
            };
        } catch {
            return { canOperate: true, canStealNum: 0 };
        }
    },

    async enterFriendFarm(friendGid) {
        const body = types.VisitEnterRequest.encode(types.VisitEnterRequest.create({
            host_gid: toLong(friendGid), reason: 2,
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.visitpb.VisitService', 'Enter', body);
        return types.VisitEnterReply.decode(replyBody);
    },

    async leaveFriendFarm(friendGid) {
        const body = types.VisitLeaveRequest.encode(types.VisitLeaveRequest.create({ host_gid: toLong(friendGid) })).finish();
        try { await this.sendMsgAsync('gamepb.visitpb.VisitService', 'Leave', body); } catch (e) {
            // 忽略离开农场的错误
        }
    },

    async helpWater(friendGid, landIds) {
        const body = types.WaterLandRequest.encode(types.WaterLandRequest.create({ land_ids: landIds, host_gid: toLong(friendGid) })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'WaterLand', body);
        const reply = types.WaterLandReply.decode(replyBody);
        if (reply.operation_limits) this._updateOperationLimits(reply.operation_limits);
        return reply;
    },

    async helpWeed(friendGid, landIds) {
        const body = types.WeedOutRequest.encode(types.WeedOutRequest.create({ land_ids: landIds, host_gid: toLong(friendGid) })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'WeedOut', body);
        const reply = types.WeedOutReply.decode(replyBody);
        if (reply.operation_limits) this._updateOperationLimits(reply.operation_limits);
        return reply;
    },

    async helpInsecticide(friendGid, landIds) {
        const body = types.InsecticideRequest.encode(types.InsecticideRequest.create({ land_ids: landIds, host_gid: toLong(friendGid) })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Insecticide', body);
        const reply = types.InsecticideReply.decode(replyBody);
        if (reply.operation_limits) this._updateOperationLimits(reply.operation_limits);
        return reply;
    },

    async stealHarvest(friendGid, landIds) {
        const body = types.HarvestRequest.encode(types.HarvestRequest.create({
            land_ids: landIds, host_gid: toLong(friendGid), is_all: true,
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Harvest', body);
        const reply = types.HarvestReply.decode(replyBody);
        if (reply.operation_limits) this._updateOperationLimits(reply.operation_limits);
        return reply;
    },

    _updateOperationLimits(limits) {
        if (!limits || limits.length === 0) return;
        this._checkDailyReset();
        for (const limit of limits) {
            const id = toNum(limit.id);
            if (id > 0) {
                const newExpTimes = toNum(limit.day_exp_times);
                this.operationLimits.set(id, {
                    dayTimes: toNum(limit.day_times),
                    dayTimesLimit: toNum(limit.day_times_lt),
                    dayExpTimes: newExpTimes,
                    dayExpTimesLimit: toNum(limit.day_ex_times_lt),
                });
                if (this.expTracker.has(id)) {
                    const prev = this.expTracker.get(id);
                    this.expTracker.delete(id);
                    if (newExpTimes <= prev && !this.expExhausted.has(id)) {
                        this.expExhausted.add(id);
                    }
                }
            }
        }
    },

    _canGetExp(opId) {
        if (this.expExhausted.has(opId)) return false;
        const limit = this.operationLimits.get(opId);
        if (!limit) return true;
        if (limit.dayExpTimesLimit > 0) return limit.dayExpTimes < limit.dayExpTimesLimit;
        return true;
    },

    _canOperate(opId) {
        const limit = this.operationLimits.get(opId);
        if (!limit) return true;
        if (limit.dayTimesLimit <= 0) return true;
        return limit.dayTimes < limit.dayTimesLimit;
    },

    _markExpCheck(opId) {
        const limit = this.operationLimits.get(opId);
        if (limit) this.expTracker.set(opId, limit.dayExpTimes);
    },

    analyzeFriendLands(lands) {
        const RADISH_PLANT_IDS = [2020002, 1020002];
        const result = { stealable: [], stealableInfo: [], needWater: [], needWeed: [], needBug: [] };

        for (const land of lands) {
            const id = toNum(land.id);
            const plant = land.plant;
            if (!plant || !plant.phases || plant.phases.length === 0) continue;

            const currentPhase = this.getCurrentPhase(plant.phases);
            if (!currentPhase) continue;

            const phaseVal = currentPhase.phase;
            if (phaseVal === PlantPhase.MATURE) {
                if (plant.stealable) {
                    const plantId = toNum(plant.id);
                    if (this.featureToggles.skipStealRadish && RADISH_PLANT_IDS.includes(plantId)) {
                        continue;
                    }
                    if (this.featureToggles.stealBlacklist && this.featureToggles.stealBlacklist.includes(plantId)) {
                        this.log('偷菜', `跳过黑名单作物: ${getPlantName(plantId) || '未知'}(${plantId})`);
                        continue;
                    }
                    result.stealable.push(id);
                    result.stealableInfo.push({ landId: id, plantId, name: getPlantName(plantId) || plant.name || '未知' });
                }
                continue;
            }
            if (phaseVal === PlantPhase.DEAD) continue;
            if (toNum(plant.dry_num) > 0) result.needWater.push(id);
            if (plant.weed_owners && plant.weed_owners.length > 0) result.needWeed.push(id);
            if (plant.insect_owners && plant.insect_owners.length > 0) result.needBug.push(id);
        }
        return result;
    },

    async visitFriend(friend, totalActions) {
        const { gid, name } = friend;
        let enterReply;
        try {
            enterReply = await this.enterFriendFarm(gid);
        } catch (e) {
            this.logWarn('好友', `进入 ${name} 农场失败: ${e.message}`);
            return;
        }

        const lands = enterReply.lands || [];
        if (lands.length === 0) { await this.leaveFriendFarm(gid); return; }

        const status = this.analyzeFriendLands(lands);
        const hasAnything = status.stealable.length + status.needWeed.length + status.needBug.length + status.needWater.length;
        if (hasAnything === 0) { await this.leaveFriendFarm(gid); return; }

        const actions = [];
        const skipped = [];

        // 帮助除草部分...
        if (status.needWeed.length > 0 && this.featureToggles.friendHelp) {
            if (this.featureToggles.helpEvenExpFull || this._canGetExp(10005)) {
                this._markExpCheck(10005);
                let ok = 0;
                for (const landId of status.needWeed) {
                    try { await this.helpWeed(gid, [landId]); ok++; } catch (e) { this.logWarn('辅助', `除草失败: ${e.message}`); }
                    await sleepJitter(300, 600);
                }
                if (ok > 0) { actions.push(`🌿除草×${ok}`); totalActions.weed += ok; this.dailyStats.helpWeed += ok; }
            } else {
                skipped.push(`🌿草${status.needWeed.length}(经验已满)`);
            }
        }
        // 帮助除虫部分...
        if (status.needBug.length > 0 && this.featureToggles.friendHelp) {
            if (this.featureToggles.helpEvenExpFull || this._canGetExp(10006)) {
                this._markExpCheck(10006);
                let ok = 0;
                for (const landId of status.needBug) {
                    try { await this.helpInsecticide(gid, [landId]); ok++; } catch (e) { this.logWarn('辅助', `除虫失败: ${e.message}`); }
                    await sleepJitter(300, 600);
                }
                if (ok > 0) { actions.push(`🐛除虫×${ok}`); totalActions.bug += ok; this.dailyStats.helpPest += ok; }
            } else {
                skipped.push(`🐛虫${status.needBug.length}(经验已满)`);
            }
        }
        // 帮助浇水部分...
        if (status.needWater.length > 0 && this.featureToggles.friendHelp) {
            if (this.featureToggles.helpEvenExpFull || this._canGetExp(10007)) {
                this._markExpCheck(10007);
                let ok = 0;
                for (const landId of status.needWater) {
                    try { await this.helpWater(gid, [landId]); ok++; } catch (e) { this.logWarn('辅助', `浇水失败: ${e.message}`); }
                    await sleepJitter(300, 600);
                }
                if (ok > 0) { actions.push(`💦浇水×${ok}`); totalActions.water += ok; this.dailyStats.helpWater += ok; }
            } else {
                skipped.push(`💦水${status.needWater.length}(经验已满)`);
            }
        }
        // 偷菜部分...
        if (status.stealable.length > 0 && this.featureToggles.autoSteal) {
            let ok = 0;
            const stolenPlants = [];
            const totalStolenItems = [];
            for (let i = 0; i < status.stealable.length; i++) {
                try {
                    const reply = await this.stealHarvest(gid, [status.stealable[i]]);
                    ok++;
                    if (status.stealableInfo[i]) stolenPlants.push(status.stealableInfo[i].name);
                    if (reply.items && reply.items.length > 0) {
                        totalStolenItems.push(...reply.items);
                    }
                } catch (e) { this.logWarn('偷菜', `偷取失败: ${e.message}`); }
                await sleepJitter(400, 800);
            }
            if (ok > 0) {
                const plantNames = [...new Set(stolenPlants)].join('/');
                actions.push(`🥬偷${ok}${plantNames ? '(' + plantNames + ')' : ''}`);
                totalActions.steal += ok;
                this._checkDailyReset();
                this.dailyStats.stealCount += ok;

                const plantCounts = {};
                if (totalStolenItems.length > 0) {
                    for (const item of totalStolenItems) {
                        const itemId = toNum(item.id);
                        if (itemId === 1 || itemId === 1001 || itemId === 2 || itemId === 1101) continue;
                        const name = getFruitName(itemId) || `未知果实(${item.id})`;
                        const count = toNum(item.count);
                        const itemInfo = getItemInfo(itemId);
                        const itemPrice = itemInfo && itemInfo.price ? itemInfo.price : 0;
                        const gold = count * itemPrice;

                        if (!plantCounts[name]) plantCounts[name] = { count: 0, gold: 0 };
                        plantCounts[name].count += count;
                        plantCounts[name].gold += gold;
                    }
                } else {
                    for (const name of stolenPlants) {
                        if (!plantCounts[name]) plantCounts[name] = { count: 0, gold: 0 };
                        plantCounts[name].count += 1;
                    }
                }
                for (const [name, data] of Object.entries(plantCounts)) {
                    db.addStatistic(this.userId, 'steal', data.count, `${friend.name}: ${name}`, data.gold);
                }
            }
        }

        const allParts = [...actions];
        if (skipped.length > 0) allParts.push(`⚠️跳过: ${skipped.join(' / ')}`);
        if (allParts.length > 0) this.log('好友', `访问 ${name}: ${allParts.join(' | ')}`);
        await this.leaveFriendFarm(gid);
    },

    async checkFriends() {
        if (this.isCheckingFriends || !this.userState.gid) return;
        this.isCheckingFriends = true;
        this._checkDailyReset();
        try {
            if (inFriendQuietHours(this.featureToggles)) {
                if (!this._friendQuietActive) {
                    const start = this.featureToggles.friendQuietStart || '23:00';
                    const end = this.featureToggles.friendQuietEnd || '07:00';
                    this.log('好友', `当前处于静默时段 ${start}-${end}，跳过本轮巡查`);
                    this._friendQuietActive = true;
                }
                return;
            }
            if (this._friendQuietActive) {
                this.log('好友', '静默时段结束，恢复好友巡查');
                this._friendQuietActive = false;
            }

            const friendsReply = await this.getAllFriends();
            const friends = friendsReply.game_friends || [];
            if (friends.length === 0) return;

            const friendsToVisit = [];
            const visitedGids = new Set();
            let skippedCount = 0;

            for (const f of friends) {
                const gid = toNum(f.gid);
                if (gid === this.userState.gid || visitedGids.has(gid)) continue;
                if (this.featureToggles.friendBlacklist && this.featureToggles.friendBlacklist.includes(gid)) {
                    const fname = f.remark || f.name || `GID:${gid}`;
                    this.log('巡查', `跳过黑名单好友: ${fname}(${gid})`);
                    skippedCount++;
                    continue;
                }
                const name = f.remark || f.name || `GID:${gid}`;
                const p = f.plant;
                const stealNum = p ? toNum(p.steal_plant_num) : 0;
                const dryNum = p ? toNum(p.dry_num) : 0;
                const weedNum = p ? toNum(p.weed_num) : 0;
                const insectNum = p ? toNum(p.insect_num) : 0;

                const canSteal = this.featureToggles.autoSteal && stealNum > 0;
                const canHelp = this.featureToggles.friendHelp && (dryNum > 0 || weedNum > 0 || insectNum > 0);

                if (canSteal || canHelp) {
                    friendsToVisit.push({ gid, name, level: toNum(f.level), stealNum, dryNum, weedNum, insectNum });
                    visitedGids.add(gid);
                } else {
                    skippedCount++;
                }
            }

            if (friendsToVisit.length === 0) {
                this.log('好友', `好友 ${friends.length} 人，全部无事可做`);
                return;
            }

            const visitSummary = friendsToVisit.map(f => {
                const parts = [];
                if (f.stealNum > 0) parts.push(`偷${f.stealNum}`);
                if (f.weedNum > 0) parts.push(`草${f.weedNum}`);
                if (f.insectNum > 0) parts.push(`虫${f.insectNum}`);
                if (f.dryNum > 0) parts.push(`水${f.dryNum}`);
                return `${f.name}(${parts.join('/')})`;
            }).join(', ');
            this.log('好友', `待访问 ${friendsToVisit.length}/${friends.length} 人 (跳过${skippedCount}人): ${visitSummary}`);

            const totalActions = { steal: 0, water: 0, weed: 0, bug: 0 };
            for (const friend of friendsToVisit) {
                try { await this.visitFriend(friend, totalActions); } catch (e) { this.logWarn('好友', `访问出错: ${e.message}`); }
                await sleepJitter(1000, 2500); // 访问不同的好友，间隔必须要长一点防止查水表
            }

            const summary = [];
            if (totalActions.steal > 0) summary.push(`🥬偷×${totalActions.steal}`);
            if (totalActions.weed > 0) summary.push(`🌿除草×${totalActions.weed}`);
            if (totalActions.bug > 0) summary.push(`🐛除虫×${totalActions.bug}`);
            if (totalActions.water > 0) summary.push(`💦浇水×${totalActions.water}`);
            if (summary.length > 0) {
                this.log('好友', `巡查完成 (${friendsToVisit.length}人) → ${summary.join(' | ')}`);
            } else {
                this.log('好友', `巡查完成 (${friendsToVisit.length}人)，无可操作`);
            }
        } catch (err) {
            this.logWarn('好友', `巡查失败: ${err.message}`);
        } finally {
            this.isCheckingFriends = false;
        }
    },

    async friendCheckLoop() {
        if (this.friendLoopTaskRunning) return;
        this.friendLoopTaskRunning = true;
        while (this.friendLoopRunning) {
            await this.checkFriends();
            if (!this.friendLoopRunning) break;
            const delay = this._getRandomDelayMs(this.friendIntervalRange || { min: this.friendInterval, max: this.friendInterval });
            await this._waitLoopDelay('friend', delay);
        }
        this.friendLoopTaskRunning = false;
        this.nextFriendCheckAt = 0;
        this._friendDelayController = null;
    },

    startFriendLoop() {
        if (this.friendLoopRunning) return;
        this.friendLoopRunning = true;
        this.nextFriendCheckAt = Date.now() + 5000;
        this.friendCheckTimer = setTimeout(() => this.friendCheckLoop(), 5000);
    },

    async _handleFriendApplications(applications) {
        const names = applications.map(a => a.name || `GID:${toNum(a.gid)}`).join(', ');
        this.log('申请', `收到 ${applications.length} 个好友申请: ${names}`);
        const gids = applications.map(a => toNum(a.gid));
        try {
            const body = types.AcceptFriendsRequest.encode(types.AcceptFriendsRequest.create({
                friend_gids: gids.map(g => toLong(g)),
            })).finish();
            const { body: replyBody } = await this.sendMsgAsync('gamepb.friendpb.FriendService', 'AcceptFriends', body);
            const reply = types.AcceptFriendsReply.decode(replyBody);
            const friends = reply.friends || [];
            if (friends.length > 0) {
                this.log('申请', `已同意 ${friends.length} 人`);
            }
        } catch (e) { this.logWarn('申请', `同意失败: ${e.message}`); }
    }
};

module.exports = FriendActions;
