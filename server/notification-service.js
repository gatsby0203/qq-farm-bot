/**
 * notification-service.js - 通用推送服务
 *
 * 支持邮件和 ServerChan 两种推送渠道
 * 接受显式的渠道配置，不依赖全局设置
 */

const https = require('https');
const emailService = require('./email-service');

/**
 * 向指定 ServerChan 渠道发送消息
 * @param {'sc3'|'turbo'} type - 方糖通道类型
 * @param {string} sendKey - SendKey
 * @param {string} title - 消息标题
 * @param {string} desp - Markdown 内容
 */
async function sendServerChan(type, sendKey, title, desp) {
    return new Promise((resolve, reject) => {
        let options;
        const postData = new URLSearchParams({ title, desp }).toString();

        if (type === 'turbo') {
            options = {
                hostname: 'sctapi.ftqq.com',
                path: `/${sendKey}.send`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
        } else {
            const uidMatch = sendKey.match(/^sctp(\d+)t/i);
            const host = uidMatch ? `${uidMatch[1]}.push.ft07.com` : 'push.ft07.com';
            options = {
                hostname: host,
                path: `/send/${sendKey}.send`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.code !== 0) return reject(new Error(result.message || 'ServerChan API Error'));
                    resolve(result);
                } catch (e) {
                    reject(new Error(`Failed to parse ServerChan response: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

/**
 * 通用推送方法 (使用显式渠道配置)
 * @param {string} title - 标题
 * @param {string} md - Markdown 格式内容
 * @param {string} html - HTML 格式内容 (可选)
 * @param {object} channelConfig - 渠道配置
 * @param {string} channelConfig.mailTo - 收件邮箱
 * @param {boolean} channelConfig.useEmail - 是否邮件推送
 * @param {string} channelConfig.scType - 方糖类型 ('sc3'|'turbo')
 * @param {string} channelConfig.scKey - 方糖 SendKey
 * @param {boolean} channelConfig.useSc - 是否方糖推送
 */
async function pushNotification(title, md, html, channelConfig = {}) {
    const { mailTo, useEmail, scType, scKey, useSc } = channelConfig;
    const tasks = [];

    if (useEmail && mailTo) {
        let finalHtml = html;
        if (!finalHtml) {
            finalHtml = md.replace(/\n/g, '<br/>');
        }
        tasks.push(
            emailService.sendWithRetry(mailTo, title, finalHtml)
                .then(() => console.log(`[推送] ${title} - 邮件发送成功 -> ${mailTo}`))
                .catch(err => console.error(`[推送] ${title} - 邮件发送失败: ${err.message}`))
        );
    }

    if (useSc && scKey) {
        tasks.push(
            sendServerChan(scType || 'sc3', scKey, title, md)
                .then(() => console.log(`[推送] ${title} - ServerChan 发送成功`))
                .catch(err => console.error(`[推送] ${title} - ServerChan 发送失败: ${err.message}`))
        );
    }

    if (tasks.length > 0) {
        await Promise.all(tasks);
    }
}

module.exports = { pushNotification, sendServerChan };
