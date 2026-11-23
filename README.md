# 3D 滑雪／單板教學

互動 3D 教學工具（Three.js r128＋glTF 骨架人體模型），用嚟理解滑雪同單板動作背後嘅生物力學。

| 頁面 | 內容 |
|---|---|
| [`ski/`](ski/) | 犁式、平行、Carving、蘑菇、短彎、Pivot slip、斜滑降＋Garland、提內腳 drill |
| [`snowboard/`](snowboard/) | Side slip、斜滑降＋Garland、Skid、動態、Carving、極限低 Carve、Ollie／Nollie、Butter、Switch |

## 功能

- **簡易／詳細模式**：預設簡易，只顯示 CoM 同受力 edge；詳細模式先開肌肉、力線、數字
- **正確 vs 錯誤**：左右分屏同步播放，正確同揀咗嘅錯誤站位並排對比
- **睇之前諗一諗**：每個動作有 2 條引導問題（可以睇答案）、一句重點、一句「雪上點練」；播完第一個循環會彈出重點

- 360° 拖動／縮放，多個預設鏡頭
- 肌肉發力熱圖，自動判斷向心（縮短發力）／離心（拉長對抗）／等長（固定撐住）
- CoM 軌跡、GRF 力線、傾斜角弧、受力 edge
- 腳掌壓力中心（CoP）同前後／左右重量分配
- 可調身高、板長、sidecut R、坡度、速度；用 `tan θ = v²/(g·r)` 同 `r = R·cos(edge)` 計傾斜同彎半徑
- 站位錯誤模擬（坐後、太前、屈腰、上身帶轉等）
- 鳥瞰圖：成個動作由開始到完嘅 CoM 路線（按階段上色）、板痕、板方向，㩒地圖可以跳去該時刻

## 本地執行

純靜態檔案，冇 build step：

```bash
npx serve .
```

## 部署（GitHub Pages）

Settings → Pages → Source 揀 **Deploy from a branch** → `main` / `(root)`。

## 第三方素材

人體模型 `xbot.json` 由 [three.js examples](https://github.com/mrdoob/three.js/tree/r128/examples/models/gltf) 嘅 `Xbot.glb`（Mixamo 角色）轉換而成，已移除動畫。

## 免責

肌肉發力係根據生物力學原理整嘅示意模型（相對值），唔係實測 EMG；動作係程序生成嘅理想化示範。
