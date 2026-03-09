/**
 * 农场基础操作 Mixin
 * 封装与农地维护、种植、收获等相关的功能
 */

const { types } = require('../../src/proto');
const { getPlantName, getPlantNameBySeedId, getPlantGrowTime, getPlantBySeedId } = require('../../src/gameConfig');
const { NORMAL_FERTILIZER_ID } = require('./constants'); // 待稍后统一抽取
const { sleep, sleepJitter, toLong, toNum, nowStr } = require('./utils');

const FarmActions = {
    async getAllLands() {
        const body = types.AllLandsRequest.encode(types.AllLandsRequest.create({})).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'AllLands', body);
        const reply = types.AllLandsReply.decode(replyBody);
        if (reply.operation_limits) this._updateOperationLimits(reply.operation_limits);
        return reply;
    },

    async harvest(landIds) {
        const body = types.HarvestRequest.encode(types.HarvestRequest.create({
            land_ids: landIds,
            host_gid: toLong(this.userState.gid),
            is_all: true,
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Harvest', body);
        return types.HarvestReply.decode(replyBody);
    },

    async waterLand(landIds) {
        const body = types.WaterLandRequest.encode(types.WaterLandRequest.create({
            land_ids: landIds,
            host_gid: toLong(this.userState.gid),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'WaterLand', body);
        return types.WaterLandReply.decode(replyBody);
    },

    async weedOut(landIds) {
        const body = types.WeedOutRequest.encode(types.WeedOutRequest.create({
            land_ids: landIds,
            host_gid: toLong(this.userState.gid),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'WeedOut', body);
        return types.WeedOutReply.decode(replyBody);
    },

    async insecticide(landIds) {
        const body = types.InsecticideRequest.encode(types.InsecticideRequest.create({
            land_ids: landIds,
            host_gid: toLong(this.userState.gid),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Insecticide', body);
        return types.InsecticideReply.decode(replyBody);
    },

    async fertilize(landIds, fertilizerId = NORMAL_FERTILIZER_ID) {
        let successCount = 0;
        for (const landId of landIds) {
            try {
                const body = types.FertilizeRequest.encode(types.FertilizeRequest.create({
                    land_ids: [toLong(landId)],
                    fertilizer_id: toLong(fertilizerId),
                })).finish();
                await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Fertilize', body);
                successCount++;
            } catch (e) {
                this.logWarn('农场', `施肥失败: ${e.message}`);
                break;
            }
            if (landIds.length > 1) await sleepJitter(300, 800);
        }
        return successCount;
    },

    async removePlant(landIds) {
        const body = types.RemovePlantRequest.encode(types.RemovePlantRequest.create({
            land_ids: landIds.map(id => toLong(id)),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'RemovePlant', body);
        return types.RemovePlantReply.decode(replyBody);
    },

    /**
     * 升级土地
     */
    async upgradeLand(landId) {
        const body = types.UpgradeLandRequest.encode(types.UpgradeLandRequest.create({
            land_id: toLong(landId),
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'UpgradeLand', body);
        return types.UpgradeLandReply.decode(replyBody);
    },

    /**
     * 解锁土地（开拓新土地）
     */
    async unlockLand(landId, doShared = false) {
        const body = types.UnlockLandRequest.encode(types.UnlockLandRequest.create({
            land_id: toLong(landId),
            do_shared: doShared
        })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.plantpb.PlantService', 'UnlockLand', body);
        return types.UnlockLandReply.decode(replyBody);
    },
};

module.exports = FarmActions;
