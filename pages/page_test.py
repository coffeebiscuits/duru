import streamlit as st
import datetime
from streamlit_autorefresh import st_autorefresh

count = st_autorefresh(interval=1000, limit=None, key="auto_refresh")

now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
st.write(f"현재 시간: {now}")
st.write("테스트 글자입니다.")
