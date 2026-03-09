<template>
  <div class="account-home" v-loading="loading">
    <!-- 用户信息卡片 -->
    <div class="user-profile-card">
      <img class="profile-avatar" :src="`https://q.qlogo.cn/headimg_dl?dst_uin=${uin}&spec=640&img_type=jpg`" :alt="uin" />
      <div class="profile-info">
        <div class="profile-name">{{ snapshot?.userState?.name || '-' }}</div>
        <div class="profile-uin">QQ: {{ uin }}</div>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-card">
        <div class="info-label">等级</div>
        <div class="info-value level">Lv{{ snapshot?.userState?.level || 0 }}</div>
      </div>
      <div class="info-card">
        <div class="info-label">金币</div>
        <div class="info-value gold">{{ formatNum(snapshot?.userState?.gold) }}</div>
      </div>
      <div class="info-card">
        <div class="info-label">经验</div>
        <div class="info-value">{{ formatNum(snapshot?.userState?.exp) }}</div>
      </div>
    </div>

    <!-- 额外数据 (化肥/收藏点) -->
    <div class="extra-data-grid" v-if="snapshot?.userState?.fertilizer">
      <div class="extra-card">
        <div class="extra-card-header">
          <el-icon><Pouring /></el-icon> 化肥容器
        </div>
        <div class="extra-card-body">
          <div class="extra-item">
            <div class="extra-label">普通</div>
            <div class="extra-value">{{ (snapshot.userState.fertilizer.normal / 3600).toFixed(1) }}h</div>
          </div>
          <div class="extra-item">
            <div class="extra-label">有机</div>
            <div class="extra-value organic">{{ (snapshot.userState.fertilizer.organic / 3600).toFixed(1) }}h</div>
          </div>
        </div>
      </div>
      <div class="extra-card">
        <div class="extra-card-header">
          <el-icon><CollectionTag /></el-icon> 收藏点
        </div>
        <div class="extra-card-body">
          <div class="extra-item">
            <div class="extra-label">普通</div>
            <div class="extra-value">{{ snapshot.userState.collectionPoints?.normal || 0 }}</div>
          </div>
          <div class="extra-item">
            <div class="extra-label">典藏</div>
            <div class="extra-value classic">{{ snapshot.userState.collectionPoints?.classic || 0 }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 连接状态 -->
    <div class="status-bar">
      <el-tag :type="snapshot?.status === 'running' ? 'success' : 'danger'" effect="dark" size="small" round>
        {{ snapshot?.status === 'running' ? '已连接' : '未连接' }}
      </el-tag>
      <el-button v-if="snapshot?.status !== 'running'" type="primary" size="small" @click="handleStart">启动Bot</el-button>
      <el-button v-else type="warning" size="small" @click="handleStop">停止Bot</el-button>
      <span v-if="snapshot?.status === 'running' && uptime" class="uptime-text">
        ⭐ 挂机时长: {{ formatUptime(uptime) }}
      </span>
    </div>

    <!-- 今日统计 -->
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

    <!-- 运行日志（已合并到首页） -->
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

const props = defineProps({ uin: String })

const loading = ref(false)
const snapshot = ref(null)
const stats = ref(null)
const uptime = ref(0)
let uptimeTimer = null
let timer = null

const loginDialogVisible = ref(false)
const initialPlatform = computed(() => {
  if (snapshot.value?.platform === 'wx' || snapshot.value?.platform === 'qq') {
    return snapshot.value.platform
  }
  return props.uin?.startsWith('wx_') ? 'wx' : 'qq'
})

async function fetchData() {
  loading.value = true
  try {
    const res = await getAccountSnapshot(props.uin)
    snapshot.value = res.data
    stats.value = res.data.dailyStats || null
    // 初始化挂机时长
    if (res.data.startedAt) {
      uptime.value = Date.now() - res.data.startedAt
      startUptimeTimer(res.data.startedAt)
    } else {
      uptime.value = 0
      stopUptimeTimer()
    }
  } catch { /* */ } finally {
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
  // 无法复用 Session，点击启动直接弹出 Code 登录框
  loginDialogVisible.value = true
}

async function handleLoginConfirm(form) {
  try {
    await addAccountByCode({
      code: form.code,
      uin: form.uin,
      platform: form.platform,
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
  try { await stopBot(props.uin); ElMessage.success('已停止'); fetchData() }
  catch (e) { ElMessage.error(e.message) }
}

function formatNum(n) { return n ? Number(n).toLocaleString() : '0' }

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

function onStateUpdate(data) {
  if (data.userId !== props.uin) return
  if (snapshot.value) {
    snapshot.value.status = data.status
    snapshot.value.userState = data.userState
    // 更新挂机时长
    if (data.startedAt) {
      uptime.value = Date.now() - data.startedAt
      startUptimeTimer(data.startedAt)
    } else if (data.status !== 'running') {
      uptime.value = 0
      stopUptimeTimer()
    }
  }
}

onMounted(() => {
  fetchData()
  timer = setInterval(fetchData, 5000)
  onEvent('bot:stateUpdate', onStateUpdate)
})
onUnmounted(() => {
  offEvent('bot:stateUpdate', onStateUpdate)
  stopUptimeTimer()
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.user-profile-card {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 32px;
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.user-profile-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15);
}

.profile-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 4px solid var(--bg-base);
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

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.info-card {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 20px 16px;
  text-align: center;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  transition: transform 0.2s;
}
.info-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.info-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.info-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}

.info-value.gold { color: var(--color-warning); }
.info-value.level { color: var(--color-success); }
.info-value.name { font-size: 18px; }

.status-bar {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.uptime-text {
  font-size: 13px;
  color: var(--color-success);
  font-weight: 500;
  margin-left: auto;
  margin-right: 8px;
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
  margin-bottom: 16px;
}

.section-header .section-title {
  margin-bottom: 0;
}

.section-date {
  color: var(--text-muted);
  font-size: 13px;
}

/* 今日统计 */
.stats-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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

/* 额外数据 (化肥/收藏点) */
.extra-data-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.extra-card {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  transition: transform 0.2s;
}
.extra-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.extra-card-header {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-weight: 500;
}

.extra-card-header .el-icon {
  font-size: 16px;
  color: var(--color-primary);
}

.extra-card-body {
  display: flex;
  justify-content: space-around;
  align-items: center;
}

.extra-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.extra-label {
  font-size: 12px;
  color: var(--text-muted);
}

.extra-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary);
}

.extra-value.organic {
  color: var(--color-success);
}

.extra-value.classic {
  color: var(--color-warning);
}

.empty-state {
  padding: 60px 20px;
  text-align: center;
}

@media (max-width: 768px) {
  .user-profile-card {
    padding: 14px;
    gap: 12px;
  }

  .profile-avatar {
    width: 48px;
    height: 48px;
  }

  .profile-name {
    font-size: 17px;
  }

  .info-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .info-value {
    font-size: 18px;
  }

  .stats-detail-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .section-card {
    padding: 14px;
  }
}

</style>
