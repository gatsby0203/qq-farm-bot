<template>
  <el-dialog
    v-model="dialogVisible"
    title="添加账号"
    :width="isMobile ? '92%' : '480px'"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form :model="form" label-width="100px" @submit.prevent="handleSubmit">
      <el-form-item label="登录平台" required>
        <el-radio-group v-model="form.platform" :disabled="!!initialUin">
          <el-radio label="qq">QQ</el-radio>
          <el-radio label="wx">微信</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="form.platform === 'qq'" label="QQ号" required>
        <el-input v-model="form.uin" placeholder="请输入QQ号" :disabled="!!initialUin" />
      </el-form-item>
      <el-form-item label="authCode" required>
        <el-input
          v-model="form.authCode"
          placeholder="请粘贴 authCode (从 WSS URL 中获取)"
          type="textarea"
          :rows="2"
        />
      </el-form-item>
      <el-form-item label="农场巡查">
        <el-input-number v-model="form.farmIntervalMinSec" :min="0" :max="86400" :step="1" />
        <span class="range-sep">~</span>
        <el-input-number v-model="form.farmIntervalMaxSec" :min="0" :max="86400" :step="1" />
        <span class="unit-text">秒</span>
      </el-form-item>
      <el-form-item label="好友巡查">
        <el-input-number v-model="form.friendIntervalMinSec" :min="0" :max="86400" :step="1" />
        <span class="range-sep">~</span>
        <el-input-number v-model="form.friendIntervalMaxSec" :min="0" :max="86400" :step="1" />
        <span class="unit-text">秒</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :disabled="!form.authCode.trim()">
        添加账号
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  visible: Boolean,
  initialUin: String,
  initialPlatform: String,
})

const emit = defineEmits(['update:visible', 'confirm', 'cancel'])

const isMobile = ref(window.innerWidth <= 768)
function handleResize() {
  isMobile.value = window.innerWidth <= 768
}
window.addEventListener('resize', handleResize)
onUnmounted(() => window.removeEventListener('resize', handleResize))

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const form = ref({
  uin: '',
  authCode: '',
  platform: 'qq',
  farmIntervalMinSec: 10,
  farmIntervalMaxSec: 10,
  friendIntervalMinSec: 10,
  friendIntervalMaxSec: 10,
})

watch(() => props.visible, (visible) => {
  if (!visible) return
  form.value.authCode = ''

  if (props.initialUin) {
    form.value.uin = props.initialUin
    const inferredPlatform = props.initialUin.startsWith('wx_') ? 'wx' : 'qq'
    form.value.platform = props.initialPlatform === 'wx' || props.initialPlatform === 'qq'
      ? props.initialPlatform
      : inferredPlatform
    return
  }

  form.value.uin = ''
  form.value.platform = 'qq'
  form.value.farmIntervalMinSec = 10
  form.value.farmIntervalMaxSec = 10
  form.value.friendIntervalMinSec = 10
  form.value.friendIntervalMaxSec = 10
})

function handleSubmit() {
  if (!form.value.authCode.trim()) return
  if (form.value.platform === 'qq' && !form.value.uin.trim()) return

  const data = {
    uin: form.value.uin.trim(),
    platform: form.value.platform,
    code: form.value.authCode.trim(),
    manual: true,
  }

  if (!props.initialUin) {
    const farmRange = normalizeIntervalRangeSec(form.value.farmIntervalMinSec, form.value.farmIntervalMaxSec)
    const friendRange = normalizeIntervalRangeSec(form.value.friendIntervalMinSec, form.value.friendIntervalMaxSec)
    data.farmIntervalMin = farmRange.min * 1000
    data.farmIntervalMax = farmRange.max * 1000
    data.friendIntervalMin = friendRange.min * 1000
    data.friendIntervalMax = friendRange.max * 1000
    // 兼容旧后端字段
    data.farmInterval = farmRange.min * 1000
    data.friendInterval = friendRange.min * 1000
  }

  emit('confirm', data)
}

function handleClose() {
  emit('cancel')
  emit('update:visible', false)
}

function normalizeIntervalRangeSec(minVal, maxVal) {
  const clamp = (v, fallback = 10) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return Math.min(86400, Math.max(0, Math.floor(fallback)))
    return Math.min(86400, Math.max(0, Math.floor(n)))
  }
  const min = clamp(minVal)
  const max = clamp(maxVal, min)
  return min <= max ? { min, max } : { min: max, max: min }
}
</script>

<style scoped>
.unit-text {
  margin-left: 8px;
  color: var(--text-muted);
}

.range-sep {
  margin: 0 8px;
  color: var(--text-muted);
}
</style>
