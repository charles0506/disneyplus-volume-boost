# Disney+ 音量增強

Disney+ 網頁版音量偏小，這支 userscript 把播放音量放大（100%~600%，預設 250%），
並接壓縮器防止爆音、拉近對白和爆炸聲的音量差。

安裝：https://raw.githubusercontent.com/charles0506/disneyplus-volume-boost/main/disneyplus-volume-boost.user.js

操作（播放時右上角小膠囊）：

- 點一下：開／關增強
- 滾輪 或 Alt+↑ / Alt+↓：每次 ±25%
- Alt+0：開／關

若瀏覽器對 DRM 影片的 Web Audio 只輸出靜音，腳本偵測到後會自動停用並重新整理；
之後點膠囊可重新啟用。
