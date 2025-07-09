import os
import requests
from openai import OpenAI

client = OpenAI(
    base_url="https://guest-api.sktax.chat/v1",
    api_key="sktax-XyeKFrq67ZjS4EpsDlrHHXV8it"
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
