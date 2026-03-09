<template>
  <div class="dashboard">
    <!-- 欢迎与项目 Logo -->
    <div class="dashboard-welcome">
      <div class="welcome-logo-box">
        <img :src="'/main.svg'" class="welcome-logo" alt="Main Logo" />
      </div>
      <div class="welcome-text">
        <h2 class="welcome-title">农场管家 Dashboard</h2>
        <p class="welcome-desc">欢迎回来，您的自动化农场正在平稳运行中</p>
      </div>
    </div>

    <!-- 顶部统计卡片 -->
    <el-row :gutter="12" class="stats-row">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <el-icon :size="28" color="#409EFF"><User /></el-icon>
            <div>
              <div class="stat-value">{{ accounts.length }}</div>
              <div class="stat-label">总账号数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <el-icon :size="28" color="#67C23A"><CircleCheck /></el-icon>
            <div>
              <div class="stat-value">{{ runningCount }}</div>
              <div class="stat-label">运行中</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <el-icon :size="28" color="#E6A23C"><Warning /></el-icon>
            <div>
              <div class="stat-value">{{ errorCount }}</div>
              <div class="stat-label">异常</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <el-icon :size="28" color="#909399"><Remove /></el-icon>
            <div>
              <div class="stat-value">{{ stoppedCount }}</div>
              <div class="stat-label">已停止</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 账号列表 -->
    <AccountList
      :accounts="accounts"
      :loading="loading"
      @add="showAddDialog"
      @start="handleStart"
      @stop="handleStop"
      @delete="handleDelete"
      @view-logs="handleViewLogs"
      @config="handleConfig"
    />

    <AccountLoginDialog
      v-model:visible="loginDialogVisible"
      :initial-uin="dialogUin"
      @confirm="handleLoginConfirm"
      @cancel="handleDialogCancel"
    />

    <!-- 日志面板 -->
    <BotLogPanel
      v-model:visible="logPanelVisible"
      :uin="logPanelUin"
      :nickname="logPanelNickname"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAccounts, addAccountByCode, startBot, stopBot, deleteAccount } from '../api/index.js'
import { onEvent, offEvent } from '../socket/index.js'
import AccountList from '../components/AccountList.vue'
import AccountLoginDialog from '../components/AccountLoginDialog.vue'
import BotLogPanel from '../components/BotLogPanel.vue'

// ============ 账号数据 ============
const accounts = ref([])
const loading = ref(false)

const runningCount = computed(() => accounts.value.filter(a => a.status === 'running').length)
const errorCount = computed(() => accounts.value.filter(a => a.status === 'error').length)
const stoppedCount = computed(() => accounts.value.filter(a => a.status === 'stopped' || a.status === 'idle').length)

async function fetchAccounts() {
  loading.value = true
  try {
    const res = await getAccounts()
    accounts.value = res.data || []
  } catch (err) {
    ElMessage.error('获取账号列表失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

const loginDialogVisible = ref(false)
const dialogUin = ref('')

function showAddDialog() {
  dialogUin.value = ''
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
    ElMessage.success('账号添加成功')
    loginDialogVisible.value = false
    fetchAccounts()
  } catch (err) {
    ElMessage.error('添加账号失败: ' + err.message)
  }
}

function handleDialogCancel() {
  loginDialogVisible.value = false
}

// ============ Bot 操作 ============
async function handleStart(uin) {
  try {
    await startBot(uin)
    ElMessage.success(`${uin} 正在启动...`)
    fetchAccounts()
  } catch (err) {
    ElMessage.error('启动失败: ' + err.message)
  }
}

async function handleStop(uin) {
  try {
    await stopBot(uin)
    ElMessage.success(`${uin} 已停止`)
    fetchAccounts()
  } catch (err) {
    ElMessage.error('停止失败: ' + err.message)
  }
}

async function handleDelete(uin) {
  try {
    await ElMessageBox.confirm(`确定要删除账号 ${uin} 吗？将同时删除所有历史数据。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteAccount(uin)
    ElMessage.success('已删除')
    fetchAccounts()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('删除失败: ' + err.message)
  }
}

function handleConfig(uin) {
  // TODO: 配置弹窗
  ElMessage.info('配置功能开发中')
}

// ============ 日志面板 ============
const logPanelVisible = ref(false)
const logPanelUin = ref('')
const logPanelNickname = ref('')

function handleViewLogs(account) {
  logPanelUin.value = account.uin
  logPanelNickname.value = account.nickname || account.uin
  logPanelVisible.value = true
}

// ============ Socket.io 实时更新 ============
function onAccountsList(data) {
  accounts.value = data || []
}

function onStatusChange(data) {
  const idx = accounts.value.findIndex(a => a.uin === data.userId)
  if (idx >= 0) {
    accounts.value[idx].status = data.newStatus
    if (data.userState) {
      Object.assign(accounts.value[idx], {
        nickname: data.userState.name || accounts.value[idx].nickname,
        level: data.userState.level,
        gold: data.userState.gold,
        exp: data.userState.exp,
        gid: data.userState.gid,
      })
    }
  } else {
    fetchAccounts()
  }
}

function onStateUpdate(data) {
  const idx = accounts.value.findIndex(a => a.uin === data.userId)
  if (idx >= 0 && data.userState) {
    const a = accounts.value[idx]
    a.status = data.status
    a.nickname = data.userState.name || a.nickname
    a.level = data.userState.level
    a.gold = data.userState.gold
    a.exp = data.userState.exp
    a.gid = data.userState.gid
  }
}

onMounted(() => {
  fetchAccounts()
  onEvent('accounts:list', onAccountsList)
  onEvent('bot:statusChange', onStatusChange)
  onEvent('bot:stateUpdate', onStateUpdate)
})

onUnmounted(() => {
  offEvent('accounts:list', onAccountsList)
  offEvent('bot:statusChange', onStatusChange)
  offEvent('bot:stateUpdate', onStateUpdate)
})
</script>

<style scoped>
.dashboard {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.dashboard-welcome {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  background: var(--bg-surface);
  padding: 20px 24px;
  border-radius: 16px;
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.welcome-logo-box {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.05);
  padding: 10px;
  border-radius: 12px;
  flex-shrink: 0;
}

.welcome-logo {
  width: 100%;
  height: 100%;
  padding: 1px;
  object-fit: contain;
}

.welcome-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
}

.welcome-desc {
  font-size: 14px;
  color: var(--text-muted);
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  cursor: default;
}

.stat-card :deep(.el-card__body) {
  padding: 16px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #909399;
}

@media (max-width: 768px) {
  .stats-row .el-col {
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 20px;
  }

  .stat-content {
    gap: 8px;
  }
}
</style>
