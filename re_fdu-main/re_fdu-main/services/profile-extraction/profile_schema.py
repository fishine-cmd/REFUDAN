# profile_schema.py

from typing import List, Dict, Optional
from datetime import datetime
import requests
from pydantic import BaseModel, HttpUrl, validator

# -----------------------------
# 1️⃣ 用户 Profile 数据结构
# -----------------------------

class Achievement(BaseModel):
    title: str
    description: Optional[str] = None
    date: Optional[datetime] = None

class SocialAccounts(BaseModel):
    xiaohongshu: Optional[str] = None
    github: Optional[str] = None
    wechat_public: Optional[str] = None
    wechat: Optional[str] = None
    linkedin: Optional[str] = None

class Profile(BaseModel):
    # 基础信息
    user_id: str
    name: str
    avatar_url: Optional[HttpUrl] = None
    gender: Optional[str] = None  # 男/女/其他
    birth_year: Optional[int] = None
    enrollment_year: Optional[int] = None
    major: Optional[str] = None
    grade: Optional[str] = None

    # 教育与发展目标
    career_goal: Optional[str] = None
    target_industry: Optional[str] = None
    skills: List[str] = []
    languages: List[str] = []

    # 兴趣与个性
    interests: List[str] = []
    personality_traits: List[str] = []
    hobbies: List[str] = []

    # 外部账号与数字身份
    social_accounts: SocialAccounts = SocialAccounts()
    second_me_id: Optional[str] = None

    # 履历与成就
    resume_file: Optional[str] = None
    achievements: List[Achievement] = []

    # 匹配相关指标
    similarity_score: Optional[float] = 0.0
    access_count: Optional[int] = 0
    last_update: Optional[datetime] = datetime.utcnow()

    @validator("gender")
    def check_gender(cls, v):
        allowed = {"男", "女", "其他", None}
        if v not in allowed:
            raise ValueError(f"gender must be one of {allowed}")
        return v

# -----------------------------
# 2️⃣ Second Me API 接入示例
# -----------------------------

class SecondMeClient:
    """Second Me OAuth2 + API client"""
    def __init__(self, access_token: str, base_url: str = "https://api.second.me/v1"):
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    def get_profile(self) -> dict:
        """获取用户在 Second Me 平台的 profile"""
        url = f"{self.base_url}/users/me"
        resp = requests.get(url, headers=self.headers)
        resp.raise_for_status()
        return resp.json()

    def update_profile(self, profile: Profile) -> dict:
        """上传或更新用户 profile"""
        url = f"{self.base_url}/users/me/profile"
        payload = {
            "resume_url": profile.resume_file,
            "social_accounts": profile.social_accounts.dict(),
            "skills": profile.skills,
            "interests": profile.interests,
        }
        resp = requests.post(url, headers=self.headers, json=payload)
        resp.raise_for_status()
        return resp.json()

    def get_embedding(self) -> dict:
        """获取向量化 embedding，用于匹配"""
        url = f"{self.base_url}/users/me/embedding"
        resp = requests.get(url, headers=self.headers)
        resp.raise_for_status()
        return resp.json()

# -----------------------------
# 3️⃣ 示例使用
# -----------------------------

def example_usage():
    # 初始化 profile
    profile = Profile(
        user_id="U123456",
        name="张三",
        major="计算机科学与技术",
        grade="大三",
        career_goal="保研",
        skills=["Python", "机器学习"],
        interests=["AI", "开源"]
    )

    # 初始化 Second Me client
    access_token = "<YOUR_SECOND_ME_ACCESS_TOKEN>"
    client = SecondMeClient(access_token=access_token)

    # 获取 profile
    try:
        sm_profile = client.get_profile()
        print("Second Me 原始 profile:", sm_profile)
    except Exception as e:
        print("获取 Second Me profile 失败:", e)

    # 上传/更新 profile
    try:
        resp = client.update_profile(profile)
        print("Second Me 更新结果:", resp)
    except Exception as e:
        print("更新 profile 失败:", e)

    # 获取 embedding
    try:
        embedding = client.get_embedding()
        print("Second Me embedding:", embedding)
    except Exception as e:
        print("获取 embedding 失败:", e)

# 运行示例
if __name__ == "__main__":
    example_usage()