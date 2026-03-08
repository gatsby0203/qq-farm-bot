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
        <el-input-number v-model="form.farmIntervalSec" :min="1" :max="3600" :step="5" />
        <span class="unit-text">秒</span>
      </el-form-item>
      <el-form-item label="好友巡查">
        <el-input-number v-model="form.friendIntervalSec" :min="1" :max="3600" :step="5" />
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
  farmIntervalSec: 10,
  friendIntervalSec: 10,
})

watch(() => props.visible, (visible) => {
  if (!visible) return
  form.value.authCode = ''
  if (props.initialUin) {
    form.value.platform = 'qq'
    form.value.uin = props.initialUin
  }
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
    data.farmInterval = form.value.farmIntervalSec * 1000
    data.friendInterval = form.value.friendIntervalSec * 1000
  }

  emit('confirm', data)
}

function handleClose() {
  emit('cancel')
  emit('update:visible', false)
}
</script>

<style scoped>
.unit-text {
  margin-left: 8px;
  color: var(--text-muted);
}
</style>
