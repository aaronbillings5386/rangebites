from playwright.sync_api import sync_playwright
import os
os.makedirs("/workspace/food-radar-app/shot", exist_ok=True)
url = "http://127.0.0.1:8765/?shot=1&layout=1"
with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path="/usr/bin/google-chrome",
        args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    )
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.goto(url, wait_until="domcontentloaded", timeout=20000)
    page.wait_for_timeout(1200)
    page.evaluate(
        """() => {
      const b = document.getElementById('dealClose');
      if (b) b.click(); window.scrollTo(0,0);
      document.getElementById('onboarding')?.classList.remove('open');
    }"""
    )
    page.wait_for_timeout(400)
    page.screenshot(path="/workspace/food-radar-app/shot/after-phone.png", full_page=False)
    print("phone", os.path.getsize("/workspace/food-radar-app/shot/after-phone.png"))
    page.close()

    desk = browser.new_page(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
    desk.goto(url, wait_until="domcontentloaded", timeout=20000)
    desk.wait_for_timeout(1200)
    desk.evaluate(
        """() => {
      const b = document.getElementById('dealClose');
      if (b) b.click(); window.scrollTo(0,0);
    }"""
    )
    desk.wait_for_timeout(400)
    desk.screenshot(path="/workspace/food-radar-app/shot/after-desktop.png", full_page=False)
    print("desktop", os.path.getsize("/workspace/food-radar-app/shot/after-desktop.png"))
    desk.close()
    browser.close()
print("ok")
