<template>
  <div class="account-home" v-loading="loading">
    <div class="user-profile-card">
      <div class="profile-main">
        <img class="profile-avatar" :src="`https://q.qlogo.cn/headimg_dl?dst_uin=${uin}&spec=640&img_type=jpg`" :alt="uin" />
        <div class="profile-info">
          <div class="profile-name">{{ snapshot?.userState?.name || '-' }}</div>
          <div class="profile-uin">账号: {{ uin }}</div>
        </div>
      </div>
      <div class="profile-actions">
        <el-tag :type="isRunning ? 'success' : 'danger'" effect="dark" size="small" round>
          {{ isRunning ? '已连接' : '未连接' }}
        </el-tag>
        <el-button v-if="!isRunning" type="primary" size="small" @click="handleStart">启动Bot</el-button>
        <el-button v-else type="warning" size="small" @click="handleStop">停止Bot</el-button>
        <span v-if="isRunning && uptime > 0" class="uptime-text">在线时长 {{ formatUptime(uptime) }}</span>
      </div>
    </div>

    <div class="metrics-grid" v-if="snapshot?.userState">
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-title">等级</span>
          <span class="metric-value level">Lv{{ userState.level || 0 }}</span>
        </div>
        <div class="exp-progress-header">
          <span>经验进度</span>
          <span>{{ formatNum(levelProgress.current) }} / {{ formatNum(levelProgress.needed) }}</span>
        </div>
        <div class="exp-progress-track">
          <div class="exp-progress-bar" :style="{ width: `${expProgressPercent}%` }" />
        </div>
        <div class="exp-progress-foot">
          <span class="exp-today">今日 +{{ formatNum(todayExpGainLocal) }}</span>
          <span class="exp-history">累计 {{ formatNum(expBeforeToday) }}</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-title">金币 / 点券</div>
        <div class="asset-grid">
          <div class="asset-cell">
            <div class="asset-label">金币</div>
            <div class="metric-value gold">{{ formatNum(userState.gold) }}</div>
            <div class="metric-delta" :class="getDeltaClass(dailyDelta.gold)">
              {{ formatSigned(dailyDelta.gold) }}
            </div>
          </div>
          <div class="asset-cell">
            <div class="asset-label">点券</div>
            <div class="metric-value coupon">{{ formatNum(userState.coupon) }}</div>
            <div class="metric-delta" :class="getDeltaClass(dailyDelta.coupon)">
              {{ formatSigned(dailyDelta.coupon) }}
            </div>
          </div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-title">化肥</div>
        <div class="asset-grid">
          <div class="asset-cell">
            <div class="asset-label">普通</div>
            <div class="metric-value">{{ formatHours(userState.fertilizer?.normal) }}</div>
            <div class="metric-delta" :class="getDeltaClass(dailyDelta.fertilizerNormal)">
              {{ formatSignedHours(dailyDelta.fertilizerNormal) }}
            </div>
          </div>
          <div class="asset-cell">
            <div class="asset-label">有机</div>
            <div class="metric-value">{{ formatHours(userState.fertilizer?.organic) }}</div>
            <div class="metric-delta" :class="getDeltaClass(dailyDelta.fertilizerOrganic)">
              {{ formatSignedHours(dailyDelta.fertilizerOrganic) }}
            </div>
          </div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-title">收藏点</div>
        <div class="asset-grid">
          <div class="asset-cell">
            <div class="asset-label">普通</div>
            <div class="metric-value">{{ formatNum(userState.collectionPoints?.normal) }}</div>
            <div class="metric-delta" :class="getDeltaClass(dailyDelta.collectionNormal)">
              {{ formatSigned(dailyDelta.collectionNormal) }}
            </div>
          </div>
          <div class="asset-cell">
            <div class="asset-label">典藏</div>
            <div class="metric-value">{{ formatNum(userState.collectionPoints?.classic) }}</div>
            <div class="metric-delta" :class="getDeltaClass(dailyDelta.collectionClassic)">
              {{ formatSigned(dailyDelta.collectionClassic) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section-card" v-if="stats">
      <div class="section-header">
        <h3 class="section-title">今日统计</h3>
        <span class="section-date">{{ stats.date }}</span>
      </div>
      <div class="stats-detail-grid">
        <div class="stat-detail">
          <div class="stat-detail-icon">🌟</div>
          <div>
            <div class="stat-detail-value">{{ stats.expGained }}</div>
            <div class="stat-detail-label">获得经验</div>
          </div>
        </div>
        <div class="stat-detail">
          <div class="stat-detail-icon">🌾</div>
          <div>
            <div class="stat-detail-value">{{ stats.harvestCount }}</div>
            <div class="stat-detail-label">收获次数</div>
          </div>
        </div>
        <div class="stat-detail">
          <div class="stat-detail-icon">🥬</div>
          <div>
            <div class="stat-detail-value">{{ stats.stealCount }}</div>
            <div class="stat-detail-label">偷菜次数</div>
          </div>
        </div>
        <div class="stat-detail">
          <div class="stat-detail-icon">💧</div>
          <div>
            <div class="stat-detail-value">{{ stats.helpWater }}</div>
            <div class="stat-detail-label">帮浇水</div>
          </div>
        </div>
        <div class="stat-detail">
          <div class="stat-detail-icon">🌿</div>
          <div>
            <div class="stat-detail-value">{{ stats.helpWeed }}</div>
            <div class="stat-detail-label">帮除草</div>
          </div>
        </div>
        <div class="stat-detail">
          <div class="stat-detail-icon">💰</div>
          <div>
            <div class="stat-detail-value">{{ stats.sellGold }}</div>
            <div class="stat-detail-label">出售金币</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section-card countdown-card">
      <div class="section-header">
        <h3 class="section-title">下一次巡查剩余时间</h3>
      </div>
      <div class="countdown-grid">
        <div class="countdown-item">
          <div class="countdown-label">农场巡查</div>
          <div class="countdown-value">{{ nextFarmCheckText }}</div>
        </div>
        <div class="countdown-item">
          <div class="countdown-label">好友巡查</div>
          <div class="countdown-value">{{ nextFriendCheckText }}</div>
        </div>
      </div>
    </div>

    <AccountLogs :uin="props.uin" />

    <div v-if="!snapshot && !loading" class="empty-state">
      <el-empty description="暂无数据，请先启动 Bot" />
    </div>

    <AccountLoginDialog
      v-model:visible="loginDialogVisible"
      :initial-uin="props.uin"
      :initial-platform="initialPlatform"
      @confirm="handleLoginConfirm"
      @cancel="handleDialogCancel"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getAccountSnapshot, stopBot, addAccountByCode } from '../api/index.js'
import { onEvent, offEvent } from '../socket/index.js'
import AccountLoginDialog from '../components/AccountLoginDialog.vue'
import AccountLogs from './AccountLogs.vue'

const DAILY_BASELINE_PREFIX = 'qqfarm:daily-metrics-base'

const props = defineProps({ uin: String })
const uin = computed(() => props.uin || '')

const loading = ref(false)
const snapshot = ref(null)
const stats = ref(null)
const uptime = ref(0)
const nowTs = ref(Date.now())
const dailyBaseline = ref(null)
const dailyBaselineDate = ref('')

let uptimeTimer = null
let refreshTimer = null
let countdownTimer = null

const loginDialogVisible = ref(false)
const initialPlatform = computed(() => {
  if (snapshot.value?.platform === 'wx' || snapshot.value?.platform === 'qq') {
    return snapshot.value.platform
  }
  return props.uin?.startsWith('wx_') ? 'wx' : 'qq'
})

const userState = computed(() => snapshot.value?.userState || {})
const isRunning = computed(() => snapshot.value?.status === 'running')

const levelProgress = computed(() => {
  const progress = snapshot.value?.levelProgress || {}
  return {
    current: Number(progress.current || 0),
    needed: Number(progress.needed || 0),
  }
})

const expProgressPercent = computed(() => {
  const needed = levelProgress.value.needed
  if (!needed) return 0
  return Math.max(0, Math.min(100, (levelProgress.value.current / needed) * 100))
})

const dailyDelta = computed(() => {
  const cur = getCurrentMetrics(snapshot.value)
  const base = dailyBaseline.value || cur
  return {
    gold: cur.gold - base.gold,
    coupon: cur.coupon - base.coupon,
    exp: cur.exp - base.exp,
    fertilizerNormal: cur.fertilizerNormal - base.fertilizerNormal,
    fertilizerOrganic: cur.fertilizerOrganic - base.fertilizerOrganic,
    collectionNormal: cur.collectionNormal - base.collectionNormal,
    collectionClassic: cur.collectionClassic - base.collectionClassic,
  }
})

const todayExpGainLocal = computed(() => Math.max(0, dailyDelta.value.exp || 0))
const expBeforeToday = computed(() => {
  const totalExp = Number(userState.value.exp || 0)
  return Math.max(0, totalExp - todayExpGainLocal.value)
})

const nextFarmCheckText = computed(() => buildNextCheckText('farm'))
const nextFriendCheckText = computed(() => buildNextCheckText('friend'))

function getBeijingDateKey(ts = Date.now()) {
  const bjMs = ts + 8 * 3600 * 1000
  const d = new Date(bjMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getBaselineStorageKey(uin, date) {
  return `${DAILY_BASELINE_PREFIX}:${uin}:${date}`
}

function toNumber(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function getCurrentMetrics(data) {
  const state = data?.userState || {}
  const fertilizer = state.fertilizer || {}
  const collection = state.collectionPoints || {}
  return {
    gold: toNumber(state.gold),
    coupon: toNumber(state.coupon),
    exp: toNumber(state.exp),
    fertilizerNormal: toNumber(fertilizer.normal),
    fertilizerOrganic: toNumber(fertilizer.organic),
    collectionNormal: toNumber(collection.normal),
    collectionClassic: toNumber(collection.classic),
  }
}

function loadDailyBaseline(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function saveDailyBaseline(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // ignore localStorage failures
  }
}

function syncDailyBaseline() {
  if (!props.uin || !snapshot.value?.userState) return

  const date = getBeijingDateKey()
  const key = getBaselineStorageKey(props.uin, date)
  const current = getCurrentMetrics(snapshot.value)
  const loaded = loadDailyBaseline(key)

  const baseline = {
    gold: toNumber(loaded?.gold, current.gold),
    coupon: toNumber(loaded?.coupon, current.coupon),
    exp: toNumber(loaded?.exp, current.exp),
    fertilizerNormal: toNumber(loaded?.fertilizerNormal, current.fertilizerNormal),
    fertilizerOrganic: toNumber(loaded?.fertilizerOrganic, current.fertilizerOrganic),
    collectionNormal: toNumber(loaded?.collectionNormal, current.collectionNormal),
    collectionClassic: toNumber(loaded?.collectionClassic, current.collectionClassic),
  }

  if (!loaded) {
    saveDailyBaseline(key, baseline)
  }

  dailyBaseline.value = baseline
  dailyBaselineDate.value = date
}

function applySnapshot(data) {
  snapshot.value = data
  stats.value = data?.dailyStats || null

  if (data?.startedAt) {
    uptime.value = Date.now() - data.startedAt
    startUptimeTimer(data.startedAt)
  } else {
    uptime.value = 0
    stopUptimeTimer()
  }

  syncDailyBaseline()
}

async function fetchData() {
  loading.value = true
  try {
    const res = await getAccountSnapshot(props.uin)
    applySnapshot(res.data)
  } catch {
    // ignore fetch failure to avoid interrupting UI
  } finally {
    loading.value = false
  }
}

function startUptimeTimer(startedAt) {
  stopUptimeTimer()
  uptimeTimer = setInterval(() => {
    uptime.value = Date.now() - startedAt
  }, 1000)
}

function stopUptimeTimer() {
  if (uptimeTimer) {
    clearInterval(uptimeTimer)
    uptimeTimer = null
  }
}

async function handleStart() {
  loginDialogVisible.value = true
}

async function handleLoginConfirm(form) {
  try {
    await addAccountByCode({
      code: form.code,
      uin: form.uin,
      platform: form.platform,
      farmIntervalMin: form.farmIntervalMin,
      farmIntervalMax: form.farmIntervalMax,
      friendIntervalMin: form.friendIntervalMin,
      friendIntervalMax: form.friendIntervalMax,
      farmInterval: form.farmInterval,
      friendInterval: form.friendInterval,
    })
    ElMessage.success('登录成功')
    loginDialogVisible.value = false
    fetchData()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function handleDialogCancel() {
  loginDialogVisible.value = false
}

async function handleStop() {
  try {
    await stopBot(props.uin)
    ElMessage.success('已停止')
    fetchData()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function formatNum(n) {
  return Number(toNumber(n)).toLocaleString()
}

function formatHours(sec) {
  return `${(toNumber(sec) / 3600).toFixed(1)}h`
}

function formatSigned(n) {
  const num = toNumber(n)
  if (num > 0) return `+${formatNum(num)}`
  if (num < 0) return `-${formatNum(Math.abs(num))}`
  return '0'
}

function formatSignedHours(sec) {
  const num = toNumber(sec)
  const hours = (Math.abs(num) / 3600).toFixed(1)
  if (num > 0) return `+${hours}h`
  if (num < 0) return `-${hours}h`
  return '0.0h'
}

function getDeltaClass(val) {
  const num = toNumber(val)
  if (num > 0) return 'delta-positive'
  if (num < 0) return 'delta-negative'
  return 'delta-neutral'
}

function formatUptime(ms) {
  if (!ms || ms <= 0) return '0秒'
  const totalSecs = Math.floor(ms / 1000)
  const days = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  const parts = []
  if (days > 0) parts.push(`${days}天`)
  if (hours > 0) parts.push(`${hours}小时`)
  if (mins > 0) parts.push(`${mins}分`)
  parts.push(`${secs}秒`)
  return parts.join('')
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '00:00:00'
  const totalSecs = Math.floor(ms / 1000)
  const days = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  const pad = (v) => String(v).padStart(2, '0')
  if (days > 0) return `${days}天 ${pad(hours)}:${pad(mins)}:${pad(secs)}`
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
}

function buildNextCheckText(type) {
  if (!snapshot.value || snapshot.value.status !== 'running') return '账号未登录'

  if (type === 'farm' && snapshot.value.isCheckingFarm) return '巡查中...'
  if (type === 'friend' && snapshot.value.isCheckingFriends) return '巡查中...'

  const nextAt = type === 'farm'
    ? toNumber(snapshot.value.nextFarmCheckAt)
    : toNumber(snapshot.value.nextFriendCheckAt)

  if (!nextAt || nextAt <= 0) return '等待巡查...'

  const remainMs = nextAt - nowTs.value
  if (remainMs <= 0) return '等待巡查...'
  return formatDuration(remainMs)
}

function onStateUpdate(data) {
  if (data.userId !== props.uin) return
  if (!snapshot.value) return

  snapshot.value = {
    ...snapshot.value,
    status: data.status,
    userState: data.userState,
    startedAt: data.startedAt,
    levelProgress: data.levelProgress || snapshot.value.levelProgress,
  }

  if (data.startedAt) {
    uptime.value = Date.now() - data.startedAt
    startUptimeTimer(data.startedAt)
  } else if (data.status !== 'running') {
    uptime.value = 0
    stopUptimeTimer()
  }

  syncDailyBaseline()
}

onMounted(() => {
  fetchData()
  refreshTimer = setInterval(fetchData, 5000)
  countdownTimer = setInterval(() => {
    nowTs.value = Date.now()
    if (dailyBaselineDate.value && dailyBaselineDate.value !== getBeijingDateKey()) {
      syncDailyBaseline()
    }
  }, 1000)
  onEvent('bot:stateUpdate', onStateUpdate)
})

onUnmounted(() => {
  offEvent('bot:stateUpdate', onStateUpdate)
  stopUptimeTimer()
  if (refreshTimer) clearInterval(refreshTimer)
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<style scoped>
.user-profile-card {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border);
}

.profile-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.profile-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 3px solid var(--bg-base);
  box-shadow: var(--shadow);
  object-fit: cover;
  background: var(--bg-hover);
  flex-shrink: 0;
}

.profile-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}

.profile-uin {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

.profile-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.uptime-text {
  color: var(--color-success);
  font-size: 13px;
  font-weight: 600;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.metric-card {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.metric-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.metric-title {
  font-size: 13px;
  color: var(--text-muted);
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.15;
}

.metric-value.level {
  color: var(--color-success);
}

.metric-value.gold {
  color: var(--color-warning);
}

.metric-value.coupon {
  color: var(--color-primary);
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.asset-cell {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: var(--bg-base);
}

.asset-label {
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 6px;
}

.metric-delta {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
}

.delta-positive {
  color: var(--color-success);
}

.delta-negative {
  color: var(--color-danger);
}

.delta-neutral {
  color: var(--text-muted);
}

.exp-progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 6px;
}

.exp-progress-track {
  height: 6px;
  background: var(--bg-hover);
  border-radius: 999px;
  overflow: hidden;
}

.exp-progress-bar {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.exp-progress-foot {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.exp-today {
  color: var(--color-success);
  font-weight: 600;
}

.exp-history {
  color: #3b82f6;
  font-weight: 600;
}

.section-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.section-date {
  color: var(--text-muted);
  font-size: 13px;
}

.stats-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.stat-detail {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-detail-icon {
  font-size: 24px;
}

.stat-detail-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}

.stat-detail-label {
  font-size: 12px;
  color: var(--text-muted);
}

.countdown-card .section-header {
  margin-bottom: 12px;
}

.countdown-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.countdown-item {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-base);
}

.countdown-label {
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 6px;
}

.countdown-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}

.empty-state {
  padding: 60px 20px;
  text-align: center;
}

@media (max-width: 1024px) {
  .stats-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .user-profile-card {
    padding: 14px;
    flex-direction: column;
    align-items: flex-start;
  }

  .profile-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .profile-avatar {
    width: 54px;
    height: 54px;
  }

  .profile-name {
    font-size: 17px;
  }

  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .metric-card {
    padding: 12px;
  }

  .metric-value {
    font-size: 18px;
  }

  .countdown-grid,
  .stats-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .countdown-value {
    font-size: 16px;
  }

  .section-card {
    padding: 14px;
  }
}

@media (max-width: 520px) {
  .metrics-grid,
  .asset-grid,
  .countdown-grid,
  .stats-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
