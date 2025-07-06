import streamlit as st
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from PIL import Image
from IPython.display import display
import time

# URL 입력
url = input("캡처할 사이트 URL을 입력하세요: ").strip()
img_path = "selenium_screenshot.png"

def capture_full_page(url, img_path="fullpage_screenshot.png"):
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--start-maximized")

    driver = webdriver.Chrome(options=chrome_options)
    driver.get(url)
    time.sleep(5)

    scroll_width = driver.execute_script("return document.body.scrollWidth")
    scroll_height = driver.execute_script("return document.body.scrollHeight")
    driver.set_window_size(scroll_width, scroll_height)
    time.sleep(1)

    driver.save_screenshot(img_path)
    print("전체 페이지 캡처 완료:", img_path)
    driver.quit()

# ✅ 캡처 실행
capture_full_page(url, img_path)

# 이미지 확인
im = Image.open(img_path)
display(im)
