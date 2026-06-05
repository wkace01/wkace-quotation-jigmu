require('dotenv').config(); // .env 파일 로드 (로컬 개발용, 배포 환경에서는 플랫폼 환경변수 사용)

const express = require('express');
const cors = require('cors');
const XlsxPopulate = require('xlsx-populate');
const { JSDOM } = require('jsdom');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { notifyServerError, notifyClientError, notifyQuoteSent } = require('./notifyError');

const app = express();
const PORT = process.env.PORT || 3001;

// LibreOffice 실행 경로 (운영 환경(Linux)에서는 전역 명령어 'soffice' 사용)
const SOFFICE_PATH = process.platform === 'win32'
    ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
    : 'soffice';

// Excel 템플릿 경로 (현재 폴더에 있는 파일명)
const TEMPLATE_PATH = path.join(__dirname, '직무고시 견적서 양식.xlsx');
// 임시 파일 저장 디렉토리
const TEMP_DIR = path.join(__dirname, 'temp_pdf');

app.use(cors({
    exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '10mb' }));

// 정적 파일(프론트엔드 HTML, JS, CSS) 제공
app.use(express.static(path.join(__dirname, 'public')));

// 임시 폴더 생성
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function toLibreOfficeFileUrl(filePath) {
    const normalized = path.resolve(filePath).replace(/\\/g, '/');
    const prefix = normalized.startsWith('/') ? 'file://' : 'file:///';
    return prefix + encodeURI(normalized);
}

async function waitForFile(filePath, timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (fs.existsSync(filePath)) return true;
        await sleep(250);
    }
    return fs.existsSync(filePath);
}

async function convertXlsxToPdf(xlsxPath, outputDir, expectedPdfPath, timestamp) {
    const userProfileDir = path.join(TEMP_DIR, `lo_profile_${timestamp}`);
    fs.mkdirSync(userProfileDir, { recursive: true });

    try {
        execFileSync(SOFFICE_PATH, [
            `-env:UserInstallation=${toLibreOfficeFileUrl(userProfileDir)}`,
            '--headless',
            '--nologo',
            '--nofirststartwizard',
            '--nolockcheck',
            '--convert-to',
            'pdf',
            '--outdir',
            outputDir,
            xlsxPath
        ], { timeout: 90000, stdio: 'pipe' });

        if (!(await waitForFile(expectedPdfPath))) {
            throw new Error('PDF conversion finished, but the PDF file was not created in time.');
        }
    } finally {
        try { fs.rmSync(userProfileDir, { recursive: true, force: true }); } catch { }
    }
}

function requireEnv(name, label) {
    const value = process.env[name];
    if (!value) throw new Error(`${label} 환경변수가 설정되지 않았습니다.`);
    return value;
}

function getXmlText(doc, tag) {
    return doc.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
}

/**
 * ── GET /api/address-info ────────────────────────────────── (도로명주소 API 프록시)
 */
app.get('/api/address-info', async (req, res) => {
    try {
        const keyword = String(req.query.keyword || '').trim();
        if (!keyword) return res.status(400).json({ error: '주소 검색어가 필요합니다.' });

        const key = requireEnv('JUSO_API_KEY', '도로명주소 API 키');
        const url = `https://www.juso.go.kr/addrlink/addrLinkApi.do?confmKey=${encodeURIComponent(key)}&currentPage=1&countPerPage=5&keyword=${encodeURIComponent(keyword)}&resultType=json`;
        const apiRes = await fetch(url);
        const data = await apiRes.json();

        const common = data.results?.common;
        if (common?.errorCode !== '0') {
            return res.status(502).json({ error: common?.errorMessage || '주소 API 오류' });
        }

        const juso = data.results?.juso?.[0];
        if (!juso) return res.status(404).json({ error: '검색된 주소가 없습니다.' });

        const admCd = juso.admCd || '';
        res.json({
            sigunguCd: admCd.substring(0, 5),
            bjdongCd: admCd.substring(5),
            bun: juso.lnbrMnnm || '',
            ji: juso.lnbrSlno || '0',
            roadAddr: juso.roadAddr,
            jibunAddr: juso.jibunAddr
        });
    } catch (err) {
        console.error('❌ 주소 API 프록시 오류:', err.message);
        notifyServerError({ context: 'GET /api/address-proxy', err, req }).catch(() => {});
        res.status(500).json({ error: err.message });
    }
});

