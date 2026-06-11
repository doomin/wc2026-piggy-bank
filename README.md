# Piggy Bank 🐷⚽ — World Cup 2026 Edition

A shared 8-bit themed piggy bank app for the World Cup 2026. Players register, make a one-time coin donation, and appear on the contributors list. The total pot is always visible to everyone.

---

## Features

- **Guest view** — see the total coins in the bank and the contributors list at all times
- **Authentication** — register and log in with a username and password
- **One-time donation** — each player can deposit 1–10 coins (1 coin = €1) exactly once
- **Contributors table** — lists every player who has put coins in the bank
- **8-bit animations**
  - Coins arc into the piggy bank on deposit; piggy hops and smiles
  - A football rolls in from alternating sides every 30 seconds; piggy kicks it back
  - Occasionally the ball drops from the top of the screen and bonks the piggy, making her dizzy before she kicks it away
- **World Cup 2026 banner** with ⚽★ bunting and a football-pitch CSS background

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 · CSS3 (8-bit / NES style) · Vanilla JS |
| Font | Press Start 2P (Google Fonts) |
| Backend | Python 3.12 · Flask 3 · Flask-JWT-Extended · Flask-SQLAlchemy |
| Database | PostgreSQL via **Neon.tech** (prod) · SQLite (local dev) |
| Auth | JWT tokens · Werkzeug password hashing (pbkdf2:sha256) |
| Frontend hosting | **GitHub Pages** (via GitHub Actions) |
| Backend hosting | **Render.com** (free web service) |

---

## Project Structure

```
piggy_bank/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml   # Auto-deploys frontend to GitHub Pages
├── backend/
│   ├── app.py                 # Flask app — all API endpoints
│   ├── models.py              # SQLAlchemy models (User, Transaction)
│   ├── requirements.txt
│   └── render.yaml            # Render service definition
└── frontend/
    ├── index.html             # Single-page app
    ├── style.css              # 8-bit styling + animations
    ├── app.js                 # Auth, API calls, all animations
    └── assets/
        ├── piggy-idle.svg
        ├── piggy-happy.svg    # Shown on deposit
        ├── piggy-crying.svg   # Shown on withdrawal
        ├── piggy-kicking.svg  # Shown when kicking the football
        ├── piggy-dizzy.svg    # Shown after ball drops on head
        └── football.svg
```

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/register` | None | Register a new user |
| POST | `/api/login` | None | Returns a JWT token |
| GET | `/api/total` | None | Total coins across all users |
| GET | `/api/leaderboard` | None | List of users with balance > 0 |
| GET | `/api/me` | JWT | Current user's username, balance, donation status |
| POST | `/api/deposit` | JWT | Add 1–10 coins (one-time only) |

---

## Local Development

### Backend

```bash
cd piggy_bank/backend
pip install -r requirements.txt
flask run
# API available at http://127.0.0.1:5000
```

### Frontend

```bash
cd piggy_bank/frontend
python -m http.server 8080
# Open http://localhost:8080
```

The frontend `API_BASE` in `app.js` points to `http://127.0.0.1:5000` for local dev.

---

## Deployment

### 1. Database — Neon.tech (free PostgreSQL)

1. Sign up at [neon.tech](https://neon.tech) and create a project
2. Copy the connection string (format: `postgresql://user:pass@host/db?sslmode=require`)
3. Add it as the `DATABASE_URL` environment variable on Render (see step below)

### 2. Backend — Render.com

1. Sign up at [render.com](https://render.com) and connect your GitHub repo
2. **New → Web Service** → set Root Directory to `piggy_bank/backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`
5. Add environment variables:
   - `DATABASE_URL` — Neon connection string from step 1
   - `JWT_SECRET_KEY` — any long random string
6. Deploy → note your service URL, e.g. `https://wc2026-piggy-bank.onrender.com`
7. Update `allowed_origins` in `backend/app.py` to include your GitHub Pages URL

> The free tier spins down after 15 min of inactivity; the first request after sleep takes ~30 s.

### 3. Frontend — GitHub Pages

1. Update `API_BASE` in `frontend/app.js` to your Render service URL
2. In your GitHub repo → **Settings → Pages → Source → GitHub Actions**
3. Push to `main` — the workflow in `.github/workflows/deploy-pages.yml` deploys automatically
4. Site is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`

To redeploy manually: **Actions → Deploy Frontend to GitHub Pages → Run workflow**.

---

## Database Management (Production)

Use the **Shell** tab on your Render service to run commands against the live database:

```bash
# View all users
python - <<'EOF'
from app import app, db
from models import User
with app.app_context():
    for u in db.session.execute(db.select(User)).scalars():
        print(f"{u.username} | balance: {u.balance}")
EOF

# Wipe all data
python - <<'EOF'
from app import app, db
from models import User, Transaction
with app.app_context():
    db.session.execute(db.delete(Transaction))
    db.session.execute(db.delete(User))
    db.session.commit()
    print("Done")
EOF
```
