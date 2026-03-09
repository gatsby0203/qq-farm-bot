const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRETS_FILE = path.join(__dirname, '..', 'data', '.secrets.json');

/**
 * 确保系统具有安全的加密密钥和 JWT 密钥。
 * 如果环境变量中没有提供，则自动生成随机高强度密钥并保存在 .secrets.json 中。
 * 避免使用硬编码的弱密钥被恶意破解。
 */
function ensureSecureKeys() {
    let secrets = {};
    if (fs.existsSync(SECRETS_FILE)) {
        try {
            secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
        } catch (e) {
            console.error('[Security] 读取 .secrets.json 失败，将重新生成', e);
        }
    }

    let needsSave = false;

    // 1. 处理 BOT_ENCRYPT_KEY
    if (!process.env.BOT_ENCRYPT_KEY) {
        if (!secrets.BOT_ENCRYPT_KEY) {
            // 生成 32 字节 (256 bits) 的高强度十六进制随机字符串
            secrets.BOT_ENCRYPT_KEY = crypto.randomBytes(32).toString('hex');
            needsSave = true;
            console.log(`[Security] 警告: 未配置 BOT_ENCRYPT_KEY 环境变量。已自动生成随机密钥以保障会话安全。`);
        }
        process.env.BOT_ENCRYPT_KEY = secrets.BOT_ENCRYPT_KEY;
    }

    // 2. 处理 JWT_SECRET
    if (!process.env.JWT_SECRET) {
        if (!secrets.JWT_SECRET) {
            // 生成 64 字节的高强度随机字符串作为 JWT 签名密钥
            secrets.JWT_SECRET = crypto.randomBytes(64).toString('base64');
            needsSave = true;
            console.log(`[Security] 警告: 未配置 JWT_SECRET 环境变量。已自动生成随机密钥以保障后台接口安全。`);
        }
        process.env.JWT_SECRET = secrets.JWT_SECRET;
    }

    if (needsSave) {
        // 确保 data 目录存在
        const dataDir = path.dirname(SECRETS_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    }
}

module.exports = {
    ensureSecureKeys
};
