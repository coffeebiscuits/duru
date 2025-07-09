import os
import requests
from openai import OpenAI
from dotenv import load_dotenv


# 미스트랄 API 설정
load_dotenv()
Mistral_api_key = os.environ.get('Mistral_api_key')
client = Mistral(api_key=Mistral_api_key)


load_dotenv()
api_key = os.environ.get('AX_api_key')
client = OpenAI(
    base_url="https://guest-api.sktax.chat/v1",
    api_key=AX_api_key
)

def get_chat_response(user_input):
    messages = [
        {"role": "system", "content": "당신은 증권전문가입니다."},
        {"role": "user", "content": user_input}
    ]
    completion = client.chat.completions.create(
        model="ax4",
        messages=messages
    )
    return completion.choices[0].message.content
