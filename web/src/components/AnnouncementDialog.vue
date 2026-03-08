<template>
  <el-dialog
    v-model="visible"
    :title="isAdmin && editing ? '编辑公告' : '📢 公告'"
    width="90vw"
    :close-on-click-modal="true"
    class="announcement-dialog"
    style="max-width:520px"
  >
    <!-- 查看模式 -->
    <template v-if="!editing">
      <div v-if="announcement" class="announcement-content">
        <h3 v-if="announcement.title" class="announcement-title">{{ announcement.title }}</h3>
        <div class="announcement-body" v-html="renderContent(announcement.content)" />
        <div class="announcement-time">
          更新于 {{ announcement.updated_at }}
        </div>
      </div>
      <div v-else class="announcement-empty">
        <el-empty description="暂无公告" :image-size="80" />
      </div>
    </template>

    <!-- 编辑模式 (管理员) -->
    <template v-else>
      <el-form label-position="top">
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="公告标题（可选）" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="6"
            placeholder="公告内容，支持换行"
            maxlength="1000"
            show-word-limit
          />
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <div class="dialog-footer">
        <template v-if="!editing">
          <el-button v-if="isAdmin" type="primary" @click="startEdit">
            <el-icon><Edit /></el-icon> 编辑公告
          </el-button>
          <el-button @click="visible = false">关闭</el-button>
        </template>
        <template v-else>
          <el-button @click="editing = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">保存并发布</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { getAnnouncement, updateAnnouncement } from '../api/index.js'
import { onEvent, offEvent } from '../socket/index.js'
import { ElMessage } from 'element-plus'

const props = defineProps({
  isAdmin: { type: Boolean, default: false },
})

const visible = ref(false)
const editing = ref(false)
const saving = ref(false)
const announcement = ref(null)
const form = ref({ title: '', content: '' })
const hasShownOnce = ref(false)

// 简易换行渲染
function renderContent(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

async function fetchAnnouncement() {
  try {
    const res = await getAnnouncement()
    announcement.value = res.data || null
  } catch { /* ignore */ }
}

function startEdit() {
  form.value.title = announcement.value?.title || ''
  form.value.content = announcement.value?.content || ''
  editing.value = true
}

async function handleSave() {
  if (!form.value.content.trim()) {
    ElMessage.warning('公告内容不能为空')
    return
  }
  saving.value = true
  try {
    const res = await updateAnnouncement({
      title: form.value.title,
      content: form.value.content,
    })
    announcement.value = res.data
    editing.value = false
    ElMessage.success('公告已发布')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 对外暴露 open 方法
function open() {
  fetchAnnouncement()
  editing.value = false
  visible.value = true
}

// 首次加载 - 自动弹出
async function autoShow() {
  await fetchAnnouncement()
  if (announcement.value && !hasShownOnce.value) {
    const lastSeen = localStorage.getItem('announcement_seen_id')
    if (lastSeen !== String(announcement.value.id) || lastSeen !== String(announcement.value.updated_at)) {
      visible.value = true
      hasShownOnce.value = true
    }
  }
}

// 关闭时记录已读
watch(visible, (val) => {
  if (!val && announcement.value) {
    localStorage.setItem('announcement_seen_id', String(announcement.value.updated_at))
  }
})

// Socket.io 实时接收公告更新
function onAnnouncementUpdate(data) {
  announcement.value = data
  // 收到新公告时自动弹出
  visible.value = true
}

import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  autoShow()
  onEvent('announcement:update', onAnnouncementUpdate)
})

onUnmounted(() => {
  offEvent('announcement:update', onAnnouncementUpdate)
})

defineExpose({ open })
</script>

<style scoped>
/* 公告内容适配移动端 */
.announcement-content {
  padding: 4px 0;
}
.announcement-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 12px 0;
}
.announcement-body {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  word-break: break-word;
}
.announcement-time {
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}
.announcement-empty {
  padding: 20px 0;
}
.dialog-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 600px) {
  .announcement-title {
    font-size: 16px;
  }
  .announcement-body {
    font-size: 13px;
  }
  .announcement-time {
    font-size: 11px;
  }
  .announcement-dialog {
    width: 95vw !important;
    max-width: 99vw !important;
  }
}
</style>
