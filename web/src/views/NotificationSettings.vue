<template>
  <div class="notification-settings-view">
    <!-- 通知渠道配置 -->
    <div class="section-card">
      <div class="section-header">
        <h3 class="section-title">🔔 通知渠道配置</h3>
      </div>
      <el-form :model="form" label-width="120px" style="max-width: 500px;" v-loading="loading">
        <el-form-item label="接收邮箱">
          <el-input v-model="form.mailTo" placeholder="接收推送通知的邮箱地址" style="max-width: 320px;" />
        </el-form-item>
        <el-form-item label="方糖通道">
          <el-radio-group v-model="form.scType">
            <el-radio value="sc3">Server酱³</el-radio>
            <el-radio value="turbo">Server酱Turbo</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="方糖 SendKey">
          <el-input v-model="form.scKey" placeholder="请输入 SendKey" clearable style="max-width: 320px;" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveSettings" :loading="saving">保存通知渠道</el-button>
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" style="margin-top: 8px;">
        <span>
          SMTP 发件配置通过服务端环境变量配置。此处设置的是<strong>您个人</strong>的接收渠道，不影响其他用户。
        </span>
      </el-alert>
    </div>

    <!-- 掉线提醒 -->
    <div class="section-card" style="margin-top: 20px;">
      <div class="section-header">
        <h3 class="section-title">⚠️ 掉线提醒通知</h3>
      </div>
      <el-form :model="form" label-width="120px" style="max-width: 500px;" v-loading="loading">
        <el-form-item label="邮件推送">
          <el-switch v-model="form.mailDisconnect" />
          <span class="field-hint" style="margin-left: 10px;">账号异常断线时通过邮箱提醒</span>
        </el-form-item>
        <el-form-item label="方糖推送">
          <el-switch v-model="form.scDisconnect" />
          <span class="field-hint" style="margin-left: 10px;">账号异常断线时通过方糖提醒</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveSettings" :loading="saving">保存事件配置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 定时汇报 -->
    <div class="section-card" style="margin-top: 20px;">
      <div class="section-header">
        <h3 class="section-title">📊 定时汇报通知</h3>
      </div>
      <el-form :model="form" label-width="120px" style="max-width: 500px;" v-loading="loading">
        <el-form-item label="每小时汇报">
          <el-switch v-model="form.reportHourly" />
          <span class="field-hint" style="margin-left: 10px;">每小时整点发送收获/偷菜统计</span>
        </el-form-item>
        <el-form-item label="每日汇报">
          <el-switch v-model="form.reportDaily" />
          <span class="field-hint" style="margin-left: 10px;">每天早上 8:00 发送昨日统计汇总</span>
        </el-form-item>
        <el-divider border-style="dashed" />
        <el-form-item label="邮件推送">
          <el-switch v-model="form.reportEmail" />
          <span class="field-hint" style="margin-left: 10px;">汇报通过邮箱接收</span>
        </el-form-item>
        <el-form-item label="方糖推送">
          <el-switch v-model="form.reportSc" />
          <span class="field-hint" style="margin-left: 10px;">汇报通过方糖接收</span>
        </el-form-item>
        <el-divider border-style="dashed" />
        <el-form-item label="推送账号">
          <el-checkbox-group v-model="form.reportUins">
            <el-checkbox
              v-for="acc in allAccounts"
              :key="acc.uin"
              :label="acc.uin"
              :value="acc.uin"
            >
              {{ acc.nickname || acc.uin }}
            </el-checkbox>
          </el-checkbox-group>
          <div class="field-hint">勾选需要包含在推送汇报中的账号，不勾选则默认推送全部可访问账号</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveSettings" :loading="saving">保存汇报配置</el-button>
          <el-button @click="sendTestReport" :loading="testing" style="margin-left: 10px;">发送测试汇报</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api/index.js'

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const allAccounts = ref([])

const form = ref({
  mailTo: '',
  scType: 'sc3',
  scKey: '',
  mailDisconnect: false,
  scDisconnect: false,
  reportHourly: false,
  reportDaily: false,
  reportEmail: false,
  reportSc: false,
  reportUins: [],
})

/** 拉取当前用户的推送设置 */
async function fetchSettings() {
  loading.value = true
  try {
    const { data } = await api.get('/user/notification-settings')
    if (data?.ok && data.data) {
      const s = data.data
      form.value.mailTo = s.mailTo || ''
      form.value.scType = s.scType || 'sc3'
      form.value.scKey = s.scKey || ''
      form.value.mailDisconnect = !!s.mailDisconnectEnabled
      form.value.scDisconnect = !!s.scDisconnectEnabled
      form.value.reportHourly = !!s.reportHourlyEnabled
      form.value.reportDaily = !!s.reportDailyEnabled
      form.value.reportEmail = !!s.reportPushEmail
      form.value.reportSc = !!s.reportPushSc
      form.value.reportUins = s.reportUins ? s.reportUins.split(',').filter(Boolean) : []
    }
  } catch { /* 首次使用时无数据，忽略 */ }
  finally { loading.value = false }
}

/** 拉取当前用户可访问账号列表 */
async function fetchAccounts() {
  try {
    const { data } = await api.get('/accounts')
    allAccounts.value = (data?.data || []).map(a => ({ uin: String(a.uin), nickname: a.nickname || String(a.uin) }))
  } catch { /* */ }
}

/** 保存设置 */
async function saveSettings() {
  saving.value = true
  try {
    await api.put('/user/notification-settings', {
      mailTo: form.value.mailTo,
      scType: form.value.scType,
      scKey: form.value.scKey,
      mailDisconnectEnabled: form.value.mailDisconnect,
      scDisconnectEnabled: form.value.scDisconnect,
      reportHourlyEnabled: form.value.reportHourly,
      reportDailyEnabled: form.value.reportDaily,
      reportPushEmail: form.value.reportEmail,
      reportPushSc: form.value.reportSc,
      reportUins: form.value.reportUins.join(','),
    })
    ElMessage.success('推送设置已保存')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || e.message)
  } finally { saving.value = false }
}

/** 发送测试推送 */
async function sendTestReport() {
  testing.value = true
  try {
    await api.post('/user/notification-test')
    ElMessage.success('测试推送已发送，请检查接收渠道')
  } catch (e) {
    ElMessage.error(e.response?.data?.error || e.message)
  } finally { testing.value = false }
}

onMounted(() => {
  fetchSettings()
  fetchAccounts()
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
.field-hint {
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 4px;
}
</style>