/**
 * ── GET /api/building-register ────────────────────────────── (건축물대장 API 프록시)
 */
app.get('/api/building-register', async (req, res) => {
    try {
        const { sigunguCd, bjdongCd, bun, ji = '0' } = req.query;
        if (!sigunguCd || !bjdongCd || !bun) {
            return res.status(400).json({ error: '건축물대장 조회에 필요한 주소 코드가 부족합니다.' });
        }

        const key = requireEnv('BUILDING_API_KEY', '건축물대장 API 키');
        const paddedBun = String(bun).padStart(4, '0');
        const paddedJi = String(ji).padStart(4, '0');
        // serviceKey는 data.go.kr 발급 시 이미 URL 인코딩된 값이므로 encodeURIComponent 없이 직접 삽입
        const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${key}&sigunguCd=${encodeURIComponent(sigunguCd)}&bjdongCd=${encodeURIComponent(bjdongCd)}&bun=${paddedBun}&ji=${paddedJi}&numOfRows=100&pageNo=1`;

        const apiRes = await fetch(url);
        const rawText = await apiRes.text();

        if (!apiRes.ok) {
            console.error(`❌ 건축물대장 API HTTP 오류 (${apiRes.status}):`, rawText.slice(0, 300));
            return res.status(502).json({ error: `건축물대장 API 오류 (HTTP ${apiRes.status})` });
        }

        // BOM 및 루트 노드 앞 공백 제거 후 XML 파싱
        const xmlText = rawText.replace(/^﻿/, '').trimStart();

        if (!xmlText.startsWith('<')) {
            console.error('❌ 건축물대장 API 응답이 XML 형식이 아님:', xmlText.slice(0, 300));
            return res.status(502).json({ error: '건축물대장 API가 유효하지 않은 응답을 반환했습니다.' });
        }

        const dom = new JSDOM(xmlText, { contentType: 'text/xml' });
        const xmlDoc = dom.window.document;

        const totalCount = parseInt(getXmlText(xmlDoc, 'totalCount') || '0', 10);
        if (totalCount === 0) return res.status(404).json({ error: '해당 지번에 건축물대장 정보가 없습니다.' });

        const items = Array.from(xmlDoc.getElementsByTagName('item'));
        let target = items.find(item => item.getElementsByTagName('mainAtchGbCd')[0]?.textContent === '0');
        if (!target) target = items[0];

        const getVal = (tag) => target.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
        res.json({
            totArea: getVal('totArea'),
            mainPurpsCdNm: getVal('mainPurpsCdNm'),
            platArea: getVal('platArea'),
            archArea: getVal('archArea'),
            useAprDay: getVal('useAprDay'),
            bldNm: getVal('bldNm'),
            mainAtchGbCdNm: getVal('mainAtchGbCdNm')
        });
    } catch (err) {
        console.error('❌ 건축물대장 API 프록시 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * ── POST /generate-pdf ──────────────────────────────────── (PDF 생성 + 선택적 Airtable 업로드)
 * body: { mapping, airtableInfo?: { baseId, recordId } }
 * airtableInfo가 있으면 PDF 생성 직후 서버 내부에서 Airtable에 fire-and-forget 업로드
 * → LibreOffice는 단 1회만 실행
 */
app.post('/generate-pdf', async (req, res) => {
    const timestamp = Date.now();
    const tempXlsx = path.join(TEMP_DIR, `quotation_${timestamp}.xlsx`);
    const expectedPdf = tempXlsx.replace('.xlsx', '.pdf');

    try {
        const { templateName, outputSheets, data, airtableInfo, _meta } = req.body;
        const actualData = data || req.body;
        const managementCompany = _meta?.managementCompany || '';
        const actualTemplate = templateName || '직무고시 견적서 양식.xlsx';
        const actualSheets = outputSheets || Object.keys(actualData);

        const workbook = await XlsxPopulate.fromFileAsync(path.join(__dirname, actualTemplate));
        workbook.sheets().forEach(sheet => {
            if (!actualSheets.includes(sheet.name())) sheet.hidden('very');
        });

        for (const [sheetName, cells] of Object.entries(actualData)) {
            const sheet = workbook.sheet(sheetName);
            if (!sheet || !Array.isArray(cells)) continue;
            for (const { cell, value } of cells) {
                if (cell) {
                    const ws_cell = sheet.cell(cell);
                    ws_cell.formula(undefined);
                    ws_cell.value(value);
                }
            }
        }

        await workbook.toFileAsync(tempXlsx);
        await convertXlsxToPdf(tempXlsx, TEMP_DIR, expectedPdf, timestamp);

        // 1. PDF 먼저 생성됨 (위 convertXlsxToPdf 에 의해)
        if (!fs.existsSync(expectedPdf)) throw new Error('PDF 변환 실패');

        const getFieldValue = (fieldName, defaultValue = '') => {
            try {
                for (const cells of Object.values(actualData)) {
                    if (Array.isArray(cells)) {
                        const found = cells.find(c => c.name === fieldName);
                        if (found && found.value) return String(found.value).replace(/[/\\?%*:|"<>]/g, '_');
                    }
                }
                return defaultValue;
            } catch { return defaultValue; }
        };

        const customerName = getFieldValue('고객명', '견적서');
        const salesManager = getFieldValue('영업담당자', '담당자미상');

        // 브라우저 다운로드 파일명 (quoteId 없이 즉시 전송 — ID는 Airtable 첨부 파일명에만 포함)
        const fileName = `직무고시견적서_${customerName}_${salesManager}.pdf`;

        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.setHeader('Content-Type', 'application/pdf');

        // PDF를 클라이언트에 즉시 전송 (Railway 30초 타임아웃 해소)
        // Airtable 동기화는 전송 완료 후 백그라운드에서 실행
        res.sendFile(expectedPdf, {}, async (sendErr) => {
            if (sendErr && !sendErr.message.includes('ECONNRESET')) {
                console.error('❌ PDF 전송 오류:', sendErr.message);
            } else {
                notifyQuoteSent({ manager: salesManager, customerName, fileName }).catch(() => {});
            }

            // 백그라운드: Airtable 동기화 → PDF 첨부 업로드 → cleanup
            try {
                const { syncToAirtable } = require('./airtableHandler');
                const syncResult = await syncToAirtable(actualData, { managementCompany });
                if (syncResult) {
                    const quoteDisplayId = syncResult.quoteUniqueId || syncResult.quoteId;
                    const airtableFileName = `${quoteDisplayId}_직무고시견적서_${customerName}_${salesManager}.pdf`;
                    const token = process.env.AIRTABLE_API_KEY;
                    if (token && fs.existsSync(expectedPdf)) {
                        const pdfBuffer = fs.readFileSync(expectedPdf);
                        const base64Pdf = pdfBuffer.toString('base64');
                        // content.airtable.com 업로드 API는 비공식이나 공식 PATCH로 첨부 불가하여 유지
                        const fieldId = 'fldMmmPZDEHRqLfbZ';
                        const uploadUrl = `https://content.airtable.com/v0/${syncResult.baseId}/${syncResult.quoteId}/${fieldId}/uploadAttachment`;
                        fetch(uploadUrl, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ contentType: 'application/pdf', file: base64Pdf, filename: airtableFileName })
                        })
                        .then(r => r.ok
                            ? console.log(`✅ Airtable PDF 업로드 성공: ${airtableFileName}`)
                            : r.json().then(e => console.error('❌ Airtable PDF 업로드 실패:', e?.error?.message || e))
                        )
                        .catch(e => console.error('❌ Airtable PDF 업로드 네트워크 오류:', e.message))
                        .finally(() => cleanup(tempXlsx, expectedPdf));
                    } else {
                        cleanup(tempXlsx, expectedPdf);
                    }
                } else {
                    cleanup(tempXlsx, expectedPdf);
                }
            } catch (syncErr) {
                console.error('❌ 에어테이블 동기화 단계 오류:', syncErr);
                notifyServerError({ context: 'Airtable 동기화 (직무고시)', err: syncErr, req }).catch(() => {});
                cleanup(tempXlsx, expectedPdf);
            }
        });

    } catch (err) {
        console.error('❌ PDF 생성 오류:', err.message);
        notifyServerError({ context: 'POST /generate-pdf', err, req }).catch(() => {});
        cleanup(tempXlsx, expectedPdf);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

/**
 * ── POST /upload-pdf-to-airtable ────────────────────────────────────────── (PDF 생성 후 에어테이블 직접 업로드)
 */
app.post('/upload-pdf-to-airtable', async (req, res) => {
    const timestamp = Date.now();
    const tempXlsx = path.join(TEMP_DIR, `upload_${timestamp}.xlsx`);
    const expectedPdf = tempXlsx.replace('.xlsx', '.pdf');

    try {
        const { mapping, airtableInfo } = req.body;
        const { baseId, recordId } = airtableInfo;
        const token = process.env.AIRTABLE_API_KEY;

        if (!token) throw new Error('서버 환경 변수(AIRTABLE_API_KEY)가 설정되지 않았습니다.');

        const workbook = await XlsxPopulate.fromFileAsync(TEMPLATE_PATH);
        const actualSheets = Object.keys(mapping);
        workbook.sheets().forEach(sheet => {
            if (!actualSheets.includes(sheet.name())) sheet.hidden('very');
        });

        for (const [sheetName, cells] of Object.entries(mapping)) {
            const sheet = workbook.sheet(sheetName);
            if (!sheet || !Array.isArray(cells)) continue;
            for (const { cell, value } of cells) {
                if (cell) {
                    const ws_cell = sheet.cell(cell);
                    ws_cell.formula(undefined);
                    ws_cell.value(value);
                }
            }
        }
        await workbook.toFileAsync(tempXlsx);
        await convertXlsxToPdf(tempXlsx, TEMP_DIR, expectedPdf, timestamp);

        if (!fs.existsSync(expectedPdf)) throw new Error('PDF 생성 실패');

        const pdfBuffer = fs.readFileSync(expectedPdf);
        const base64Pdf = pdfBuffer.toString('base64');
        const fileName = (mapping["견적서"]?.find(c => c.name === '고객명')?.value || '견적서') + '_견적서.pdf';

        const fieldId = "YOUR_FIELD_ID_HERE"; // TODO: 실제 Attachment Field ID 기입 
        const uploadUrl = `https://content.airtable.com/v0/${baseId}/${recordId}/${fieldId}/uploadAttachment`;
        
        const airRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contentType: 'application/pdf',
                file: base64Pdf,
                filename: fileName
            })
        });

        const airData = await airRes.json();
        if (!airRes.ok) throw new Error(airData.error?.message || '업로드 실패');

        res.json({ success: true, airData });

    } catch (err) {
        console.error('❌ 업로드 오류:', err.message);
        notifyServerError({ context: 'POST /upload-pdf-to-airtable', err, req }).catch(() => {});
        res.status(500).json({ error: err.message });
    } finally {
        cleanup(tempXlsx, expectedPdf);
    }
});

