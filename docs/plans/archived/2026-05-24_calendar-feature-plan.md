## Goal

新增一個已登入使用者可用的 workout calendar 月曆頁，讓使用者用月視圖掃描訓練紀錄；一週固定從星期日開始。完成後使用者可以從導覽列進入 Calendar、切換月份、查看每日 workout 摘要，並點進 workout 詳細頁。

## Context

- 目前 `/workouts` 是依日期倒序的清單頁，沒有日曆視圖。
- `Workout.date`、`Workout.sets` 和既有 user ownership 已足夠支援日曆，不需要 Prisma schema migration。
- App Router 頁面是 server component；使用者驗證透過 `requireUser()`，UI 字串要先放進 `src/lib/i18n.ts`，英文為預設顯示。

## Assumptions

- 第一版做月曆頁 `/calendar`，不是把 `/workouts` 改成日曆。
- 月份切換使用 query string：`/calendar?year=2026&month=5`，`month` 為 1 到 12。
- 日期計算用 local date component，不用 `toISOString().slice(0, 10)` 產生 UI key，避免時區造成日期前後一天。
- 每個日期格顯示當天 workout title 或 `Workout`、set count、notes 是否存在；詳細 set 表格仍在 `/workouts/[id]`。

## Plan

- [x] 新增 calendar date helper，產生固定 6 週、42 格的月曆資料，週起始固定 Sunday；已用 `node --experimental-transform-types` smoke 確認 2026-05-01 落在 Friday 欄位且第一列從 Sunday 開始。
- [x] 新增 `src/app/calendar/page.tsx` server page，讀取 `year/month` search params，無效值 fallback 到目前月份；用 `requireUser()` 查詢該使用者從 grid 起始日到結束日的 workouts，並依本地 `YYYY-MM-DD` 分組。
- [x] 在 calendar page 建立月曆 UI：上方顯示月份標題、Previous/Today/Next 導航；表頭為 `Sun Mon Tue Wed Thu Fri Sat`；日期格標示非本月日期，當天有 workout 時顯示可點擊摘要連到 `/workouts/[id]`。
- [x] 更新 `src/lib/i18n.ts` 和 `src/app/layout.tsx`，新增導覽列 `Calendar` 與 calendar 所需字串，維持英文預設、`zh-TW` 可先 fallback。
- [x] 擴充 `src/app/globals.css`，加入 responsive calendar grid 樣式；桌面維持 7 欄，窄螢幕仍保留 7 欄但縮小 padding/字級，避免日期格內容互相覆蓋。
- [x] 驗證 route 行為：登入後 `/calendar` 可開啟，`?year=2026&month=5` 顯示 2026 年 5 月，Previous/Next 產生正確 URL，點擊 workout 進入既有詳細頁。

## Risks

- Date 物件在 SQLite/Node/瀏覽器顯示時容易受時區影響；實作集中用 local date helper 產生 key 和 range。
- 每天多筆 workout 可能讓格子過高；第一版在每格列出最多 2 筆摘要，資料較多時用 `+N more` 壓縮。

## Completion Checklist

- [x] `/calendar` route 已存在，已登入使用者可從 top nav 進入；browser snapshot 顯示 nav link `Calendar` 且 main heading 為 `Calendar`。
- [x] 月曆一週從 Sunday 開始，驗證月份包含 42 個 cells 且 weekday header 順序為 Sun 到 Sat；helper smoke 與 browser DOM 檢查皆通過。
- [x] Calendar 查詢只顯示目前使用者 workouts，並能連到 `/workouts/[id]`；browser smoke 點擊 workout link 成功進入詳細頁。
- [x] 所有新增 user-visible strings 都經由 `src/lib/i18n.ts`。
- [x] `npm run check` 通過。
- [x] `npm run build` 通過。
- [x] 以瀏覽器 smoke test 驗證 `/calendar?year=2026&month=5` 的桌面與行動版畫面沒有重疊；桌面與 390px mobile emulation 均無水平 overflow，workout links 無 overflow。
