import streamlit as st
import os
import torch
import numpy as np
from transformers import AutoTokenizer, AutoModelForCausalLM
from transformers import PreTrainedTokenizerFast, GPT2LMHeadModel

# 의도에 따른 응답 목록
intent_responses = {
    "인사": ["안녕하세요!", "반갑습니다!", "안녕하세요! 무엇을 도와드릴까요?"],
    "식당": ["어떤 종류의 음식을 원하세요?", "추천할 맛집이 여러 곳 있습니다.", "서울 근처 맛집을 찾아볼까요?"],
    "날씨": ["어떤 지역의 날씨가 궁금하신가요?", "오늘의 날씨는 어떤지 알고 싶으신가요?"],
    "뉴스": ["어떤 종류의 뉴스를 원하시나요?", "최근 뉴스가 궁금하신가요?"],
}

# 사용자 입력 받기
user_input = input("사용자: ")

# 프롬프트 설정
prompt = f"사용자의 질문: {user_input}\n의도는 무엇인가요?"

# 토크나이징 및 인코딩
input_ids = tokenizer.encode(prompt, return_tensors='pt')

# 모델 예측
model.eval()
with torch.no_grad():
    outputs = model.generate(input_ids, max_length=50)

# 예측 결과 디코딩
generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)

# 의도 파악
if "안녕" in generated_text:
    intent = "인사"
elif "식당" in generated_text:
    intent = "식당"
elif "날씨" in generated_text:
    intent = "날씨"
elif "뉴스" in generated_text:
    intent = "뉴스"
else:
    intent = "알 수 없음"

# 응답 선택
if intent in intent_responses:
    response = np.random.choice(intent_responses[intent])  # 무작위 응답 선택
    print("챗봇:", response)
else:
    print("챗봇: 제가 잘 이해하지 못했어요.")


# 챗봇 인터페이스 메인 함수
def main():
    st.title("테스트")
    st.caption("테스트입니다.")

    # 세션 상태 초기화
    if "messages" not in st.session_state:
        st.session_state.messages = []

    # 기존 메시지 출력
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    # 사용자 입력 처리
    if user_input := st.chat_input("질문을 입력하세요:"):
        # 사용자 메시지 출력
        st.chat_message("user").markdown(user_input)
        # 메시지 히스토리에 추가
        st.session_state.messages.append({"role": "user", "content": user_input})

        # 사용자 입력 처리
        response = process_input(user_input)  # process_input 함수 호출
        assistant_response = response

        # 챗봇 응답 출력
        with st.chat_message("assistant"):
            st.markdown(assistant_response)
        # 메시지 히스토리에 추가
        st.session_state.messages.append({"role": "assistant", "content": assistant_response})

if __name__ == "__main__":
    main()