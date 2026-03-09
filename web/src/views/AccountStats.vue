<template>
  <div class="account-stats-modern" v-loading="loading">
    <div class="header">
      <div class="title-group">
        <el-icon class="title-icon"><DataLine /></el-icon>
        <h2>统计仪表盘</h2>
        <span class="subtitle">过去24小时您的农场经营明细</span>
      </div>
      <el-button type="primary" :icon="Refresh" @click="fetchData" round>刷新数据</el-button>
    </div>

    <!-- 顶部数据卡片 -->
    <el-row :gutter="20" class="summary-cards">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="info">
              <div class="label">累计收菜数量</div>
              <div class="value text-success">{{ summary.harvestAmount }} <span class="unit">个</span></div>
            </div>
            <div class="icon-wrap bg-success-light">
              <el-icon class="text-success"><Apple /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="info">
              <div class="label">收菜总收益</div>
              <div class="value text-warning">{{ summary.harvestGold }} <span class="unit">金币</span></div>
            </div>
            <div class="icon-wrap bg-warning-light">
              <el-icon class="text-warning"><Coin /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="info">
              <div class="label">累计偷菜数量</div>
              <div class="value text-danger">{{ summary.stealAmount }} <span class="unit">个</span></div>
            </div>
            <div class="icon-wrap bg-danger-light">
              <el-icon class="text-danger"><Scissor /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="info">
              <div class="label">偷菜总收益</div>
              <div class="value text-warning">{{ summary.stealGold }} <span class="unit">金币</span></div>
            </div>
            <div class="icon-wrap bg-warning-light">
              <el-icon class="text-warning"><Trophy /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区 -->
    <el-row :gutter="20" class="charts-row">
      <el-col :xs="24" :lg="16" class="responsive-col">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="card-title">收益趋势图</div>
          </template>
          <v-chart class="trend-chart" :option="trendChartOption" autoresize />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8" class="responsive-col">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="card-title">作物收益占比 (Top 排行)</div>
          </template>
          <v-chart class="pie-chart" :option="pieChartOption" autoresize />
        </el-card>
      </el-col>
    </el-row>

    <!-- 排行榜与分时明细区 -->
    <el-row :gutter="20" class="data-row">
      <!-- 偷菜排行榜 -->
      <el-col :xs="24" :lg="8" class="responsive-col">
        <el-card shadow="never" class="table-card rank-card">
          <template #header>
            <div class="card-title" style="color: #f56c6c;">
              <el-icon><Scissor /></el-icon> 谁最受关注 (被偷榜)
            </div>
          </template>
          <el-table :data="stealRankings" style="width: 100%" height="350" size="small">
            <el-table-column type="index" label="排名" width="55" align="center">
              <template #default="scope">
                <div :class="['rank-badge', `rank-${scope.$index + 1}`]">{{ scope.$index + 1 }}</div>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="好友" show-overflow-tooltip></el-table-column>
            <el-table-column prop="amount" label="被偷(个)" width="80" align="center"></el-table-column>
            <el-table-column prop="gold" label="榨取价值" width="100" align="right">
              <template #default="scope">
                <span class="rank-gold">💰{{ scope.row.gold }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- 详细数据表格 -->
      <el-col :xs="24" :lg="16" class="responsive-col">
        <el-card shadow="never" class="table-card">
          <template #header>
            <div class="card-title">分时详细记录</div>
          </template>
          <el-table :data="reversedStatsData" style="width: 100%" stripe height="350" size="small">
            <el-table-column prop="hour" label="时间" width="130">
              <template #default="scope">
                <el-tag type="info" effect="plain" size="small">{{ formatTimeFull(scope.row.hour) }}</el-tag>
              </template>
            </el-table-column>

            <el-table-column label="自己收菜" align="center">
              <el-table-column prop="harvest.amount" label="数量" width="80" align="center">
                <template #default="scope">
                  <el-popover v-if="scope.row.harvest.details && scope.row.harvest.details.length" placement="top" title="获得作物" :width="mobileWidth" trigger="hover">
                    <template #reference>
                      <span class="hover-number text-success">{{ scope.row.harvest.amount }}</span>
                    </template>
                    <div v-for="item in scope.row.harvest.details" :key="item.name" class="popover-item">
                      <span class="crop-name">{{ item.name }} x{{ item.amount }}</span>
                      <span class="crop-gold">💰{{ item.gold }}</span>
                    </div>
                  </el-popover>
                  <span v-else class="empty-number">-</span>
                </template>
              </el-table-column>
              <el-table-column prop="harvest.gold" label="收益" width="90" align="center">
                <template #default="scope">
                  <span v-if="scope.row.harvest.gold > 0" class="gold-text">+{{ scope.row.harvest.gold }}</span>
                  <span v-else class="empty-number">-</span>
                </template>
              </el-table-column>
            </el-table-column>

            <el-table-column label="外头偷菜" align="center">
              <el-table-column prop="steal.amount" label="数量" width="80" align="center">
                <template #default="scope">
                  <el-popover v-if="scope.row.steal.details && scope.row.steal.details.length" placement="top" title="战利品" :width="mobileWidth" trigger="hover">
                    <template #reference>
                      <span class="hover-number text-danger">{{ scope.row.steal.amount }}</span>
                    </template>
                    <div v-for="item in scope.row.steal.details" :key="item.name" class="popover-item">
                      <span class="crop-name">{{ item.name }} x{{ item.amount }}</span>
                      <span class="crop-gold">💰{{ item.gold }}</span>
                    </div>
                  </el-popover>
                  <span v-else class="empty-number">-</span>
                </template>
              </el-table-column>
              <el-table-column prop="steal.gold" label="收益" width="90" align="center">
                <template #default="scope">
                  <span v-if="scope.row.steal.gold > 0" class="gold-text">+{{ scope.row.steal.gold }}</span>
                  <span v-else class="empty-number">-</span>
                </template>
              </el-table-column>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 每日历史汇总表格 -->
    <el-row :gutter="20" class="data-row" style="margin-top: 24px;">
      <el-col :span="24">
        <el-card shadow="never" class="table-card">
          <template #header>
            <div class="card-title">每日数据汇总 (最近 7 天)</div>
          </template>
          <el-table :data="dailyStatsData" style="width: 100%" stripe size="default">
            <el-table-column prop="day" label="日期" width="120" align="center">
              <template #default="scope">
                <el-tag effect="light" type="success">{{ scope.row.day }}</el-tag>
              </template>
            </el-table-column>

            <el-table-column label="自己收获" align="center">
              <el-table-column prop="harvest.amount" label="收获数量" width="100" align="center"></el-table-column>
              <el-table-column prop="harvest.gold" label="收获收益" min-width="120" align="center">
                <template #default="scope">
                  <span class="gold-text">💰 {{ scope.row.harvest.gold }}</span>
                </template>
              </el-table-column>
            </el-table-column>

            <el-table-column label="外头偷菜" align="center">
              <el-table-column prop="steal.amount" label="偷取数量" width="100" align="center"></el-table-column>
              <el-table-column prop="steal.gold" label="偷菜收益" min-width="120" align="center">
                <template #default="scope">
                  <span class="gold-text">💰 {{ scope.row.steal.gold }}</span>
                </template>
              </el-table-column>
            </el-table-column>

            <el-table-column prop="totalGold" label="当日总计收益" min-width="140" align="right">
              <template #default="scope">
                <span class="total-gold-text">💰 {{ scope.row.totalGold }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getAccountStatistics, getAccountDailyStatistics } from '../api/index.js'
import { ElMessage } from 'element-plus'
import { DataLine, Refresh, Apple, Coin, Scissor, Trophy } from '@element-plus/icons-vue'

// 引入 ECharts 核心与 vue-echarts
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import VChart from 'vue-echarts'

// 注册必须的基础组件
use([CanvasRenderer, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

const props = defineProps({ uin: String })
const loading = ref(false)
const statsData = ref([])
const dailyStatsData = ref([])

// 获取数据
async function fetchData() {
  if (!props.uin) return
  loading.value = true
  try {
    const [hRes, dRes] = await Promise.all([
      getAccountStatistics(props.uin, 24),
      getAccountDailyStatistics(props.uin, 7)
    ])

    if (hRes.ok) statsData.value = hRes.data || []
    if (dRes.ok) dailyStatsData.value = dRes.data || []
  } catch (e) {
    ElMessage.error('获取统计数据失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

// 响应式属性
const mobileWidth = computed(() => {
  return window.innerWidth <= 768 ? 280 : 250;
})

// 格式化函数
function formatTime(hourStr) {
  if (!hourStr) return ''
  return hourStr.substring(11, 16) // "2023-10-25 14:00:00" -> "14:00"
}

function formatTimeFull(hourStr) {
  if (!hourStr) return ''
  return hourStr.substring(5, 16) // "10-25 14:00"
}

// 为了阅读友好，表格逆序（最新在上面）
const reversedStatsData = computed(() => {
  return [...statsData.value].reverse();
})

// 计算汇总数据
const summary = computed(() => {
   let ha = 0, hg = 0, sa = 0, sg = 0;
   statsData.value.forEach(row => {
      ha += row.harvest.amount || 0;
      hg += row.harvest.gold || 0;
      sa += row.steal.amount || 0;
      sg += row.steal.gold || 0;
   })
   return { harvestAmount: ha, harvestGold: hg, stealAmount: sa, stealGold: sg };
})

// 计算偷菜排行榜
const stealRankings = computed(() => {
  const userMap = {};
  statsData.value.forEach(row => {
     (row.steal.details || []).forEach(d => {
        // "好友A: 白萝卜" -> 提取 "好友A"
        let userName = d.name;
        if (d.name.includes(': ')) {
           userName = d.name.split(': ')[0];
        }
        if (!userMap[userName]) {
           userMap[userName] = { name: userName, amount: 0, gold: 0 };
        }
        userMap[userName].amount += (d.amount || 0);
        userMap[userName].gold += (d.gold || 0);
     });
  });
  // 按提取的金币价值降序排列
  return Object.values(userMap).sort((a,b) => b.gold - a.gold);
})

// 趋势图表配置
const trendChartOption = computed(() => {
  const hours = statsData.value.map(row => formatTime(row.hour));
  const stealGolds = statsData.value.map(row => row.steal.gold || 0);
  const harvestGolds = statsData.value.map(row => row.harvest.gold || 0);

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: { data: ['自己收菜', '外头偷菜'], top: '0%' },
    grid: { left: '3%', right: '4%', bottom: '5%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: hours,
      axisLabel: { color: '#888' },
      axisLine: { lineStyle: { color: '#eee' } }
    },
    yAxis: {
      type: 'value',
      name: '金币收益',
      splitLine: { lineStyle: { type: 'dashed', color: '#eee' } }
    },
    color: ['#67c23a', '#f56c6c'],
    series: [
      {
        name: '自己收菜',
        type: 'line',
        smooth: true,
        showSymbol: false,
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(103,194,58,0.5)' }, { offset: 1, color: 'rgba(103,194,58,0.05)' }]
          }
        },
        data: harvestGolds
      },
      {
        name: '外头偷菜',
        type: 'line',
        smooth: true,
        showSymbol: false,
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(245,108,108,0.5)' }, { offset: 1, color: 'rgba(245,108,108,0.05)' }]
          }
        },
        data: stealGolds
      }
    ]
  }
})

// 饼图配置
const pieChartOption = computed(() => {
  const cropMap = {};
  let totalGold = 0;
  statsData.value.forEach(row => {
     (row.harvest?.details || []).forEach(d => {
        const gold = Number(d.gold) || 0;
        cropMap[d.name] = (cropMap[d.name] || 0) + gold;
        totalGold += gold;
     });
     (row.steal?.details || []).forEach(d => {
        // 去除名字里的好友前缀 (例如 "张三: 白萝卜" -> "白萝卜")
        let name = d.name.includes(': ') ? d.name.split(': ')[1] : d.name;
        const gold = Number(d.gold) || 0;
        cropMap[name] = (cropMap[name] || 0) + gold;
        totalGold += gold;
     });
  });

  if (totalGold === 0 || Object.keys(cropMap).length === 0) {
    return {
      title: {
        text: '0 金币',
        subtext: '暂无收益数据',
        left: 'center',
        top: '38%',
        textStyle: { color: '#909399', fontSize: 16, fontWeight: 'bold' },
        subtextStyle: { color: '#c0c4cc', fontSize: 12 }
      },
      tooltip: { show: false },
      legend: { show: false },
      series: [
        {
          name: '无收益数据',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          itemStyle: { color: '#f4f4f5', borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { scale: false, label: { show: false } },
          labelLine: { show: false },
          data: [{ value: 0, name: '无数据' }]
        }
      ]
    };
  }

  const sorted = Object.keys(cropMap).map(k => ({ name: k, value: cropMap[k] })).sort((a,b)=>b.value - a.value);
  // 只展示 top 5, 其他归为“其他”
  let topCrops = sorted.slice(0, 5);
  if (sorted.length > 5) {
     const otherValue = sorted.slice(5).reduce((acc, cur) => acc + cur.value, 0);
     topCrops.push({ name: '其他', value: otherValue });
  }

  return {
    title: { show: false }, // 明确覆盖残余的 Text
    tooltip: { trigger: 'item', formatter: '{b} <br/> {c} 金币 ({d}%)' },
    legend: { orient: 'horizontal', bottom: '0%' },
    series: [
      {
        name: '收益来源',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold' } },
        labelLine: { show: false },
        data: topCrops
      }
    ]
  }
})

onMounted(() => {
  fetchData()
})

watch(() => props.uin, () => {
  fetchData()
})
</script>

<style scoped>
.account-stats-modern {
  padding: 24px;
  background: var(--bg-base);
  min-height: calc(100vh - 60px);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.title-icon {
  font-size: 28px;
  color: #409eff;
  background: #ecf5ff;
  padding: 8px;
  border-radius: 12px;
}
.title-group h2 {
  margin: 0;
  font-size: 22px;
  color: #303133;
}
.title-group .subtitle {
  color: #909399;
  font-size: 14px;
  margin-left: 8px;
  margin-top: 6px;
}

/* 统计卡片 */
.summary-cards {
  margin-bottom: 24px;
}
.stat-card {
  border-radius: 16px;
  border: none;
  transition: transform 0.3s;
}
.stat-card:hover {
  transform: translateY(-5px);
}
.stat-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.info .label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}
.info .value {
  font-size: 28px;
  font-weight: 700;
}
.info .unit {
  font-size: 14px;
  font-weight: normal;
  color: #909399;
}
.icon-wrap {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 26px;
}

/* 颜色辅助类 */
.text-success { color: #67c23a; }
.bg-success-light { background: #f0f9eb; }
.text-warning { color: #e6a23c; }
.bg-warning-light { background: #fdf6ec; }
.text-danger { color: #f56c6c; }
.bg-danger-light { background: #fef0f0; }

/* 图表区 */
.charts-row {
  margin-bottom: 24px;
}
.chart-card {
  border-radius: 16px;
  border: none;
}
.card-title {
  font-size: 16px;
  font-weight: bold;
  color: #303133;
}
.trend-chart, .pie-chart {
  width: 100%;
  height: 300px;
}

/* 表格区 */
.table-card {
  border-radius: 16px;
  border: none;
}
.hover-number {
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  border-bottom: 2px dashed;
  padding-bottom: 2px;
  display: inline-block;
  min-width: 30px;
}
.rank-card {
  height: 100%;
}
.rank-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  line-height: 24px;
  text-align: center;
  font-weight: bold;
  background: #f4f4f5;
  color: #909399;
  display: inline-block;
  font-size: 13px;
}
.rank-1 { background: #fdf6ec; color: #e6a23c; font-size: 15px; }
.rank-2 { background: #fdf6ec; color: #f3a683; font-size: 14px; }
.rank-3 { background: #fdf6ec; color: #f5cd79; font-size: 14px; }
.rank-gold {
  color: #e6a23c;
  font-family: monospace;
  font-weight: bold;
  font-size: 14px;
}
.gold-text {
  font-family: monospace;
  font-size: 14px;
  font-weight: bold;
  color: #e6a23c;
  background: #fdf6ec;
  padding: 2px 6px;
  border-radius: 6px;
}
.empty-number {
  color: #c0c4cc;
}

/* 气泡列表项 */
.popover-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #ebeef5;
  gap: 12px;
}
.popover-item:last-child {
  border-bottom: none;
}
.crop-name {
  color: #ff0000;
  flex: 1;
  word-wrap: break-word;
  white-space: normal;
}
.crop-gold {
  color: #e6a23c;
  font-family: monospace;
  font-weight: bold;
  white-space: nowrap;
}

.total-gold-text {
  font-family: monospace;
  font-size: 16px;
  font-weight: 800;
  color: #ff9800;
}

:deep(.el-table) {
  --el-table-header-bg-color: var(--bg-hover);
  border-radius: 8px;
  overflow: hidden;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .account-stats-modern {
    padding: 12px;
  }
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  .summary-cards .el-col {
    margin-bottom: 12px;
  }
  .stat-card {
    border-radius: 12px;
  }
  .info .label {
    font-size: 13px;
  }
  .info .value {
    font-size: 20px;
  }
  .icon-wrap {
    width: 44px;
    height: 44px;
    font-size: 22px;
    border-radius: 12px;
  }
  .responsive-col {
    margin-bottom: 16px;
  }
  .trend-chart, .pie-chart {
    height: 250px;
  }
  .rank-badge {
    width: 20px;
    height: 20px;
    line-height: 20px;
    font-size: 12px;
  }
}
</style>
