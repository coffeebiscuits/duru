import os
import requests
from openai import OpenAI

client = OpenAI(
    base_url="https://guest-api.sktax.chat/v1",
    api_key="sktax-XyeKFrq67ZjS4EpsDlrHHXV8it"
)

completion = client.chat.completions.create(
    model="ax4",
    messages=[
        {"role": "system", "content": "당신은 증권전문가입니다."},
        {"role": "user", "content": "코스피에 대해 알려주세요."}
    ]
)

print(completion)