/**
 * ── ANY /airtable-proxy ────────────────────────────────────────────────── (보안 프록시)
 * app.use를 사용하여 경로 파싱 오류(PathError)를 원천 차단하고 모든 하위 경로를 수용합니다.
 */
app.use('/airtable-proxy', async (req, res) => {
    // req.url은 '/airtable-proxy' 이후의 전체 경로(쿼리 스트링 포함)를 담고 있습니다.
    // 예: /airtable-proxy/appID/tableID?filter=... -> req.url은 /appID/tableID?filter=...
    const subPath = req.url.startsWith('/') ? req.url.slice(1) : req.url;
    const targetUrl = `https://api.airtable.com/v0/${subPath}`;
    const token = process.env.AIRTABLE_API_KEY;

    if (!token) return res.status(500).json({ error: '서버에 에어테이블 API 키가 설정되지 않았습니다.' });

    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const airRes = await fetch(targetUrl, fetchOptions);
        const airData = await airRes.json();
        res.status(airRes.status).json(airData);
    } catch (err) {
        console.error('❌ 프록시 오류:', err.message);
        notifyServerError({ context: 'airtable-proxy', err, req }).catch(() => {});
        res.status(500).json({ error: err.message });
    }
});

/**
 * ── GET /api/public-config ──────────────────────────────────────── (브라우저용 공개 설정)
 * 한국 정부 API는 Railway 서버에서 접근 불가(해외 IP 차단)이므로 브라우저가 직접 호출한다.
 * Airtable 키는 포함하지 않는다.
 */
app.get('/api/public-config', (req, res) => {
    res.json({
        buildingApiKey: process.env.BUILDING_API_KEY || ''
    });
});

/**
 * ── GET /health ─────────────────────────────────────────────────── (상태 체크)
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        envCheck: !!(process.env['airtable API key'] || process.env.AIRTABLE_API_KEY),
        time: new Date().toLocaleString()
    });
});

function cleanup(...files) {
    for (const f of files) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { }
    }
}

app.listen(PORT, () => {
    console.log(`🚀 서버 실행 중 → http://localhost:${PORT}`);
});
