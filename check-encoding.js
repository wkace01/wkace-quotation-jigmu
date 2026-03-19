// check-encoding.js
// public/ 폴더 JS 파일에서 EUC-KR 잔재(깨진 한글) 탐지
// 사용법: node check-encoding.js

const fs = require('fs');
const path = require('path');

// EUC-KR이 UTF-8로 잘못 읽힐 때 나타나는 특징적인 한자/깨진 한글 코드포인트
const SUSPICIOUS = [
    0x5540, // 吏
    0x8E70, // 踰
    0x5AC4, // 嫄
    0x5BF8, // 媛
    0x8AB8, // 諛
    0x4E8C, // 二
    0x5BF8, // 媛
    0x6E7F, // 湲
    0x5C07, // 將
    0x81EA, // 自
];

const publicDir = path.join(__dirname, 'public');
const jsFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.js'));

let allOk = true;
console.log('\n===== 인코딩 점검 결과 =====');

for (const file of jsFiles) {
    const filePath = path.join(publicDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const badLines = [];

    lines.forEach((line, idx) => {
        const hasSuspicious = [...line].some(ch => {
            const cp = ch.codePointAt(0);
            return SUSPICIOUS.includes(cp);
        });
        if (hasSuspicious) {
            badLines.push(`  Line ${idx + 1}: ${line.trim().slice(0, 100)}`);
        }
    });

    if (badLines.length > 0) {
        console.log(`WARNING  ${file}: 깨진 문자 의심 ${badLines.length}줄`);
        badLines.forEach(l => console.log(l));
        allOk = false;
    } else {
        console.log(`OK       ${file}`);
    }
}

if (allOk) {
    console.log('\n모든 파일 정상 (깨진 문자 없음)');
} else {
    console.log('\n위 파일을 전면 재작성하세요. (.agents/workflows/fix-encoding-corruption.md 참고)');
    process.exit(1);
}
