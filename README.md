# 🇩🇪 Sprich Mal! — German Speaking Practice App

An AI-powered speaking practice app for German beginners (A1–A2 level).
Built with **FastAPI** + **Groq** + **Vanilla JS**.

---

## Project Structure

```
german-speaking-app/
├── main.py                   # Entry point — run this to start the server
├── requirements.txt
├── .env.example              # ← Copy to .env and add your Groq key
├── .gitignore
├── README.md
└── app/
    ├── config.py             # Settings loaded from .env via pydantic-settings
    ├── core.py               # FastAPI app factory
    ├── schemas.py            # Pydantic models (TopicResponse, VocabItem, A2GermanHelp)
    ├── services.py           # Groq API client (async)
    ├── api/
    │   ├── routes.py         # GET /api/topic
    │   └── views.py          # GET / (serves HTML)
    ├── static/
    │   ├── css/style.css     # Design system with dark/light tokens
    │   └── js/app.js         # Frontend state machine
    └── templates/
        └── index.html        # Jinja2 HTML template
```

---

## Setup

### 1. Get a free Groq API key

Sign up at [https://console.groq.com/keys](https://console.groq.com/keys) — free tier is generous.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
GROQ_API_KEY=gsk_your_actual_key_here
GROQ_MODEL=llama-3.3-70b-versatile   # or llama-3.1-8b-instant for faster responses
HOST=0.0.0.0
PORT=8000
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the server

```bash
python main.py
```

Or directly:

```bash
uvicorn main:app --reload
```

### 5. Open the app

Visit [http://localhost:8000](http://localhost:8000)

---

## Available Groq Models

| Model                      | Speed    | Quality  | Notes                    |
|----------------------------|----------|----------|--------------------------|
| `llama-3.3-70b-versatile`  | Fast     | ⭐⭐⭐⭐⭐ | Recommended default       |
| `llama-3.1-8b-instant`     | Fastest  | ⭐⭐⭐    | Best for low latency      |
| `mixtral-8x7b-32768`       | Fast     | ⭐⭐⭐⭐  | Good alternative          |

---

## API

| Method | Path         | Description                        |
|--------|--------------|------------------------------------|
| GET    | `/`          | Serves the single-page HTML app    |
| GET    | `/api/topic` | Returns a random topic as JSON     |
| GET    | `/docs`      | FastAPI Swagger UI                 |

---

## User Flow

1. Click **"Give me a topic"** → Groq generates a fresh topic
2. Topic appears with burst animation
3. **5-second prep countdown** — gather your thoughts
4. **60-second speaking timer** — speak in German!
5. **A2-level German support** reveals after the timer:
   - Topic summary in German
   - Vocabulary (German ↔ English)
   - Sentence starters
   - Example sentences
6. Click **"Try another topic"** to reset
