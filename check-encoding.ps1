# check-encoding.ps1
# public/ 폴더 JS 파일에서 EUC-KR 잔재(깨진 한글) 탐지
# 사용법: .\check-encoding.ps1

# EUC-KR이 UTF-8로 잘못 읽힐 때 나타나는 특징적인 문자 리스트 (유니코드 코드포인트)
# 吏=U+5540, 踰=U+8E70, 嫄=U+5AC4, 댁=U+B311, 뿉=U+BC49, 덈=U+B108, 떎=U+B5CE, 뺣=U+BC23, 낫=U+B099
$suspiciousChars = @(0x5540, 0x8E70, 0x5AC4, 0xB311, 0xBC49, 0xB108, 0xB5CE, 0xBC23, 0xB099, 0x4E8C, 0x5BF8, 0x5C0B, 0x5BF8, 0x5BCF)

$files = Get-ChildItem "public/*.js"

Write-Host "`n===== 인코딩 점검 결과 =====" -ForegroundColor Cyan

$foundAny = $false
foreach ($file in $files) {
    $lines = Get-Content $file.FullName -Encoding UTF8
    $badLines = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        foreach ($cp in $suspiciousChars) {
            $ch = [char]$cp
            if ($line.Contains($ch)) {
                $badLines += "  Line $($i+1): $($line.Trim().Substring(0, [Math]::Min(80, $line.Trim().Length)))"
                break
            }
        }
    }
    if ($badLines.Count -gt 0) {
        Write-Host "WARNING  $($file.Name): 깨진 문자 의심 $($badLines.Count)줄" -ForegroundColor Yellow
        $badLines | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }
        $foundAny = $true
    } else {
        Write-Host "OK       $($file.Name)" -ForegroundColor Green
    }
}

if (-not $foundAny) {
    Write-Host "`n모든 파일 정상 (깨진 문자 없음)" -ForegroundColor Green
} else {
    Write-Host "`n위 파일을 전면 재작성하세요 (.agents/workflows/fix-encoding-corruption.md 참고)" -ForegroundColor Yellow
}
