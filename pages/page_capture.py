import streamlit as st
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from PIL import Image
import time

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
    driver.quit()
    return img_path

st.title("전체 페이지 스크린샷 테스트")

url = st.text_input("캡처할 사이트 URL을 입력하세요")

if st.button("캡처 실행") and url:
    img_path = capture_full_page(url)
    st.image(img_path)
    st.success(f"캡처 완료! 파일명: {img_path}")
