<template>
  <div class="settings-view">
    <!-- 参数配置 -->
    <div class="section-card">
      <h3 class="section-title">参数配置</h3>
      <el-form label-width="120px" class="config-form">
        <el-form-item label="秒收取模式">
          <el-switch v-model="fastHarvest" active-text="开启" inactive-text="关闭" />
          <div class="unit">开启后，作物成熟瞬间立即执行收获请求(误差<200ms)，效率最高。</div>
        </el-form-item>
        <el-form-item label="农场巡查间隔">
          <el-input-number v-model="farmIntervalSec" :min="1" :max="3600" :step="1" />
          <span class="unit">秒 (最低1秒)</span>
        </el-form-item>
        <el-form-item label="好友巡查间隔">
          <el-input-number v-model="friendIntervalSec" :min="1" :max="3600" :step="1" />
          <span class="unit">秒 (最低1秒)</span>
        </el-form-item>
        <el-form-item label="指定种植作物">
          <el-select
            v-model="preferredSeedId"
            placeholder="自动选择(经验效率最高)"
            clearable
            filterable
            style="width: 260px"
            :loading="cropListLoading"
          >
            <el-option :value="0" label="自动选择(经验效率最高)" />
            <el-option :value="29999" label="白萝卜仙人 (疯狂种植白萝卜)" />
            <el-option
              v-for="item in cropList"
              :key="item.seedId"
              :value="item.seedId"
              :label="`Lv${item.unlockLevel} ${item.name} (${item.expPerHour}经验/时)`"
            >
              <span style="color: var(--text-muted); font-size: 11px; margin-right: 4px">Lv{{ item.unlockLevel }}</span>
              <span>{{ item.name }}</span>
              <span v-if="item.seasons > 1" style="color: var(--color-warning); font-size: 11px"> ×{{ item.seasons }}季</span>
              <span style="float: right; color: var(--text-muted); font-size: 12px">{{ item.expPerHour }} 经验/时</span>
            </el-option>
          </el-select>
          <span class="unit">清空则自动选择</span>
        </el-form-item>
        <el-form-item label="施肥模式">
          <el-select v-model="fertilizerMode" style="width: 260px">
            <el-option label="关闭" value="none" />
            <el-option label="普通化肥" value="normal" />
            <el-option label="有机化肥" value="organic" />
            <el-option label="双肥模式(普通+有机)" value="both" />
          </el-select>
          <span class="unit">仅在“自动施肥”开启时生效</span>
        </el-form-item>
        <el-form-item label="多季补肥">
          <el-switch v-model="fertilizerMultiSeason" active-text="开启" inactive-text="关闭" />
          <div class="unit">收获后若同一地块进入下一季生长，自动再施肥</div>
        </el-form-item>
        <el-form-item label="施肥土地范围">
          <el-select
            v-model="fertilizerSoilTypes"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="留空=全部土地"
            style="width: 380px"
          >
            <el-option
              v-for="item in fertilizerSoilTypeOptions"
              :key="item.value"
              :value="item.value"
              :label="item.label"
            />
          </el-select>
          <div class="unit">可多选，限制自动施肥只作用于选中土地类型</div>
        </el-form-item>
        <el-form-item label="偷取作物黑名单">
          <el-select
            v-model="stealBlacklist"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择不偷取的作物 (多选)"
            style="width: 380px"
          >
            <el-option
              v-for="item in cropList"
              :key="item.id"
              :value="item.id"
              :label="item.name"
            />
          </el-select>
          <div class="unit">多选，选中的作物将不会被自动偷取</div>
        </el-form-item>
        <el-form-item label="偷菜跳过好友">
          <el-select
            v-model="friendBlacklist"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            placeholder="支持输入昵称或 GID 手动搜索好友..."
            style="width: 380px"
            :loading="friendsLoading"
          >
            <el-option
              v-for="f in friendList"
              :key="f.gid"
              :value="f.gid"
              :label="`${f.name} (${f.gid})`"
            />
          </el-select>
          <div class="unit">多选，选中的好友农场将不会进入巡查(同时跳过除草/杀虫/浇水)</div>
        </el-form-item>
      </el-form>
    </div>

    <!-- 功能开关 -->
    <div class="section-card">
      <h3 class="section-title">功能开关</h3>
      <div class="toggles-grid">
        <div v-for="group in toggleGroups" :key="group.title" class="toggle-group">
          <div class="toggle-group-title">{{ group.title }}</div>
          <div v-for="item in group.items" :key="item.key" class="toggle-row">
            <span class="toggle-label">{{ item.label }}</span>
            <el-switch v-model="featureToggles[item.key]" size="small" />
          </div>
        </div>
      </div>
      <el-form label-width="120px" class="config-form compact-form">
        <el-form-item label="土地升级目标">
          <el-input-number
            v-model="featureToggles.landUpgradeTarget"
            :min="0"
            :max="6"
            :step="1"
            :disabled="!featureToggles.autoLandUpgrade"
          />
          <span class="unit">0=不限制，1-6=升级到指定土地类型</span>
        </el-form-item>
        <el-form-item v-if="featureToggles.friendQuietEnabled" label="静默时段">
          <el-input
            v-model="featureToggles.friendQuietStart"
            size="small"
            style="width: 100px"
            placeholder="23:00"
          />
          <span class="unit-inline">至</span>
          <el-input
            v-model="featureToggles.friendQuietEnd"
            size="small"
            style="width: 100px"
            placeholder="07:00"
          />
          <span class="unit">格式 HH:mm</span>
        </el-form-item>
      </el-form>
      <div class="save-row">
        <el-button type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
      </div>
    </div>

    <!-- 种植效率排行 -->
    <div class="section-card">
      <div class="section-header">
        <h3 class="section-title">种植效率排行</h3>
        <span class="section-hint">基于当前等级(Lv{{ userLevel }})可购买作物计算</span>
      </div>

      <el-table
        :data="ranking"
        stripe
        style="width: 100%"
        :header-cell-style="{ background: 'var(--bg-base)', color: 'var(--text-muted)', borderColor: 'var(--border)' }"
        :cell-style="{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }"
        v-loading="rankingLoading"
      >
        <el-table-column label="排名" width="60" align="center">
          <template #default="{ $index }">
            <span :class="{ 'rank-star': $index === 0 }">{{ $index + 1 }}{{ $index === 0 ? ' ★' : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="作物" width="120" align="center">
          <template #default="{ row }">
            {{ row.name }}<span v-if="row.seasons > 1" class="seasons-badge">×{{ row.seasons }}季</span>
          </template>
        </el-table-column>
        <el-table-column label="解锁等级" width="90" align="center">
          <template #default="{ row }">
            Lv{{ row.unlockLevel || '?' }}
          </template>
        </el-table-column>
        <el-table-column label="生长周期" width="130" align="center">
          <template #default="{ row }">
            <span>{{ formatGrowTime(row.totalTimeSec || row.growTimeSec) }}</span>
            <span v-if="row.regrowSec" class="regrow-hint">(含回生{{ formatGrowTime(row.regrowSec) }})</span>
          </template>
        </el-table-column>
        <el-table-column label="总经验" width="90" align="center">
          <template #default="{ row }">
            {{ row.totalExp || row.exp }}
          </template>
        </el-table-column>
        <el-table-column label="经验/小时" width="110" align="center">
          <template #default="{ row }">
            <span class="exp-value">{{ row.expPerHour }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getAccountSnapshot, updateAccountConfig, getPlantRanking, getCropList, updateToggles, getFriends } from '../api/index.js'

const props = defineProps({ uin: String })

const farmIntervalSec = ref(1)
const friendIntervalSec = ref(10)
const preferredSeedId = ref(29999)  // 29999 = 白萝卜仙人
const saving = ref(false)
const userLevel = ref(1)
const fastHarvest = ref(false)
const stealBlacklist = ref([])
const friendBlacklist = ref([])
const fertilizerMode = ref('normal')
const fertilizerMultiSeason = ref(false)
const fertilizerSoilTypes = ref([])
const defaultFeatureToggles = Object.freeze({
  autoHarvest: true,
  fastHarvest: false,
  autoPlant: true,
  autoFertilize: false,
  autoWeed: true,
  autoPest: true,
  autoWater: true,
  fertilizerMode: 'normal',
  fertilizerMultiSeason: false,
  fertilizerSoilTypes: [],
  autoLandUnlock: true,
  autoLandUpgrade: true,
  landUpgradeTarget: 6,
  friendVisit: true,
  autoSteal: true,
  skipStealRadish: true,
  stealBlacklist: [],
  friendBlacklist: [],
  friendHelp: true,
  friendPest: true,
  helpEvenExpFull: true,
  friendQuietEnabled: false,
  friendQuietStart: '23:00',
  friendQuietEnd: '07:00',
  autoTask: true,
  autoSell: true,
  autoBuyFertilizer: false,
  autoFreeGifts: true,
  autoShareReward: true,
  autoMonthCard: true,
  autoEmailReward: true,
  autoVipGift: true,
  autoIllustrated: true,
  autoFertilizerBuy: false,
  autoFertilizerUse: false,
})

function normalizeFeatureToggles(raw = {}) {
  return { ...defaultFeatureToggles, ...(raw || {}) }
}

const featureToggles = ref(normalizeFeatureToggles())
const toggleGroups = [
  {
    title: '自己农场',
    items: [
      { key: 'autoHarvest', label: '自动收获' },
      { key: 'autoPlant', label: '自动种植' },
      { key: 'autoFertilize', label: '自动施肥' },
      { key: 'autoWater', label: '自动浇水' },
      { key: 'autoWeed', label: '自动除草' },
      { key: 'autoPest', label: '自动除虫' },
      { key: 'autoLandUnlock', label: '自动开地' },
      { key: 'autoLandUpgrade', label: '自动升级土地' },
    ],
  },
  {
    title: '好友巡查',
    items: [
      { key: 'friendVisit', label: '启用好友巡查' },
      { key: 'autoSteal', label: '自动偷菜' },
      { key: 'skipStealRadish', label: '跳过白萝卜' },
      { key: 'friendHelp', label: '好友帮忙' },
      { key: 'friendPest', label: '好友除虫' },
      { key: 'helpEvenExpFull', label: '经验满时仍帮忙' },
      { key: 'friendQuietEnabled', label: '好友巡查静默时段' },
    ],
  },
  {
    title: '系统',
    items: [
      { key: 'autoTask', label: '自动任务' },
      { key: 'autoSell', label: '自动出售' },
      { key: 'autoBuyFertilizer', label: '自动购买化肥' },
    ],
  },
  {
    title: '每日奖励',
    items: [
      { key: 'autoFreeGifts', label: '免费礼包' },
      { key: 'autoShareReward', label: '分享奖励' },
      { key: 'autoMonthCard', label: '月卡奖励' },
      { key: 'autoEmailReward', label: '邮件奖励' },
      { key: 'autoVipGift', label: 'VIP礼包' },
      { key: 'autoIllustrated', label: '图鉴奖励' },
      { key: 'autoFertilizerBuy', label: '化肥购买奖励' },
      { key: 'autoFertilizerUse', label: '化肥使用奖励' },
    ],
  },
]
const fertilizerSoilTypeOptions = [
  { value: 0, label: '普通土地' },
  { value: 1, label: '红土地' },
  { value: 2, label: '黑土地' },
  { value: 3, label: '金土地' },
  { value: 4, label: '紫土地' },
  { value: 5, label: '翡翠土地' },
  { value: 6, label: '蓝宝石土地' },
]

const ranking = ref([])
const rankingLoading = ref(false)
const cropList = ref([])
const cropListLoading = ref(false)
const friendList = ref([])
const friendsLoading = ref(false)

async function fetchConfig() {
  try {
    const res = await getAccountSnapshot(props.uin)
    const data = res.data
    farmIntervalSec.value = Math.max(1, Math.round((data.farmInterval || 10000) / 1000))
    friendIntervalSec.value = Math.max(1, Math.round((data.friendInterval || 10000) / 1000))
    userLevel.value = data.userState?.level || 1
    // 显式判断，保留 0 表示自动选择
    preferredSeedId.value = Number(data.preferredSeedId ?? 0) || 0
    
    // 加载黑名单
    featureToggles.value = normalizeFeatureToggles(data.featureToggles)
    fastHarvest.value = !!featureToggles.value.fastHarvest
    stealBlacklist.value = Array.isArray(featureToggles.value.stealBlacklist)
      ? featureToggles.value.stealBlacklist.map(v => Number(v)).filter(v => Number.isFinite(v))
      : []
    friendBlacklist.value = Array.isArray(featureToggles.value.friendBlacklist)
      ? featureToggles.value.friendBlacklist.map(v => Number(v)).filter(v => Number.isFinite(v))
      : []
    fertilizerMode.value = ['none', 'normal', 'organic', 'both'].includes(featureToggles.value.fertilizerMode)
      ? featureToggles.value.fertilizerMode
      : 'normal'
    fertilizerMultiSeason.value = !!featureToggles.value.fertilizerMultiSeason
    fertilizerSoilTypes.value = Array.isArray(featureToggles.value.fertilizerSoilTypes)
      ? featureToggles.value.fertilizerSoilTypes.map(v => Number(v)).filter(v => Number.isFinite(v))
      : []
  } catch (e) {
    console.error('获取配置失败:', e)
  }
}

async function saveConfig() {
  saving.value = true
  try {
    await updateAccountConfig(props.uin, {
      farmInterval: farmIntervalSec.value * 1000,
      friendInterval: friendIntervalSec.value * 1000,
      preferredSeedId: preferredSeedId.value || 0,
    })
    
    const nextToggles = normalizeFeatureToggles({
      ...featureToggles.value,
      fastHarvest: fastHarvest.value,
      stealBlacklist: stealBlacklist.value.map(v => Number(v)).filter(v => Number.isFinite(v)),
      friendBlacklist: friendBlacklist.value.map(v => Number(v)).filter(v => Number.isFinite(v)),
      fertilizerMode: fertilizerMode.value,
      fertilizerMultiSeason: fertilizerMultiSeason.value,
      fertilizerSoilTypes: fertilizerSoilTypes.value.map(v => Number(v)).filter(v => Number.isFinite(v)),
      landUpgradeTarget: Number.isFinite(Number(featureToggles.value.landUpgradeTarget))
        ? Number(featureToggles.value.landUpgradeTarget)
        : 6,
      friendQuietStart: String(featureToggles.value.friendQuietStart || '23:00').trim() || '23:00',
      friendQuietEnd: String(featureToggles.value.friendQuietEnd || '07:00').trim() || '07:00',
    })
    await updateToggles(props.uin, nextToggles)
    featureToggles.value = nextToggles

    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

async function fetchRanking() {
  rankingLoading.value = true
  try {
    const res = await getPlantRanking(userLevel.value)
    ranking.value = res.data || []
  } catch { /* */ } finally {
    rankingLoading.value = false
  }
}

async function fetchCropList() {
  cropListLoading.value = true
  try {
    const res = await getCropList()
    cropList.value = res.data || []
  } catch { /* */ } finally {
    cropListLoading.value = false
  }
}

async function fetchFriendList() {
  friendsLoading.value = true
  try {
    const res = await getFriends(props.uin)
    friendList.value = res.data || []
  } catch { /* */ } finally {
    friendsLoading.value = false
  }
}

function formatGrowTime(sec) {
  if (!sec) return '-'
  if (sec < 60) return `${sec}秒`
  if (sec < 3600) return `${Math.floor(sec / 60)}分${sec % 60}秒`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return m > 0 ? `${h}小时${m}分` : `${h}小时`
}

onMounted(async () => {
  await fetchConfig()
  fetchRanking()
  fetchCropList()
  fetchFriendList()
})
</script>

<style scoped>
.section-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header .section-title {
  margin-bottom: 0;
}

.section-hint {
  color: var(--accent);
  font-size: 13px;
}

.config-form :deep(.el-form-item__label) {
  color: var(--text-secondary);
}

.config-form :deep(.el-input-number) {
  width: 160px;
}

.unit {
  margin-left: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.toggles-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 20px;
  margin-bottom: 8px;
}

.toggle-group {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--bg-base);
}

.toggle-group-title {
  font-size: 13px;
  color: var(--text);
  font-weight: 700;
  margin-bottom: 8px;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}

.toggle-label {
  color: var(--text-secondary);
  font-size: 13px;
}

.save-row {
  margin-top: 8px;
}

.unit-inline {
  margin: 0 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.rank-star {
  color: var(--color-warning);
  font-weight: 700;
}

.exp-value {
  color: var(--color-success);
  font-weight: 600;
}

.seasons-badge {
  display: inline-block;
  margin-left: 4px;
  font-size: 11px;
  color: var(--color-warning);
  font-weight: 600;
}

.regrow-hint {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.2;
}

/* 暗色表格 */
:deep(.el-table) {
  --el-table-bg-color: var(--bg-surface);
  --el-table-tr-bg-color: var(--bg-surface);
  --el-table-header-bg-color: var(--bg-base);
  --el-table-border-color: var(--border);
  --el-table-text-color: var(--text-secondary);
  --el-table-row-hover-bg-color: var(--bg-hover);
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: var(--bg-base);
}

@media (max-width: 768px) {
  .section-card {
    padding: 14px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .config-form :deep(.el-form-item) {
    margin-bottom: 12px;
  }

  .toggles-grid {
    grid-template-columns: 1fr;
  }
}
</style>
