const { chromium } = require('playwright');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  // 模拟现代主流 Android 手机（如 Redmi / 小米 / 荣耀 / OPPO）
  // 屏幕比例 20:9，分辨率 2400x1080，DPR = 2.8125
  // CSS 逻辑分辨率 = 853 x 384
  const context = await browser.newContext({
    viewport: { width: 853, height: 384 },
    deviceScaleFactor: 2.8,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');

  // 注入真实的 Android 系统栏与金刚键安全区环境变量
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-top', '32px');
    document.documentElement.style.setProperty('--safe-right', '72px');
    document.documentElement.style.setProperty('--safe-bottom', '0px');
    document.documentElement.style.setProperty('--safe-left', '0px');

    // 并且在右侧绘制一个真实的半透明/黑色金刚键模拟层，方便视觉直接对齐
    const navBar = document.createElement('div');
    navBar.id = 'sim-android-navbar';
    navBar.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 72px;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      border-left: 1px solid #333;
      z-index: 999999;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-around;
      color: #888;
      font-size: 18px;
    `;
    navBar.innerHTML = '<div>三</div><div>▢</div><div>◁</div>';
    document.body.appendChild(navBar);

    // 在顶部绘制一个真实的状态栏模拟层
    const statusBar = document.createElement('div');
    statusBar.id = 'sim-android-statusbar';
    statusBar.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 72px;
      height: 32px;
      background: rgba(0, 0, 0, 0.85);
      border-bottom: 1px solid #222;
      z-index: 999999;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      color: #aaa;
      font-size: 11px;
      font-family: sans-serif;
    `;
    statusBar.innerHTML = '<span>20:57</span><span>5G 📶 69%</span>';
    document.body.appendChild(statusBar);
  });

  // 上传两个视频
  const fileInputs = await page.$$('input[type="file"]');
  if (fileInputs.length >= 2) {
    await fileInputs[0].setInputFiles('/tmp/test1.mp4');
    await fileInputs[1].setInputFiles('/tmp/test2.mp4');
  }

  // 等待视频元数据与音频解码就绪
  await page.waitForTimeout(1500);

  // 截图 1：导入页
  await page.screenshot({ path: '/tmp/sim-01-import.png' });
  console.log('Saved /tmp/sim-01-import.png');

  // 点击「开始空间标定」
  const startBtn = await page.$('button:has-text("开始空间标定")');
  if (startBtn) {
    await startBtn.click();
    await page.waitForTimeout(500);
  }

  // 截图 2：视频1空间标定
  await page.screenshot({ path: '/tmp/sim-02-geo1.png' });
  console.log('Saved /tmp/sim-02-geo1.png');

  // 点击顶部导航条进入「04 视频1对拍」
  const step4Btn = await page.$('button:has-text("04")');
  if (step4Btn) {
    await step4Btn.click();
    await page.waitForTimeout(500);
  }

  // 截图 3：视频1对拍
  await page.screenshot({ path: '/tmp/sim-04-audio1.png' });
  console.log('Saved /tmp/sim-04-audio1.png');

  // 点击顶部导航条进入「06 对比台」
  const step6Btn = await page.$('button:has-text("06")');
  if (step6Btn) {
    await step6Btn.click();
    await page.waitForTimeout(500);
  }

  // 截图 4：对比台
  await page.screenshot({ path: '/tmp/sim-06-workbench.png' });
  console.log('Saved /tmp/sim-06-workbench.png');

  // 点击「导出片段」进入导出台
  const exportBtn = await page.$('button:has-text("导出片段")');
  if (exportBtn) {
    await exportBtn.click();
    await page.waitForTimeout(500);
  }

  // 截图 5：导出台
  await page.screenshot({ path: '/tmp/sim-07-export.png' });
  console.log('Saved /tmp/sim-07-export.png');

  await browser.close();
}

run().catch(console.error);
