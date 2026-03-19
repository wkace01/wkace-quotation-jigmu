require('dotenv').config(); // .env 파일 로드 (로컬 개발용, 배포 환경에서는 플랫폼 환경변수 사용)

const express = require('express');
const cors = require('cors');
const XlsxPopulate = require('xlsx-populate');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// LibreOffice 실행 경로 (운영 환경(Linux)에서는 전역 명령어 'soffice' 사용)
const SOFFICE_PATH = process.platform === 'win32'
    ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
    : 'soffice';

// Excel 템플릿 경로 (현재 폴더에 있는 파일명)
const TEMPLATE_PATH = path.join(__dirname, 'template_quotation.xlsx'); // TODO: 사업부별 엑셀 파일명으로 변경
// 임시 파일 저장 디렉토리
const TEMP_DIR = path.join(__dirname, 'temp_pdf');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 정적 파일(프론트엔드 HTML, JS, CSS) 제공
app.use(express.static(path.join(__dirname, 'public')));

// 임시 폴더 생성
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

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
        const { templateName, outputSheets, data, airtableInfo } = req.body;
        const actualData = data || req.body;
        const actualTemplate = templateName || 'template_quotation.xlsx'; // TODO: 사업부별 엑셀 파일명으로 변경
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
        execSync(`"${SOFFICE_PATH}" --headless --convert-to pdf --outdir "${TEMP_DIR}" "${tempXlsx}"`, { timeout: 90000 });

        if (!fs.existsSync(expectedPdf)) throw new Error('PDF 변환 실패');

        const customerName = (() => {
            try {
                for (const cells of Object.values(actualData)) {
                    if (Array.isArray(cells)) {
                        const found = cells.find(c => c.name === '고객명');
                        if (found && found.value) return String(found.value).replace(/[/\\?%*:|"<>]/g, '_');
                    }
                }
                return '견적서';
            } catch { return '견적서'; }
        })();
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const fileName = `${customerName}_견적서_${today}.pdf`;

        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.setHeader('Content-Type', 'application/pdf');

        // PDF를 클라이언트에 전송
        res.sendFile(expectedPdf, {}, (sendErr) => {
            if (sendErr && !sendErr.message.includes('ECONNRESET')) {
                console.error('❌ PDF 전송 오류:', sendErr.message);
            }

            // Airtable 업로드 (서버 내부 fire-and-forget, 클라이언트 응답과 무관)
            if (airtableInfo && airtableInfo.recordId) {
                const token = process.env.AIRTABLE_API_KEY;
                if (token && fs.existsSync(expectedPdf)) {
                    const pdfBuffer = fs.readFileSync(expectedPdf);
                    const base64Pdf = pdfBuffer.toString('base64');
                    const fieldId = 'YOUR_FIELD_ID_HERE'; // TODO: 실제 Attachment Field ID 기입
                    const uploadUrl = `https://content.airtable.com/v0/${airtableInfo.baseId}/${airtableInfo.recordId}/${fieldId}/uploadAttachment`;

                    fetch(uploadUrl, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contentType: 'application/pdf', file: base64Pdf, filename: fileName })
                    })
                    .then(r => r.ok
                        ? console.log(`✅ Airtable PDF 업로드 성공: ${fileName}`)
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
        });

    } catch (err) {
        console.error('❌ PDF 생성 오류:', err.message);
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
        execSync(`"${SOFFICE_PATH}" --headless --convert-to pdf --outdir "${TEMP_DIR}" "${tempXlsx}"`, { timeout: 90000 });

        if (!fs.existsSync(expectedPdf)) throw new Error('PDF 생성 실패');

        const pdfBuffer = fs.readFileSync(expectedPdf);
        const base64Pdf = pdfBuffer.toString('base64');
        const fileName = (mapping["1. 견적서"]?.find(c => c.name === '고객명')?.value || '견적서') + '_견적서.pdf';

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
        res.status(500).json({ error: err.message });
    }
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
