'use strict';

// 서버 이름 — Railway 환경변수로 오버라이드 가능
const SERVER_NAME = process.env.SERVER_NAME || '정보통신 스마트견적서';

function toKST(date = new Date()) {
    return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

// Gemini 1.5 Flash 호출 (REST 직접, 8초 타임아웃)
async function callGemini(prompt) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 250, temperature: 0.3 }
                }),
                signal: controller.signal
            }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch {
        return null;
    } finally {
        clearTimeout(tid);
    }
}

async function postToDiscord(webhookUrl, payload) {
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch {
        // Discord 전송 실패는 서버 동작에 영향 없음
    }
}

// ── 서버 500 오류 알림 ────────────────────────────────────────────────────────
async function notifyServerError({ context, err, req }) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_LOGS;
    if (!webhookUrl) return;

    const method = req?.method || '';
    const reqPath = req?.path || context || '';
    const stack = (err?.stack || err?.message || String(err)).slice(0, 1500);

    const geminiPrompt = `다음 Node.js 서버 오류의 원인과 수정 방법을 3줄 이내 한국어로 설명해줘.\n\n경로: ${method} ${reqPath}\n오류:\n${stack}`;
    const analysis = await callGemini(geminiPrompt);

    const stackPreview = (err?.stack || '').split('\n').slice(0, 4).join('\n').slice(0, 500);

    const fields = [
        { name: '경로', value: `\`${method} ${reqPath}\``.trim() || '-', inline: true },
        { name: '시각', value: toKST(), inline: true },
        { name: '오류 메시지', value: `\`\`\`${String(err?.message || err).slice(0, 300)}\`\`\`` },
    ];
    if (stackPreview) {
        fields.push({ name: '스택', value: `\`\`\`${stackPreview}\`\`\`` });
    }
    if (analysis) {
        fields.push({ name: '🤖 Gemini 분석', value: analysis });
    }

    await postToDiscord(webhookUrl, {
        embeds: [{
            title: `🔴 서버 오류 — ${SERVER_NAME}`,
            color: 0xef4444,
            fields,
            timestamp: new Date().toISOString()
        }]
    });
}

// ── 클라이언트 오류 알림 (/log-client-error) ─────────────────────────────────
async function notifyClientError({ context, error, customerName, salesManager }) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_LOGS;
    if (!webhookUrl) return;

    await postToDiscord(webhookUrl, {
        embeds: [{
            title: `🟡 클라이언트 오류 — ${SERVER_NAME}`,
            color: 0xf59e0b,
            fields: [
                { name: '컨텍스트', value: context || '-', inline: true },
                { name: '시각', value: toKST(), inline: true },
                { name: '고객', value: customerName || '-', inline: true },
                { name: '담당자', value: salesManager || '-', inline: true },
                { name: '오류', value: `\`\`\`${String(error || '-').slice(0, 400)}\`\`\`` }
            ],
            timestamp: new Date().toISOString()
        }]
    });
}

// ── 견적 발행 알림 ────────────────────────────────────────────────────────────
async function notifyQuoteSent({ manager, customerName, fileName }) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_QUOTES;
    if (!webhookUrl) return;

    await postToDiscord(webhookUrl, {
        embeds: [{
            title: `📄 견적 발행 — ${SERVER_NAME}`,
            color: 0x22c55e,
            fields: [
                { name: '담당자', value: manager || '-', inline: true },
                { name: '대상처', value: customerName || '-', inline: true },
                { name: '파일명', value: fileName || '-' },
                { name: '시각', value: toKST(), inline: true }
            ],
            timestamp: new Date().toISOString()
        }]
    });
}

// ── 일일 업무 현황 요약 (#할일-현황) ──────────────────────────────────────────
async function sendDailySummary() {
    const webhookUrl = process.env.DISCORD_WEBHOOK_TASKS;
    const airtableKey = process.env.AIRTABLE_API_KEY;
    if (!webhookUrl || !airtableKey) return;

    const BASE_ID  = 'appsc0igo68T15Gmy';
    const TABLE_ID = 'tbl2VssgYG5jLc9xu';
    const F_STATUS = 'fldLt0VtFkBVGhdrL';
    const F_TITLE  = 'fldbt3QkS1HAR5ySp';
    const F_START  = 'fldaPlAixCEICyYrO';

    const today       = new Date().toISOString().slice(0, 10);
    const sevenAgo    = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const filter = encodeURIComponent(
        `NOT(OR({${F_STATUS}}="완료",{${F_STATUS}}="보류"))`
    );
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}` +
        `?filterByFormula=${filter}&fields[]=${F_STATUS}&fields[]=${F_TITLE}&fields[]=${F_START}&pageSize=100`;

    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${airtableKey}` } });
        if (!res.ok) return;
        const { records = [] } = await res.json();

        const inProgress = records.filter(r => r.fields[F_STATUS] === '진행중');
        const overdue    = records.filter(r => {
            const s = r.fields[F_START];
            return ['진행 예정', '진행중'].includes(r.fields[F_STATUS]) && s && s <= sevenAgo;
        });
        const upcoming   = records.filter(r => {
            const s = r.fields[F_START];
            return r.fields[F_STATUS] === '진행 예정' && s && s <= today && s > sevenAgo;
        });
        const waiting    = records.filter(r => r.fields[F_STATUS] === '대기 중');

        const fmt = (recs) => recs.length
            ? recs.map(r => `• ${r.fields[F_TITLE] || '(제목 없음)'}`).join('\n').slice(0, 900)
            : '없음';

        const fields = [
            { name: `🔴 기한 초과 (7일+) — ${overdue.length}건`, value: fmt(overdue) },
            { name: `🟡 진행중 — ${inProgress.length}건`, value: fmt(inProgress) },
            { name: `🟢 시작 예정 (오늘 이하) — ${upcoming.length}건`, value: fmt(upcoming) },
        ];
        if (waiting.length) {
            fields.push({ name: `⏸️ 대기 중 — ${waiting.length}건`, value: fmt(waiting) });
        }

        await postToDiscord(webhookUrl, {
            embeds: [{
                title: `📋 오늘의 업무 현황 — ${toKST()}`,
                color: overdue.length > 0 ? 0xef4444 : 0x3b82f6,
                fields,
                timestamp: new Date().toISOString()
            }]
        });
    } catch {
        // 요약 실패는 조용히 무시
    }
}

module.exports = { notifyServerError, notifyClientError, notifyQuoteSent, sendDailySummary };
