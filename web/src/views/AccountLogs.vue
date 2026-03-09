<template>
  <div class="logs-view">
    <div class="section-card">
      <div class="logs-header">
        <h3 class="section-title">运行日志</h3>
        <div class="logs-actions">
          <el-select v-model="tagFilter" placeholder="全部分类" clearable size="small" style="width: 130px">
            <el-option v-for="t in availableTags" :key="t" :label="t" :value="t" />
          </el-select>
          <el-select v-model="levelFilter" placeholder="全部级别" clearable size="small" style="width: 110px">
            <el-option label="ℹ️ 信息" value="info" />
            <el-option label="⚠️ 警告" value="warn" />
            <el-option label="❌ 错误" value="error" />
          </el-select>
          <el-switch v-model="autoScroll" active-text="自动滚动" inactive-text="" size="small" />
          <el-button size="small" @click="clearLogs">清空</el-button>
          <el-tag size="small" type="info">{{ filteredLogs.length }} 条</el-tag>
        </div>
      </div>

      <div class="log-container" ref="logContainer">
        <div v-if="filteredLogs.length === 0" class="empty-hint">暂无日志</div>
        <div
          v-for="(entry, idx) in filteredLogs"
          :key="idx"
          class="log-line"
          :class="getLogClass(entry)"
        >
          <span class="log-time">{{ entry.time || '' }}</span>
          <span class="log-level-badge" :class="'badge-' + entry.level">{{ getLevelLabel(entry.level) }}</span>
          <span class="log-tag" v-if="entry.tag">{{ entry.icon || '' }} {{ entry.tag }}</span>
          <span class="log-msg">{{ entry.msg || '' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { getAccountLogs } from '../api/index.js'
import { subscribeLogs, unsubscribeLogs, onEvent, offEvent } from '../socket/index.js'

const props = defineProps({ uin: String })

const logs = ref([])
const autoScroll = ref(true)
const logContainer = ref(null)
const tagFilter = ref('')
const levelFilter = ref('')

const availableTags = computed(() => {
  const tags = new Set()
  for (const l of logs.value) {
    if (l.tag) tags.add(l.tag)
  }
  return [...tags].sort()
})

const filteredLogs = computed(() => {
  return logs.value.filter(l => {
    if (tagFilter.value && l.tag !== tagFilter.value) return false
    if (levelFilter.value && l.level !== levelFilter.value) return false
    return true
  })
})

function getLogClass(entry) {
  if (!entry) return ''
  if (entry.level === 'error') return 'log-error'
  if (entry.level === 'warn') return 'log-warn'
  const m = (entry.msg || '').toLowerCase()
  if (m.includes('错误') || m.includes('失败')) return 'log-error'
  if (m.includes('成功') || m.includes('收获') || m.includes('偷')) return 'log-success'
  return ''
}

function getLevelLabel(level) {
  if (level === 'error') return 'ERR'
  if (level === 'warn') return 'WRN'
  return 'INF'
}

function scrollToBottom() {
  if (!autoScroll.value || !logContainer.value) return
  nextTick(() => {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  })
}

function clearLogs() {
  logs.value = []
}

async function fetchInitialLogs() {
  if (!props.uin) return
  try {
    const res = await getAccountLogs(props.uin)
    logs.value = res.data || []
    scrollToBottom()
  } catch { /* */ }
}

function onBotLog(data) {
  if (String(data.userId) !== String(props.uin)) return
  logs.value.push(data)
  if (logs.value.length > 2000) {
    logs.value = logs.value.slice(-1500)
  }
  scrollToBottom()
}

function onLogsHistory(data) {
  if (String(data.uin) !== String(props.uin)) return
  logs.value = data.logs || []
  scrollToBottom()
}

watch(() => props.uin, (newUin, oldUin) => {
  logs.value = []
  if (oldUin) unsubscribeLogs(oldUin)
  if (newUin) subscribeLogs(newUin)
  fetchInitialLogs()
})

onMounted(() => {
  onEvent('bot:log', onBotLog)
  onEvent('logs:history', onLogsHistory)
  if (props.uin) subscribeLogs(props.uin)
  fetchInitialLogs()
})

onUnmounted(() => {
  if (props.uin) unsubscribeLogs(props.uin)
  offEvent('bot:log', onBotLog)
  offEvent('logs:history', onLogsHistory)
})
</script>

<style scoped>
.section-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.logs-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.log-container {
  background: #0d1117;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  height: calc(100vh - 280px);
  min-height: 300px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', 'Monaco', monospace;
  font-size: 12.5px;
  line-height: 1.8;
}

.log-container::-webkit-scrollbar {
  width: 6px;
}

.log-container::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 3px;
}

.empty-hint {
  color: var(--text-faint);
  text-align: center;
  padding: 40px 0;
}

.log-line {
  color: #c9d1d9;
  white-space: pre-wrap;
  word-break: break-all;
  padding: 1px 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  border-bottom: 1px solid rgba(48, 54, 61, 0.3);
}

.log-line:last-child {
  border-bottom: none;
}

.log-time {
  color: #6e7681;
  flex-shrink: 0;
  font-size: 11.5px;
  min-width: 85px;
}

.log-level-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
  min-width: 28px;
  text-align: center;
  line-height: 18px;
}

.badge-info {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
}

.badge-warn {
  background: rgba(210, 153, 34, 0.15);
  color: #d29922;
}

.badge-error {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.log-tag {
  color: #79c0ff;
  flex-shrink: 0;
  font-weight: 600;
  min-width: 60px;
}

.log-msg {
  color: inherit;
  flex: 1;
}

/* 级别着色 */
.log-error {
  color: #f85149;
}

.log-error .log-tag {
  color: #f85149;
}

.log-warn {
  color: #d29922;
}

.log-warn .log-tag {
  color: #d29922;
}

.log-success {
  color: #3fb950;
}

.log-success .log-tag {
  color: #3fb950;
}

@media (max-width: 768px) {
  .section-card {
    padding: 12px;
  }

  .log-container {
    height: calc(100vh - 220px);
    font-size: 12px;
  }
}
</style>
