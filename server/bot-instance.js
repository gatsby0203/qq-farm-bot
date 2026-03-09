/**
 * BotInstance - 单个用户的农场机器人实例
 *
 * 将原始 client.js / network.js / farm.js / friend.js / task.js / warehouse.js
 * 中的 **模块级状态** 全部收拢到实例内，使得同一进程可并行运行多个 Bot。
 *
 * 共享只读资源：proto types、gameConfig 数据。
 * 每个实例独立：WebSocket 连接、userState、定时器、日志流。
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const { types } = require('../src/proto');
const { CONFIG } = require('../src/config');
const { getPlantNameBySeedId, getPlantName, getFruitName, getPlantById, getPlantExp, getLevelExpProgress, getItemInfo } = require('../src/gameConfig');
const cryptoWasm = require('./utils/crypto-wasm');
const fs = require('fs');
const path = require('path');

// 导入工具与常量
const { toNum, toLong, nowStr, sleep, isFruitId } = require('./bot-features/utils');
const { PLATFORMS, PHASE_NAMES, PlantPhase, GOLD_ITEM_ID, NORMAL_FERTILIZER_ID, TAG_ICONS } = require('./bot-features/constants');
const db = require('./database');

// 导入 Mixins
const FarmActions = require('./bot-features/farm-actions');
const FriendActions = require('./bot-features/friend-actions');
const WarehouseActions = require('./bot-features/warehouse-actions');
const RewardActions = require('./bot-features/reward-actions');

// ============ 作物图标映射缓存 ============
let CROP_ICON_MAP = null;
function getCropIconFile(plantId) {
    if (!CROP_ICON_MAP) {
        CROP_ICON_MAP = new Map();
        const iconDir = path.join(__dirname, '..', 'gameConfig', 'seed_images_named');
        if (fs.existsSync(iconDir)) {
            const files = fs.readdirSync(iconDir);
            for (const f of files) {
                const leadingMatch = f.match(/^(\d+)_/);
                if (leadingMatch) CROP_ICON_MAP.set(Number(leadingMatch[1]), f);

                const cropMatch = f.match(/Crop_(\d+)/i);
                if (cropMatch) CROP_ICON_MAP.set(Number(cropMatch[1]), f);
            }
        }
    }

    const pid = Number(plantId);
    if (!pid) return '';
    if (CROP_ICON_MAP.has(pid)) return CROP_ICON_MAP.get(pid);

    const plantInfo = getPlantById(pid);
    if (plantInfo && plantInfo.seed_id) {
        const sid = Number(plantInfo.seed_id);
        if (CROP_ICON_MAP.has(sid)) return CROP_ICON_MAP.get(sid);
    }

    const shortId = pid % 100000;
    if (CROP_ICON_MAP.has(shortId)) return CROP_ICON_MAP.get(shortId);

    return '';
}

function getTagIcon(tag) { return TAG_ICONS[tag] || 'ℹ️'; }

function dateKeyFromServerSec(serverSec = 0) {
    const baseMs = serverSec > 0 ? serverSec * 1000 : Date.now();
    const bjMs = baseMs + 8 * 3600 * 1000;
    const d = new Date(bjMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function normalizeDateKey(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';

    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const ORGANIC_FERTILIZER_ID = 1012;
const MIN_INTERVAL_MS = 0;
const MAX_INTERVAL_MS = 86400 * 1000;

function clampIntervalMs(value, fallback = 10000) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.floor(fallback)));
    return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.floor(n)));
}

function normalizeIntervalRange(rangeLike, fallbackMs = 10000) {
    if (rangeLike && typeof rangeLike === 'object') {
        const rawMin = rangeLike.min ?? rangeLike.minMs ?? fallbackMs;
        const rawMax = rangeLike.max ?? rangeLike.maxMs ?? fallbackMs;
        const min = clampIntervalMs(rawMin, fallbackMs);
        const max = clampIntervalMs(rawMax, fallbackMs);
        return min <= max ? { min, max } : { min: max, max: min };
    }
    const fixed = clampIntervalMs(rangeLike, fallbackMs);
    return { min: fixed, max: fixed };
}

function rangeToText(range) {
    if (!range) return '0s';
    if (range.min === range.max) return `${Math.floor(range.min / 1000)}s`;
    return `${Math.floor(range.min / 1000)}-${Math.floor(range.max / 1000)}s`;
}

// ============ BotInstance 类 ============

class BotInstance extends EventEmitter {
    constructor(userId, opts = {}) {
        super();
        this.userId = userId;
        this.platform = opts.platform || PLATFORMS.QQ;
        this.farmIntervalRange = normalizeIntervalRange(
            opts.farmIntervalRange || { min: opts.farmInterval, max: opts.farmInterval },
            CONFIG.farmCheckInterval
        );
        this.friendIntervalRange = normalizeIntervalRange(
            opts.friendIntervalRange || { min: opts.friendInterval, max: opts.friendInterval },
            CONFIG.friendCheckInterval
        );
        this.farmInterval = this.farmIntervalRange.min;
        this.friendInterval = this.friendIntervalRange.min;
        this.preferredSeedId = opts.preferredSeedId || 0;

        // ---------- 运行状态 ----------
        this.status = 'idle';
        this.errorMessage = '';
        this.startedAt = null;

        // ---------- 网络层状态 ----------
        this.ws = null;
        this.clientSeq = 1;
        this.serverSeq = 0;
        this.pendingCallbacks = new Map();
        this.heartbeatTimer = null;
        this.lastHeartbeatResponse = 0;
        this.heartbeatMissCount = 0;

        // ---------- 用户游戏状态 ----------
        this.userState = {
            gid: 0, name: '', level: 0, gold: 0, exp: 0,
            coupon: 0,
            fertilizer: { normal: 0, organic: 0 },
            collectionPoints: { normal: 0, classic: 0 },
        };
        this.serverTimeMs = 0;
        this.localTimeAtSync = 0;

        // ---------- 农场与好友循环 ----------
        this.farmLoopRunning = false;
        this.farmCheckTimer = null;
        this.farmLoopTaskRunning = false;
        this._farmDelayController = null;
        this.nextFarmCheckAt = 0;
        this.isCheckingFarm = false;
        this.fastHarvestTimers = new Map();

        this.friendLoopRunning = false;
        this.friendCheckTimer = null;
        this.friendLoopTaskRunning = false;
        this._friendDelayController = null;
        this.nextFriendCheckAt = 0;
        this.isCheckingFriends = false;
        this.operationLimits = new Map();
        this.expTracker = new Map();
        this.expExhausted = new Set();
        this.lastResetDate = dateKeyFromServerSec();

        // ---------- 任务与仓库 ----------
        this.sellTimer = null;
        this.dailyRewardState = {
            freeGifts: '', share: '', monthCard: '', email: '',
            vipGift: '', illustrated: '', fertilizerBuy: '', fertilizerUse: '',
        };
        this.lastFertilizerBuyAt = 0;
        this.dailyRoutineTimer = null;

        // ---------- 日志缓冲 ----------
        this._logs = [];
        this.MAX_LOGS = 500;

        // ---------- 功能开关 ----------
        this.featureToggles = {
            autoHarvest: true, fastHarvest: false, autoPlant: true,
            autoFertilize: false, autoWeed: true, autoPest: true, autoWater: true,
            fertilizerMode: 'normal', fertilizerMultiSeason: false, fertilizerSoilTypes: [],
            autoLandUnlock: true, autoLandUpgrade: true, landUpgradeTarget: 6,
            friendVisit: true, autoSteal: true, skipStealRadish: true,
            stealBlacklist: [], friendHelp: true, friendPest: true, helpEvenExpFull: true,
            friendQuietEnabled: false, friendQuietStart: '23:00', friendQuietEnd: '07:00',
            autoTask: true, autoSell: true, autoBuyFertilizer: false,
            autoFreeGifts: true, autoShareReward: true, autoMonthCard: true,
            autoEmailReward: true, autoVipGift: true, autoIllustrated: true,
            autoFertilizerBuy: false, autoFertilizerUse: false,
        };

        if (opts.featureToggles) {
            Object.assign(this.featureToggles, opts.featureToggles);
        }

        // ---------- 今日统计 ----------
        const todayKey = dateKeyFromServerSec();
        this.dailyStats = {
            date: todayKey,
            expGained: 0, harvestCount: 0, stealCount: 0,
            helpWater: 0, helpWeed: 0, helpPest: 0, sellGold: 0,
        };

        const incomingStatsDate = normalizeDateKey(opts.dailyStats && opts.dailyStats.date);
        if (opts.dailyStats && incomingStatsDate === todayKey) {
            Object.assign(this.dailyStats, opts.dailyStats, { date: todayKey });
        }
        if (opts.dailyRewardState) {
            Object.assign(this.dailyRewardState, opts.dailyRewardState);
        }

        this._cachedLands = null;
        this._cachedLandsTime = 0;
    }

    log(tag, msg) {
        const icon = getTagIcon(tag);
        const entry = { ts: Date.now(), time: nowStr(), tag, icon, msg, level: 'info' };
        this._pushLog(entry);
    }
    logWarn(tag, msg) {
        const icon = getTagIcon(tag);
        const entry = { ts: Date.now(), time: nowStr(), tag, icon, msg, level: 'warn' };
        this._pushLog(entry);
    }
    logError(tag, msg) {
        const icon = getTagIcon(tag);
        const entry = { ts: Date.now(), time: nowStr(), tag, icon, msg, level: 'error' };
        this._pushLog(entry);
    }
    _pushLog(entry) {
        this._logs.push(entry);
        if (this._logs.length > this.MAX_LOGS) this._logs.shift();
        this.emit('log', { userId: this.userId, ...entry });

        // 将日志落到数据库中 (已使用 node22 高性能 SQLite)
        db.addLog(this.userId, entry.tag, entry.msg, entry.level);
    }
    getRecentLogs(n = 100) { return this._logs.slice(-n); }

    syncServerTime(ms) {
        this.serverTimeMs = ms;
        this.localTimeAtSync = Date.now();
    }
    getServerTimeSec() {
        if (!this.serverTimeMs) return Math.floor(Date.now() / 1000);
        const elapsed = Date.now() - this.localTimeAtSync;
        return Math.floor((this.serverTimeMs + elapsed) / 1000);
    }
    toTimeSec(val) {
        return toNum(val) > 1e12 ? Math.floor(toNum(val) / 1000) : toNum(val);
    }

    _checkDailyReset() {
        const todayKey = dateKeyFromServerSec(this.getServerTimeSec());
        if (this.lastResetDate === todayKey) return false;

        const oldDate = this.lastResetDate;
        this.lastResetDate = todayKey;
        this.operationLimits.clear();
        this.expTracker.clear();
        this.expExhausted.clear();
        this.dailyStats = {
            date: todayKey,
            expGained: 0,
            harvestCount: 0,
            stealCount: 0,
            helpWater: 0,
            helpWeed: 0,
            helpPest: 0,
            sellGold: 0,
        };
        if (oldDate) {
            this.log('系统', `跨日重置统计: ${oldDate} -> ${todayKey}`);
        }
        this.emit('statsUpdate', { userId: this.userId, dailyStats: this.dailyStats });
        return true;
    }

    async encodeMsg(serviceName, methodName, bodyBytes, clientSeqValue) {
        let finalBody = bodyBytes || Buffer.alloc(0);
        if (finalBody.length > 0) {
            finalBody = await cryptoWasm.encryptBuffer(finalBody);
        }
        const msg = types.GateMessage.create({
            meta: {
                service_name: serviceName, method_name: methodName, message_type: 1,
                client_seq: toLong(clientSeqValue), server_seq: toLong(this.serverSeq),
            },
            body: finalBody,
        });
        const encoded = types.GateMessage.encode(msg).finish();
        return encoded;
    }

    async sendMsg(serviceName, methodName, bodyBytes, callback, fixedSeq = null) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if (callback) callback(new Error('连接未打开'));
            return false;
        }
        const seq = fixedSeq !== null ? fixedSeq : this.clientSeq++;
        let encoded;
        try {
            encoded = await this.encodeMsg(serviceName, methodName, bodyBytes, seq);
        } catch (err) {
            if (callback) callback(err);
            return false;
        }
        if (callback) this.pendingCallbacks.set(seq, callback);
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if (callback) {
                this.pendingCallbacks.delete(seq);
                callback(new Error('连接已在加密途中关闭'));
            }
            return false;
        }
        try {
            this.ws.send(encoded);
        } catch (err) {
            if (callback) {
                this.pendingCallbacks.delete(seq);
                callback(err);
            }
            return false;
        }
        return true;
    }

    sendMsgAsync(serviceName, methodName, bodyBytes, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error(`连接未打开: ${methodName}`));
                return;
            }
            const seq = this.clientSeq;
            this.clientSeq += 1;
            const timer = setTimeout(() => {
                this.pendingCallbacks.delete(seq);
                reject(new Error(`请求超时: ${methodName} (seq=${seq})`));
            }, timeout);

            this.sendMsg(serviceName, methodName, bodyBytes, (err, body, meta) => {
                clearTimeout(timer);
                if (err) reject(err);
                else resolve({ body, meta });
            }, seq).then(sent => {
                if (!sent) {
                    clearTimeout(timer);
                    reject(new Error(`发送失败: ${methodName}`));
                }
            }).catch(err => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    async handleMessage(data) {
        try {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            let msg;
            try {
                msg = types.GateMessage.decode(buf);
            } catch (err) {
                this.logWarn('解码', `外层 GateMessage 解码失败: ${err.message}`);
                return;
            }

            const meta = msg.meta;
            if (!meta) return;

            if (meta.server_seq) {
                const seq = toNum(meta.server_seq);
                if (seq > this.serverSeq) this.serverSeq = seq;
            }
            const msgType = meta.message_type;

            if (msgType === 3) {
                try {
                    this.handleNotify(msg);
                } catch (e) {
                    this.logWarn('推送', `Notify 解码失败: ${e.message}`);
                }
                return;
            }

            if (msgType === 2) {
                const errorCode = toNum(meta.error_code);
                const clientSeqVal = toNum(meta.client_seq);
                const cb = this.pendingCallbacks.get(clientSeqVal);
                if (cb) {
                    this.pendingCallbacks.delete(clientSeqVal);
                    if (errorCode !== 0) {
                        cb(new Error(`${meta.service_name}.${meta.method_name} 错误: code=${errorCode} ${meta.error_message || ''}`));
                    } else {
                        cb(null, msg.body, meta);
                    }
                    return;
                }
            }
        } catch (err) {
            this.logWarn('解码', err.message);
        }
    }

    handleNotify(msg) {
        if (!msg.body || msg.body.length === 0) return;
        const event = types.EventMessage.decode(msg.body);
        const type = event.message_type || '';
        const eventBody = event.body;

        if (type.includes('Kickout')) {
            this.log('推送', `被踢下线! ${type}`);
            this._setStatus('error');
            this.errorMessage = '被踢下线';
            this.stop();
            return;
        }

        if (type.includes('LandsNotify')) {
            try {
                const notify = types.LandsNotify.decode(eventBody);
                const hostGid = toNum(notify.host_gid);
                const lands = notify.lands || [];
                if (lands.length > 0 && (hostGid === this.userState.gid || hostGid === 0)) {
                    this.emit('landsChanged', lands);
                }
            } catch (e) { this.logWarn('Notify', `LandsNotify 错误: ${e.message}`); }
            return;
        }

        if (type.includes('ItemNotify')) {
            try {
                const notify = types.ItemNotify.decode(eventBody);
                const items = notify.items || [];
                for (const itemChg of items) {
                    const item = itemChg.item;
                    if (!item) continue;
                    const id = toNum(item.id);
                    const count = toNum(item.count);
                    if (id === 1101 || id === 2) {
                        const oldExp = this.userState.exp || 0;
                        if (count > oldExp) {
                            this._checkDailyReset();
                            this.dailyStats.expGained += (count - oldExp);
                            this.emit('statsUpdate', { userId: this.userId, dailyStats: this.dailyStats });
                        }
                        this.userState.exp = count;
                    }
                    else if (id === 1 || id === 1001) { this.userState.gold = count; }
                    else if (id === 1002) { this.userState.coupon = count; }
                }
                this._emitStateUpdate();
            } catch (e) { this.logWarn('Notify', `ItemNotify 错误: ${e.message}`); }
            return;
        }

        if (type.includes('BasicNotify')) {
            try {
                const notify = types.BasicNotify.decode(eventBody);
                if (notify.basic) {
                    const oldLevel = this.userState.level;
                    this.userState.level = toNum(notify.basic.level) || this.userState.level;
                    this.userState.gold = toNum(notify.basic.gold) || this.userState.gold;
                    const exp = toNum(notify.basic.exp);
                    if (exp > 0) {
                        const oldExp = this.userState.exp || 0;
                        if (exp > oldExp) {
                            this._checkDailyReset();
                            this.dailyStats.expGained += (exp - oldExp);
                            this.emit('statsUpdate', { userId: this.userId, dailyStats: this.dailyStats });
                        }
                        this.userState.exp = exp;
                    }
                    if (this.userState.level !== oldLevel) {
                        this.log('系统', `🎉 升级! Lv${oldLevel} → Lv${this.userState.level}`);
                    }
                    this._emitStateUpdate();
                }
            } catch (e) { this.logWarn('Notify', `BasicNotify 错误: ${e.message}`); }
            return;
        }

        if (type.includes('FriendApplicationReceivedNotify')) {
            try {
                const notify = types.FriendApplicationReceivedNotify.decode(eventBody);
                const applications = notify.applications || [];
                if (applications.length > 0) this._handleFriendApplications(applications);
            } catch (e) { this.logWarn('Notify', `FriendApplicationReceivedNotify 错误: ${e.message}`); }
            return;
        }

        if (type.includes('TaskInfoNotify')) {
            try {
                const notify = types.TaskInfoNotify.decode(eventBody);
                if (notify.task_info) this._handleTaskNotify(notify.task_info);
            } catch (e) { this.logWarn('Notify', `TaskInfoNotify 错误: ${e.message}`); }
            return;
        }
    }

    sendLogin(onSuccess) {
        const body = types.LoginRequest.encode(types.LoginRequest.create({
            sharer_id: toLong(0), sharer_open_id: '', device_info: CONFIG.device_info,
            share_cfg_id: toLong(0), scene_id: '1256',
            report_data: {
                callback: '', cd_extend_info: '', click_id: '', clue_token: '',
                minigame_channel: 'other', minigame_platid: 2, req_id: '', trackid: '',
            },
        })).finish();

        this.sendMsg('gamepb.userpb.UserService', 'Login', body, (err, bodyBytes) => {
            if (err) { this.logError('登录', `登录失败: ${err.message}`); this._setStatus('error'); this.errorMessage = err.message; return; }
            let reply;
            try {
                reply = types.LoginReply.decode(bodyBytes);
            } catch (e) {
                this.logError('登录', `登录响应解码失败: ${e.message}`);
                this._setStatus('error'); this.errorMessage = '解码失败'; return;
            }
            if (reply.basic) {
                this.userState.gid = toNum(reply.basic.gid);
                this.userState.name = reply.basic.name || '未知';
                this.userState.level = toNum(reply.basic.level);
                this.userState.gold = toNum(reply.basic.gold);
                this.userState.exp = toNum(reply.basic.exp);
                if (reply.time_now_millis) this.syncServerTime(toNum(reply.time_now_millis));

                this.log('登录', `登录成功 | 昵称: ${this.userState.name} | GID: ${this.userState.gid} | 等级: Lv${this.userState.level} | 金币: ${this.userState.gold.toLocaleString()} | 经验: ${this.userState.exp.toLocaleString()}`);
                this._setStatus('running');
                this._updateExtraUserInfo(true).catch(e => this.logWarn('系统', `初始获取额外信息失败: ${e.message}`));
                this._emitStateUpdate();
            }
            this.startHeartbeat();
            if (onSuccess) onSuccess();
        });
    }

    startHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.lastHeartbeatResponse = Date.now();
        this.heartbeatMissCount = 0;

        this.heartbeatTimer = setInterval(() => {
            if (!this.userState.gid) return;
            const timeSince = Date.now() - this.lastHeartbeatResponse;
            if (timeSince > 60000) {
                this.heartbeatMissCount++;
                this.logWarn('心跳', `连接可能已断开 (${Math.round(timeSince / 1000)}s 无响应)`);
                if (this.heartbeatMissCount >= 3) {
                    this.log('心跳', '连接超时，停止运行');
                    this._setStatus('error');
                    this.errorMessage = '心跳超时';
                    this.stop();
                    return;
                }
            }
            const body = types.HeartbeatRequest.encode(types.HeartbeatRequest.create({
                gid: toLong(this.userState.gid), client_version: CONFIG.clientVersion,
            })).finish();
            this.sendMsg('gamepb.userpb.UserService', 'Heartbeat', body, (err, replyBody) => {
                if (err || !replyBody) return;
                this.lastHeartbeatResponse = Date.now();
                this.heartbeatMissCount = 0;
                try {
                    const reply = types.HeartbeatReply.decode(replyBody);
                    if (reply.server_time) this.syncServerTime(toNum(reply.server_time));
                } catch (e) { }
            });
        }, CONFIG.heartbeatInterval);
    }

    connect(code) {
        return new Promise((resolve, reject) => {
            this._setStatus('connecting');
            const url = `${CONFIG.serverUrl}?platform=${this.platform}&os=${CONFIG.os}&ver=${CONFIG.clientVersion}&code=${code}&openID=`;

            this.ws = new WebSocket(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
                    'Origin': 'https://gate-obt.nqf.qq.com',
                },
            });
            this.ws.binaryType = 'arraybuffer';

            this.ws.on('open', () => {
                this.log('WS', '连接已建立，正在登录...');
                this.sendLogin(async () => {
                    this.log('系统', `农场巡查间隔: ${rangeToText(this.farmIntervalRange)} | 好友巡查间隔: ${rangeToText(this.friendIntervalRange)}`);
                    this.startFarmLoop();
                    this.startFriendLoop();
                    this._initTaskSystem();
                    setTimeout(() => this._debugSellFruits(), 5000);
                    this._startSellLoop(60000);
                    this.startedAt = Date.now();
                    resolve();
                });
            });

            this.ws.on('message', (data) => this.handleMessage(Buffer.isBuffer(data) ? data : Buffer.from(data)));

            this.ws.on('close', (code, reason) => {
                this.log('WS', `连接关闭 (code=${code})`);
                if (this.status === 'running' || this.status === 'connecting') {
                    this._setStatus('error');
                    this.errorMessage = `连接关闭 code=${code}`;
                }
                this._cleanup();
                reject(new Error(`连接关闭 code=${code}`));
            });

            this.ws.on('error', (err) => {
                this.logWarn('WS', `错误: ${err.message}`);
                this._setStatus('error');
                this.errorMessage = err.message;
                reject(err);
            });
        });
    }

    // ================================================================
    //  其余保留逻辑：土地解锁、种植、循环判断（由于需要频繁操作this，为了安全暂留在主类，也可以进一步抽取）
    // ================================================================

    getCurrentPhase(phases) {
        if (!phases || phases.length === 0) return null;
        const nowSec = this.getServerTimeSec();
        for (let i = phases.length - 1; i >= 0; i--) {
            if (nowSec >= this.toTimeSec(phases[i].begin_time)) return phases[i];
        }
        return phases[0];
    }

    analyzeLands(lands) {
        const result = { harvestable: [], growing: [], empty: [], needWater: [], needWeed: [], needBug: [], dead: [] };
        for (const land of lands) {
            const id = toNum(land.id);
            if (!land.unlocked) continue;
            const plant = land.plant;
            if (!plant || !plant.phases || plant.phases.length === 0) { result.empty.push(id); continue; }

            const currentPhase = this.getCurrentPhase(plant.phases);
            if (!currentPhase) { result.empty.push(id); continue; }

            const phaseVal = currentPhase.phase;
            if (phaseVal === PlantPhase.MATURE) {
                if (plant.harvestable) result.harvestable.push(id);
                else result.growing.push(id);
                continue;
            }
            if (phaseVal === PlantPhase.DEAD) { result.dead.push(id); continue; }
            result.growing.push(id);
            if (toNum(plant.dry_num) > 0) result.needWater.push(id);
            if (plant.weed_owners && plant.weed_owners.length > 0) result.needWeed.push(id);
            if (plant.insect_owners && plant.insect_owners.length > 0) result.needBug.push(id);
        }
        return result;
    }

    async findBestSeed(unlockedLandCount) {
        if (this.preferredSeedId > 0) {
            const body = types.BagRequest.encode(types.BagRequest.create({})).finish();
            const { body: replyBody } = await this.sendMsgAsync('gamepb.itempb.ItemService', 'Bag', body);
            const bagReply = types.BagReply.decode(replyBody);
            const items = bagReply.item_bag && bagReply.item_bag.items ? bagReply.item_bag.items : (bagReply.items || []);
            const seedIdNum = Number(this.preferredSeedId);
            for (const item of items) {
                if (toNum(item.id) === seedIdNum && toNum(item.count) > 0) {
                    return { id: seedIdNum, count: toNum(item.count) };
                }
            }
            throw new Error(`仓库中没有指定的种子 (ID: ${seedIdNum})`);
        }

        const body = types.BagRequest.encode(types.BagRequest.create({})).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.itempb.ItemService', 'Bag', body);
        const bagReply = types.BagReply.decode(replyBody);
        const items = bagReply.item_bag && bagReply.item_bag.items ? bagReply.item_bag.items : (bagReply.items || []);

        let bestSeedId = null;
        let maxExp = -1;
        let seedCount = 0;
        const myLevel = this.userState.level || 1;

        for (const item of items) {
            const itemId = toNum(item.id);
            const count = toNum(item.count);
            if (count > 0 && String(itemId).length >= 5) {
                const requireLevel = Number(String(itemId).substring(0, 2)) || 1;
                if (requireLevel > myLevel) continue;
                try {
                    const plantName = getPlantNameBySeedId(itemId);
                    if (!plantName) continue;
                    const exp = getPlantExp(plantName);
                    if (exp > maxExp) {
                        maxExp = exp; bestSeedId = itemId; seedCount = count;
                    }
                } catch (e) { }
            }
        }

        if (!bestSeedId) {
            this.logWarn('仓库', '仓库无种子！准备购买...');
            return { id: await this.buySeed(unlockedLandCount), count: unlockedLandCount };
        }
        return { id: bestSeedId, count: seedCount };
    }

    async plantSeed(landIds, seedId) {
        try {
            const seedIdNum = Number(seedId);
            const body = types.PlantPlantRequest.encode(types.PlantPlantRequest.create({
                land_ids: landIds.map(id => toLong(id)), seed_id: toLong(seedIdNum),
            })).finish();
            await this.sendMsgAsync('gamepb.plantpb.PlantService', 'Plant', body);

            const name = getPlantNameBySeedId(seedIdNum) || seedIdNum;
            this.log('种植', `成功种植: ${name} (在 ${landIds.length} 块地上)`);
        } catch (e) { this.logWarn('种植', `种植失败: ${e.message}`); }
    }

    async _getStoreList() {
        const body = types.GetMallListBySlotTypeRequest.encode(types.GetMallListBySlotTypeRequest.create({ slot_type: 1 })).finish();
        const { body: replyBody } = await this.sendMsgAsync('gamepb.mallpb.MallService', 'GetMallListBySlotType', body);
        return types.GetMallListBySlotTypeResponse.decode(replyBody);
    }

    async buySeed(count) {
        const myLevel = this.userState.level || 1;
        const myGold = this.userState.gold || 0;

        let bestItem = null;
        let maxExp = -1;

        const storeReply = await this._getStoreList();
        const goodsList = storeReply.goods_list || [];
        for (const goodsBytes of goodsList) {
            try {
                const mallGoods = types.MallGoods.decode(goodsBytes);
                const itemBytes = mallGoods.goods_item;
                if (!itemBytes) continue;
                const storeItem = types.StoreObj.decode(itemBytes);
                const itemId = toNum(storeItem.id);
                if (String(itemId).length >= 5) {
                    const requireLevel = Number(String(itemId).substring(0, 2)) || 1;
                    if (requireLevel > myLevel) continue;
                    const price = toNum(storeItem.price);
                    if (myGold < price * count) continue;

                    const name = getPlantNameBySeedId(itemId);
                    if (!name) continue;
                    const exp = getPlantExp(name);
                    if (exp > maxExp) { maxExp = exp; bestItem = { goodsId: toNum(mallGoods.goods_id), itemId, price }; }
                }
            } catch (e) { }
        }

        if (!bestItem) throw new Error(`找不到可买的种子（金币不足或等级不够）我的等级=${myLevel}, 金币=${myGold}`);

        this.log('购买', `购买商店种子: ID=${bestItem.itemId}, 价格=${bestItem.price}`);
        const body = types.PurchaseRequest.encode(types.PurchaseRequest.create({
            goods_id: toLong(bestItem.goodsId), count: toNum(count),
        })).finish();
        await this.sendMsgAsync('gamepb.mallpb.MallService', 'Purchase', body);
        return bestItem.itemId;
    }

    _applyHarvestRewards(items = []) {
        if (!items || items.length === 0) return;
        for (const it of items) {
            const id = toNum(it.id);
            if (id === 1 || id === 1001) this.userState.gold += toNum(it.count);
            else if (id === 2 || id === 1101) this.userState.exp += toNum(it.count);
        }
    }

    async _harvestLands(landIds, { manual = false } = {}) {
        if (!landIds || landIds.length === 0) return 0;
        const reply = await this.harvest(landIds);
        this.log('收获', manual ? `🌾 手动收获完成 (${landIds.length}块地)` : `🌾 收获成功 (${landIds.length}块地)`);
        this._checkDailyReset();
        this.dailyStats.harvestCount += landIds.length;
        this.emit('statsUpdate', { userId: this.userId, dailyStats: this.dailyStats });
        this._applyHarvestRewards(reply?.items || []);

        // 记录统计数据 (按作物种类聚合)
        const cropCounts = {};
        for (const item of reply?.items || []) {
            const itemId = toNum(item.id);
            // 忽略纯金币和经验
            if (itemId === 1 || itemId === 1001 || itemId === 2 || itemId === 1101) continue;

            const name = getFruitName(itemId) || `未知果实(${item.id})`;
            const count = toNum(item.count);
            const itemInfo = getItemInfo(itemId);
            const itemPrice = itemInfo && itemInfo.price ? itemInfo.price : 0;
            const gold = count * itemPrice;

            if (!cropCounts[name]) cropCounts[name] = { count: 0, gold: 0 };
            cropCounts[name].count += count;
            cropCounts[name].gold += gold;
        }
        for (const [name, data] of Object.entries(cropCounts)) {
            db.addStatistic(this.userId, 'harvest', data.count, name, data.gold);
        }

        return landIds.length;
    }

    async _collectPlantTargets(analysis, { manual = false } = {}) {
        const toPlant = [...(analysis.empty || [])];
        let removedDead = 0;

        if (analysis.dead && analysis.dead.length > 0) {
            const deadIds = [...analysis.dead];
            await this.removePlant(deadIds);
            removedDead = deadIds.length;
            toPlant.push(...deadIds);
            this.log('铲除', manual ? `🪓 手动铲除枯萎作物 (${removedDead}块地)` : `铲除枯萎作物 (${removedDead}块地)`);
        }

        return { toPlant, removedDead };
    }

    async _plantByBestSeed(landIds, unlockedCount, { manual = false } = {}) {
        let planted = 0;
        const plantedLandIds = [];
        const queue = [...landIds];
        while (queue.length > 0) {
            let bestSeed;
            try {
                bestSeed = await this.findBestSeed(unlockedCount);
            } catch (err) {
                this.logWarn('种植', manual ? `手动种植中断: ${err.message}` : err.message);
                break;
            }

            const batch = queue.splice(0, Math.max(1, toNum(bestSeed.count)));
            if (batch.length === 0) break;
            await this.plantSeed(batch, bestSeed.id);
            planted += batch.length;
            plantedLandIds.push(...batch);
        }
        return { count: planted, landIds: plantedLandIds };
    }

    _normalizeFertilizerMode(input) {
        const mode = String(input || '').trim().toLowerCase();
        if (mode === 'normal' || mode === 'organic' || mode === 'both') return mode;
        return this.featureToggles.autoFertilize ? 'normal' : 'none';
    }

    _normalizeFertilizerSoilTypes(input) {
        if (!Array.isArray(input)) return [];
        const result = [];
        for (const item of input) {
            const soilType = Number(item);
            if (!Number.isFinite(soilType)) continue;
            if (soilType < 0 || soilType > 6) continue;
            if (result.includes(soilType)) continue;
            result.push(soilType);
        }
        return result;
    }

    _filterLandIdsBySoilTypes(landIds, lands, soilTypes) {
        const ids = [...new Set((Array.isArray(landIds) ? landIds : []).map(v => toNum(v)).filter(v => v > 0))];
        if (ids.length === 0) return [];
        if (!Array.isArray(soilTypes) || soilTypes.length === 0) return ids;

        const selected = new Set(soilTypes.map(v => Number(v)));
        const soilById = new Map();
        for (const land of (Array.isArray(lands) ? lands : [])) {
            const id = toNum(land && land.id);
            if (!id) continue;
            soilById.set(id, toNum(land.soil_type));
        }
        return ids.filter(id => selected.has(soilById.get(id)));
    }

    _collectRegrowTargets(latestLands, harvestedLandIds) {
        const harvestedSet = new Set((Array.isArray(harvestedLandIds) ? harvestedLandIds : []).map(v => toNum(v)).filter(Boolean));
        if (harvestedSet.size === 0) return [];

        const targets = [];
        for (const land of (latestLands || [])) {
            const id = toNum(land && land.id);
            if (!id || !harvestedSet.has(id)) continue;
            if (!land.unlocked) continue;
            const plant = land.plant;
            if (!plant || !plant.phases || plant.phases.length === 0) continue;
            const currentPhase = this.getCurrentPhase(plant.phases);
            if (!currentPhase) continue;
            const phaseVal = toNum(currentPhase.phase);
            if (phaseVal === PlantPhase.DEAD || phaseVal === PlantPhase.MATURE) continue;
            targets.push(id);
        }
        return targets;
    }

    async _runFertilizerStrategy(targetLandIds, lands, reasonLabel = '常规施肥') {
        if (!this.featureToggles.autoFertilize) return { normal: 0, organic: 0, applied: 0 };

        const mode = this._normalizeFertilizerMode(this.featureToggles.fertilizerMode);
        if (mode === 'none') return { normal: 0, organic: 0, applied: 0 };

        const selectedSoilTypes = this._normalizeFertilizerSoilTypes(this.featureToggles.fertilizerSoilTypes);
        const targets = this._filterLandIdsBySoilTypes(targetLandIds, lands, selectedSoilTypes);
        if (targets.length === 0) return { normal: 0, organic: 0, applied: 0 };

        let normal = 0;
        let organic = 0;
        if (mode === 'normal' || mode === 'both') {
            normal = await this.fertilize(targets, NORMAL_FERTILIZER_ID);
        }
        if (mode === 'organic' || mode === 'both') {
            organic = await this.fertilize(targets, ORGANIC_FERTILIZER_ID);
        }

        const applied = normal + organic;
        if (applied > 0) {
            const scopeText = selectedSoilTypes.length > 0 ? `土壤范围: ${selectedSoilTypes.join(',')}` : '土壤范围: 全部';
            this.log('施肥', `${reasonLabel}完成: 普通=${normal} 有机=${organic} (${scopeText})`);
        }
        return { normal, organic, applied };
    }

    async checkFarm() {
        if (this.isCheckingFarm) return;
        this.isCheckingFarm = true;
        try {
            const landsReply = await this.getAllLands();
            const lands = landsReply.lands || [];
            if (lands.length === 0) return;

            this._cachedLands = lands;
            this._cachedLandsTime = Date.now();

            const analysis = this.analyzeLands(lands);
            const unlockedCount = lands.filter(l => l && l.unlocked).length;
            let harvestedLandIds = [];
            let plantedLandIds = [];

            if (analysis.harvestable.length > 0 && this.featureToggles.autoHarvest) {
                try {
                    harvestedLandIds = [...analysis.harvestable];
                    await this._harvestLands(analysis.harvestable, { manual: false });
                    this._emitStateUpdate();
                } catch (e) { this.logWarn('收获', e.message); }
            }

            const { toPlant } = await this._collectPlantTargets(analysis, { manual: false });
            if (toPlant.length > 0 && this.featureToggles.autoPlant) {
                try {
                    const plantedResult = await this._plantByBestSeed(toPlant, unlockedCount, { manual: false });
                    plantedLandIds = plantedResult.landIds || [];
                } catch (e) { this.logWarn('种植', e.message); }
            }

            if (plantedLandIds.length > 0) {
                try {
                    await this._runFertilizerStrategy(plantedLandIds, lands, '常规施肥');
                } catch (e) { this.logWarn('施肥', `常规施肥失败: ${e.message}`); }
            }

            if (harvestedLandIds.length > 0 && this.featureToggles.fertilizerMultiSeason) {
                try {
                    const latestReply = await this.getAllLands();
                    const latestLands = latestReply.lands || [];
                    const regrowTargets = this._collectRegrowTargets(latestLands, harvestedLandIds);
                    if (regrowTargets.length > 0) {
                        await this._runFertilizerStrategy(regrowTargets, latestLands, '多季补肥');
                    }
                } catch (e) { this.logWarn('施肥', `多季补肥失败: ${e.message}`); }
            }

            if (analysis.needWater.length > 0 && this.featureToggles.autoWater) {
                await this.waterLand(analysis.needWater);
                this.log('浇水', `💦 给 ${analysis.needWater.length} 块地浇水`);
            }

            if (analysis.needWeed.length > 0 && this.featureToggles.autoWeed) {
                await this.weedOut(analysis.needWeed);
                this.log('除草', `🌿 给 ${analysis.needWeed.length} 块地除草`);
            }

            if (analysis.needBug.length > 0 && this.featureToggles.autoPest) {
                await this.insecticide(analysis.needBug);
                this.log('除虫', `🐛 给 ${analysis.needBug.length} 块地除虫`);
            }

            if (this.featureToggles.autoLandUnlock) {
                await this.checkLandUnlocks(lands);
            }

            if (this.featureToggles.autoLandUpgrade) {
                await this.checkLandUpgrades(lands);
            }
        } catch (err) {
            this.logWarn('农场', `检查农场失败: ${err.message}`);
        } finally {
            this.isCheckingFarm = false;
        }
    }

    async checkLandUnlocks(lands) {
        const lockedLands = lands.filter(l => !l.unlocked);
        if (lockedLands.length === 0) return;

        lockedLands.sort((a, b) => toNum(a.id) - toNum(b.id));
        const nextLand = lockedLands[0];

        if (nextLand.unlock_actions && nextLand.unlock_actions.length > 0) {
            const hasGoldAction = nextLand.unlock_actions.some(a => toNum(a.unlock_type) === 1);
            if (hasGoldAction) {
                try {
                    await this.unlockLand(toNum(nextLand.id), false);
                    this.log('解锁', `🔓 成功解锁土地 (ID: ${toNum(nextLand.id)})!`);
                } catch (e) {
                    // ignore if lack of resources
                }
            }
        }
    }

    async checkLandUpgrades(lands, opts = {}) {
        const targetType = Number(opts.targetType ?? this.featureToggles.landUpgradeTarget) || 6;
        if (targetType <= 0) return;

        const upgradeableLands = lands.filter(l => {
            if (!l.unlocked) return false;
            const t = toNum(l.soil_type) || 0;
            return t < targetType;
        });
        if (upgradeableLands.length === 0) return 0;

        upgradeableLands.sort((a, b) => toNum(a.id) - toNum(b.id));
        let upgradedCount = 0;

        for (const land of upgradeableLands) {
            try {
                await this.upgradeLand(toNum(land.id));
                upgradedCount++;
                const newType = (toNum(land.soil_type) || 0) + 1;
                if (!opts.compactLog) {
                    this.log('升级', `🌟 成功升级土地 (ID: ${toNum(land.id)}) 到 等级 ${newType}!`);
                }
            } catch (e) {
                if (opts.manual) this.logWarn('升级', `手动升级中断: ${e.message}`);
                break;
            }
        }
        return upgradedCount;
    }

    /**
     * 手动执行农场操作（用于前端一键按钮）
     * @param {'harvest'|'clear'|'plant'|'upgrade'|'removeDead'|'all'} opType
     */
    async manualFarmOperate(opType = 'all') {
        const allowedOps = new Set(['harvest', 'clear', 'plant', 'upgrade', 'removeDead', 'all']);
        if (!allowedOps.has(opType)) {
            throw new Error('不支持的操作类型');
        }
        if (this.status !== 'running') {
            throw new Error('Bot 未运行');
        }
        if (this.isCheckingFarm) {
            throw new Error('农场操作进行中，请稍后重试');
        }

        const result = {
            opType,
            harvested: 0,
            clearedWeed: 0,
            clearedBug: 0,
            watered: 0,
            removedDead: 0,
            planted: 0,
            upgraded: 0,
            message: '',
        };

        this.isCheckingFarm = true;
        try {
            let landsReply = await this.getAllLands();
            let lands = landsReply.lands || [];
            if (lands.length === 0) {
                result.message = '暂无土地数据';
                return result;
            }

            let analysis = this.analyzeLands(lands);
            const unlockedCount = lands.filter(l => l && l.unlocked).length;
            const doHarvest = opType === 'harvest' || opType === 'all';
            const doClear = opType === 'clear' || opType === 'all';
            const doPlant = opType === 'plant' || opType === 'all';
            const doUpgrade = opType === 'upgrade';
            const doRemoveDead = opType === 'removeDead';

            if (doHarvest && analysis.harvestable.length > 0) {
                result.harvested = await this._harvestLands(analysis.harvestable, { manual: true });
            }

            if (doClear && analysis.needWeed.length > 0) {
                const weedIds = [...analysis.needWeed];
                await this.weedOut(weedIds);
                result.clearedWeed = weedIds.length;
                this.log('除草', `🌿 手动除草完成 (${result.clearedWeed}块地)`);
            }

            if (doClear && analysis.needBug.length > 0) {
                const bugIds = [...analysis.needBug];
                await this.insecticide(bugIds);
                result.clearedBug = bugIds.length;
                this.log('除虫', `🐛 手动除虫完成 (${result.clearedBug}块地)`);
            }

            if (doClear && analysis.needWater.length > 0) {
                const waterIds = [...analysis.needWater];
                await this.waterLand(waterIds);
                result.watered = waterIds.length;
                this.log('浇水', `💦 手动浇水完成 (${result.watered}块地)`);
            }

            if (doRemoveDead && analysis.dead.length > 0) {
                const { removedDead } = await this._collectPlantTargets({
                    ...analysis,
                    empty: [],
                }, { manual: true });
                result.removedDead = removedDead;
            }

            if (doPlant) {
                // 重新获取一次地块状态，确保收获/清理后的状态准确
                landsReply = await this.getAllLands();
                lands = landsReply.lands || [];
                analysis = this.analyzeLands(lands);

                const { toPlant, removedDead } = await this._collectPlantTargets(analysis, { manual: true });
                result.removedDead = removedDead;
                const plantedResult = await this._plantByBestSeed(toPlant, unlockedCount, { manual: true });
                result.planted = plantedResult.count || 0;
            }

            if (doUpgrade) {
                landsReply = await this.getAllLands();
                lands = landsReply.lands || [];
                result.upgraded = await this.checkLandUpgrades(lands, { targetType: 6, manual: true, compactLog: true });
                if (result.upgraded > 0) {
                    this.log('升级', `🌟 手动升级土地完成 (${result.upgraded}块地)`);
                }
            }

            this._emitStateUpdate();

            const summary = [];
            if (result.harvested) summary.push(`收获 ${result.harvested} 块`);
            if (result.clearedWeed) summary.push(`除草 ${result.clearedWeed} 块`);
            if (result.clearedBug) summary.push(`除虫 ${result.clearedBug} 块`);
            if (result.watered) summary.push(`浇水 ${result.watered} 块`);
            if (result.removedDead) summary.push(`铲除枯萎 ${result.removedDead} 块`);
            if (result.planted) summary.push(`种植 ${result.planted} 块`);
            if (result.upgraded) summary.push(`升级 ${result.upgraded} 块`);

            result.message = summary.length > 0 ? `操作完成：${summary.join('，')}` : '未发现可执行项目';
            return result;
        } finally {
            this.isCheckingFarm = false;
        }
    }

    async farmCheckLoop() {
        if (this.farmLoopTaskRunning) return;
        this.farmLoopTaskRunning = true;
        while (this.farmLoopRunning) {
            await this.checkFarm();
            if (!this.farmLoopRunning) break;
            const delay = this._getRandomDelayMs(this.farmIntervalRange);
            await this._waitLoopDelay('farm', delay);
        }
        this.farmLoopTaskRunning = false;
        this.nextFarmCheckAt = 0;
        this._farmDelayController = null;
    }

    startFarmLoop() {
        if (this.farmLoopRunning) return;
        this.farmLoopRunning = true;
        this.nextFarmCheckAt = Date.now() + 2000;
        this.farmCheckTimer = setTimeout(() => this.farmCheckLoop(), 2000);
    }

    start(code) {
        if (this.status === 'running') throw new Error('Bot 已在运行中');
        this.errorMessage = '';
        this.log('系统', `🚀 Bot 正在启动... | 平台: ${this.platform} | 账号: ${this.userId}`);
        try { return this.connect(code); }
        catch (err) {
            this._setStatus('error');
            this.errorMessage = err.message;
            throw err;
        }
    }

    stop() {
        this.log('系统', '⏸️ Bot 正在停止...');
        this.farmLoopRunning = false;
        this.friendLoopRunning = false;
        this._cancelLoopDelay('farm');
        this._cancelLoopDelay('friend');
        if (this.farmCheckTimer) { clearTimeout(this.farmCheckTimer); this.farmCheckTimer = null; }
        if (this.friendCheckTimer) { clearTimeout(this.friendCheckTimer); this.friendCheckTimer = null; }
        this.nextFarmCheckAt = 0;
        this.nextFriendCheckAt = 0;
        this._cleanup();
        if (this.ws) {
            try { this.ws.close(); } catch (e) { }
            this.ws = null;
        }
        if (this.status !== 'error') this._setStatus('stopped');
        this.log('系统', '⏹️ Bot 已停止');
    }

    _cleanup() {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
        if (this.sellTimer) { clearInterval(this.sellTimer); this.sellTimer = null; }
        if (this.dailyRoutineTimer) { clearInterval(this.dailyRoutineTimer); this.dailyRoutineTimer = null; }
        this.pendingCallbacks.forEach((cb) => { try { cb(new Error('Bot 已停止')); } catch (e) { } });
        this.pendingCallbacks.clear();
    }

    _setStatus(newStatus) {
        const old = this.status;
        this.status = newStatus;
        if (old !== newStatus) {
            this.emit('statusChange', { userId: this.userId, oldStatus: old, newStatus, userState: this.userState });
        }
    }

    _emitStateUpdate() {
        this.emit('stateUpdate', {
            userId: this.userId, status: this.status,
            userState: { ...this.userState },
            startedAt: this.startedAt,
            levelProgress: getLevelExpProgress(this.userState.level || 0, this.userState.exp || 0),
        });
    }

    _getRandomDelayMs(range) {
        const normalized = normalizeIntervalRange(range, 10000);
        if (normalized.max <= normalized.min) return normalized.min;
        return normalized.min + Math.floor(Math.random() * (normalized.max - normalized.min + 1));
    }

    _waitLoopDelay(loopType, ms) {
        const delayMs = clampIntervalMs(ms, 0);
        const key = loopType === 'farm' ? '_farmDelayController' : '_friendDelayController';
        const nextAtKey = loopType === 'farm' ? 'nextFarmCheckAt' : 'nextFriendCheckAt';
        this[nextAtKey] = Date.now() + delayMs;

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (this[key] && this[key].timer === timer) this[key] = null;
                this[nextAtKey] = 0;
                resolve('timeout');
            }, delayMs);
            this[key] = { timer, resolve };
        });
    }

    _cancelLoopDelay(loopType) {
        const key = loopType === 'farm' ? '_farmDelayController' : '_friendDelayController';
        const nextAtKey = loopType === 'farm' ? 'nextFarmCheckAt' : 'nextFriendCheckAt';
        const controller = this[key];
        if (!controller) return false;
        clearTimeout(controller.timer);
        this[key] = null;
        this[nextAtKey] = 0;
        try { controller.resolve('cancel'); } catch (e) { }
        return true;
    }

    setIntervalRanges({ farmIntervalRange, friendIntervalRange } = {}, { resetCountdown = true, reason = '配置更新' } = {}) {
        let changed = false;
        if (farmIntervalRange) {
            this.farmIntervalRange = normalizeIntervalRange(farmIntervalRange, this.farmIntervalRange.min);
            this.farmInterval = this.farmIntervalRange.min;
            changed = true;
        }
        if (friendIntervalRange) {
            this.friendIntervalRange = normalizeIntervalRange(friendIntervalRange, this.friendIntervalRange.min);
            this.friendInterval = this.friendIntervalRange.min;
            changed = true;
        }
        if (!changed) return;

        this.log('配置', `${reason}: 农场 ${rangeToText(this.farmIntervalRange)} | 好友 ${rangeToText(this.friendIntervalRange)}`);
        if (resetCountdown) this.resetLoopCountdowns('保存配置后');
    }

    resetLoopCountdowns(reason = '') {
        const reasonText = reason ? ` (${reason})` : '';
        const farmCanceled = this._cancelLoopDelay('farm');
        const friendCanceled = this._cancelLoopDelay('friend');

        if (this.farmLoopRunning && !this.farmLoopTaskRunning) {
            if (this.farmCheckTimer) clearTimeout(this.farmCheckTimer);
            this.nextFarmCheckAt = Date.now();
            this.farmCheckTimer = setTimeout(() => this.farmCheckLoop(), 0);
        }
        if (this.friendLoopRunning && !this.friendLoopTaskRunning) {
            if (this.friendCheckTimer) clearTimeout(this.friendCheckTimer);
            this.nextFriendCheckAt = Date.now();
            this.friendCheckTimer = setTimeout(() => this.friendCheckLoop(), 0);
        }
        if (farmCanceled || friendCanceled) {
            this.log('系统', `已重置巡查倒计时${reasonText}`);
        }
    }

    getSnapshot() {
        return {
            userId: this.userId, status: this.status, errorMessage: this.errorMessage,
            platform: this.platform, userState: { ...this.userState },
            levelProgress: getLevelExpProgress(this.userState.level || 0, this.userState.exp || 0),
            farmInterval: this.farmInterval, friendInterval: this.friendInterval,
            farmIntervalMin: this.farmIntervalRange.min,
            farmIntervalMax: this.farmIntervalRange.max,
            friendIntervalMin: this.friendIntervalRange.min,
            friendIntervalMax: this.friendIntervalRange.max,
            nextFarmCheckAt: this.nextFarmCheckAt || 0,
            nextFriendCheckAt: this.nextFriendCheckAt || 0,
            isCheckingFarm: !!this.isCheckingFarm,
            isCheckingFriends: !!this.isCheckingFriends,
            startedAt: this.startedAt, uptime: this.startedAt ? Date.now() - this.startedAt : 0,
            featureToggles: { ...this.featureToggles }, dailyStats: { ...this.dailyStats },
            preferredSeedId: this.preferredSeedId,
        };
    }

    async getDetailedLandStatus() {
        try {
            const landsReply = await this.getAllLands();
            if (!landsReply.lands) return null;
            const lands = landsReply.lands;
            this._cachedLands = lands;
            this._cachedLandsTime = Date.now();

            const analysis = this.analyzeLands(lands);
            const totalLands = lands.length;
            const unlockedCount = lands.filter(l => l && l.unlocked).length;
            const lockedCount = totalLands - unlockedCount;

            const landDetails = [];
            for (const land of lands) {
                const id = toNum(land.id);
                const unlocked = !!land.unlocked;
                const detail = { id, unlocked, soilType: toNum(land.soil_type) || 0 };
                if (!unlocked) { landDetails.push(detail); continue; }

                const plant = land.plant;
                if (!plant || !plant.phases || plant.phases.length === 0) {
                    detail.status = 'empty';
                    landDetails.push(detail);
                    continue;
                }

                const currentPhase = this.getCurrentPhase(plant.phases);
                const phaseVal = currentPhase ? currentPhase.phase : 0;
                const plantId = toNum(plant.id);
                const plantName = getPlantName(plantId) || plant.name || '未知';

                detail.plantId = plantId;
                detail.plantName = plantName;
                detail.phase = phaseVal;
                detail.phaseName = PHASE_NAMES[phaseVal] || '未知';

                if (phaseVal === PlantPhase.DEAD) {
                    detail.status = 'dead';
                } else if (phaseVal === PlantPhase.MATURE) {
                    detail.status = 'harvestable';
                    detail.progress = 100;
                } else {
                    detail.status = 'growing';
                    const firstPhase = plant.phases[0];
                    const maturePhase = plant.phases.find(p => p.phase === PlantPhase.MATURE);
                    if (maturePhase && firstPhase) {
                        const nowSec = this.getServerTimeSec();
                        const beginSec = this.toTimeSec(firstPhase.begin_time);
                        const matureBegin = this.toTimeSec(maturePhase.begin_time);

                        if (matureBegin > nowSec) {
                            detail.timeLeftSec = matureBegin - nowSec;
                            const totalGrowth = matureBegin - beginSec;
                            const currentGrowth = nowSec - beginSec;
                            detail.progress = Math.min(99.9, Math.max(0, (currentGrowth / totalGrowth) * 100)).toFixed(1);
                        } else {
                            detail.progress = 100;
                        }
                    } else {
                        detail.progress = 0;
                    }
                }
                detail.iconFile = getCropIconFile(plantId);
                detail.needWater = analysis.needWater.includes(id);
                detail.needWeed = analysis.needWeed.includes(id);
                detail.needBug = analysis.needBug.includes(id);
                landDetails.push(detail);
            }

            return {
                totalLands, unlockedCount, lockedCount,
                harvestable: analysis.harvestable.length, growing: analysis.growing.length,
                empty: analysis.empty.length, dead: analysis.dead.length,
                needAttention: analysis.needWater.length + analysis.needWeed.length + analysis.needBug.length,
                lands: landDetails, updatedAt: Date.now(),
            };
        } catch (err) {
            this.logWarn('API', `获取土地状态失败: ${err.message}`);
            return null;
        }
    }

    setFeatureToggles(toggles) {
        Object.assign(this.featureToggles, toggles);
        this.log('配置', `功能开关已更新: ${JSON.stringify(toggles)}`);
        this.emit('settingsUpdate', { userId: this.userId, featureToggles: this.featureToggles });
    }

    setPreferredSeedId(seedId) {
        this.preferredSeedId = seedId || 0;
        const name = seedId ? (getPlantNameBySeedId(seedId) || seedId) : '自动选择';
        this.log('配置', `种植作物已设置: ${name}`);
    }

    destroy() {
        this.stop();
        this.removeAllListeners();
    }
}

// 混入独立模块拆分下来的行为方法到 BotInstance 的原型中
Object.assign(BotInstance.prototype, FarmActions);
Object.assign(BotInstance.prototype, FriendActions);
Object.assign(BotInstance.prototype, WarehouseActions);
Object.assign(BotInstance.prototype, RewardActions);

module.exports = { BotInstance };
