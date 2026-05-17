import json
from groq import AsyncGroq
from app.config import get_settings
from app.schemas import TopicResponse

SYSTEM_PROMPT = """You are a friendly German language teacher helping absolute beginners (A1–A2 level).
Your job is to generate a single everyday speaking topic and A2-level German support content.

ALWAYS respond with ONLY a valid JSON object — no markdown fences, no explanation, no preamble.

The JSON must follow this exact schema:
{
  "topic_title": "string (German topic name, e.g. 'Mein Hobby')",
  "topic_hint": "string (English hint describing what to talk about, 1–2 sentences)",
  "a2_german_help": {
    "summary": ["string", "string"],
    "vocabulary": [{"de": "string", "en": "string"}],
    "ideas": ["string", "string", "string"],
    "example": ["string", "string"]
  }
}

Rules:
- topic_title: A short German phrase (2–4 words max)
- topic_hint: In English, friendly and beginner-safe
- summary: 2 short German sentences describing the topic
- vocabulary: 6–8 practical words/phrases relevant to the topic
- ideas: 3–5 simple German sentence starters the learner could use
- example: 5-6 complete example sentences in simple German
- Keep everything simple, natural, and confidence-building
- Vary the topic randomly; do NOT repeat the same topic every time"""

USER_PROMPT = """Give me one random everyday German speaking topic with A2-level support.
Pick from topics like: family, food, hobbies, home, daily routine, weather, shopping, travel, school, work, friends, pets, sports, music, or any other beginner-friendly theme.
Make it different from the most common ones. Respond only with the JSON object."""


async def fetch_topic() -> TopicResponse:
    """Call the Groq API and return a parsed TopicResponse."""
    settings = get_settings()

    client = AsyncGroq(api_key=settings.groq_api_key)
    completion = await client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": USER_PROMPT},
        ],
        temperature=0.9,       # Higher = more topic variety
        max_tokens=1000,
        response_format={"type": "json_object"},  # Groq JSON mode — no fence stripping needed
    )

    raw_text = completion.choices[0].message.content.strip()
    parsed = json.loads(raw_text)
    return TopicResponse(**parsed)
