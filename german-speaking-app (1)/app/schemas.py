from pydantic import BaseModel
from typing import List


class VocabItem(BaseModel):
    de: str
    en: str


class A2GermanHelp(BaseModel):
    summary: List[str]
    vocabulary: List[VocabItem]
    ideas: List[str]
    example: List[str]


class TopicResponse(BaseModel):
    topic_title: str
    topic_hint: str
    a2_german_help: A2GermanHelp
