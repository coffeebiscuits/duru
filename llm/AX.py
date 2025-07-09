import os
import requests
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get('sktax_api_key')
client = OpenAI(
    base_url="https://guest-api.sktax.chat/v1",
    api_key=sktax_api_key
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
