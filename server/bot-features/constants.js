const { seedShopData } = require('../../src/gameConfig');

const PLATFORMS = {
    QQ: 'qq',
    WX: 'wx'
};

const PHASE_NAMES = {
    1: '发芽', 2: '小叶', 3: '大叶', 4: '开花', 5: '结果',
    6: '成熟', 7: '枯萎', 8: '被盗', 9: '未知'
};

const PlantPhase = {
    GERMINATE: 1, SMALL_LEAF: 2, LARGE_LEAF: 3, BLOOM: 4, FRUIT: 5, MATURE: 6, DEAD: 7, STOLEN: 8
};

// ============ 常量 ============
const FRUIT_ID_SET = new Set(
    ((seedShopData && seedShopData.rows) || [])
        .map(row => Number(row.fruitId))
        .filter(Number.isFinite)
);
const GOLD_ITEM_ID = 1001;
const NORMAL_FERTILIZER_ID = 1011;

// Tag 图标映射
const TAG_ICONS = {
    '系统': '⚙️', 'WS': '🔌', '登录': '🔑', '心跳': '💬',
    '推送': '📨', '解码': '📦', '错误': '❌',
    '农场': '🌾', '巡田': '🌾', '收获': '🌽', '种植': '🌱',
    '除草': '🌿', '除虫': '🐛', '浇水': '💦', '升级': '🌟', '偷菜': '🥬',
    '商店': '🛒', '购买': '💰',
    '好友': '👥', '申请': '👋',
    '任务': '📝', '仓库': '📦', 'API': '🌐', '配置': '🔧',
};

module.exports = {
    PLATFORMS,
    PHASE_NAMES,
    PlantPhase,
    FRUIT_ID_SET,
    GOLD_ITEM_ID,
    NORMAL_FERTILIZER_ID,
    TAG_ICONS
};
