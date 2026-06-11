import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token,
    jwt_required, get_jwt_identity
)
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, User, Transaction

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "sqlite:///piggy_bank.db"
).replace("postgres://", "postgresql://")   # Render uses old-style URI
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "dev-secret-change-me")

db.init_app(app)
jwt = JWTManager(app)

# Allow GitHub Pages origin + localhost for dev
allowed_origins = [
    "https://dominikpszczola.github.io",  # update to your GH Pages URL
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "null",   # file:// origin when opening index.html directly
]
CORS(app, resources={r"/api/*": {"origins": allowed_origins}},
     supports_credentials=True)

with app.app_context():
    db.create_all()


# ── Helpers ───────────────────────────────────────────────────────────────────
def _validate_amount(data):
    """Return (amount_int, error_str). error_str is None on success."""
    raw = data.get("amount")
    if raw is None:
        return None, "amount is required"
    if not isinstance(raw, int) or isinstance(raw, bool):
        return None, "amount must be an integer"
    if raw < 1 or raw > 10:
        return None, "amount must be between 1 and 10"
    return raw, None


# ── Auth endpoints ────────────────────────────────────────────────────────────
@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username and password required"}), 400
    if len(username) > 32:
        return jsonify({"error": "username too long (max 32)"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username already taken"}), 409

    user = User(
        username=username,
        password_hash=generate_password_hash(password),
    )
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "username": user.username, "balance": user.balance}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "invalid credentials"}), 401

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "username": user.username, "balance": user.balance})


# ── Public endpoints ──────────────────────────────────────────────────────────
@app.route("/api/total", methods=["GET"])
def total():
    from sqlalchemy import func
    result = db.session.query(func.sum(User.balance)).scalar() or 0
    return jsonify({"total": result})


@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    users = (
        User.query
        .filter(User.balance > 0)
        .order_by(User.balance.desc())
        .all()
    )
    return jsonify([{"username": u.username, "balance": u.balance} for u in users])


# ── Authenticated endpoints ───────────────────────────────────────────────────
@app.route("/api/me", methods=["GET"])
@jwt_required()
def me():
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({"error": "user not found"}), 404
    return jsonify({"username": user.username, "balance": user.balance, "has_donated": user.balance > 0})


@app.route("/api/deposit", methods=["POST"])
@jwt_required()
def deposit():
    data = request.get_json(silent=True) or {}
    amount, err = _validate_amount(data)
    if err:
        return jsonify({"error": err}), 400

    user = User.query.get(int(get_jwt_identity()))
    if user.balance > 0:
        return jsonify({"error": "already donated"}), 409

    user.balance += amount
    db.session.add(Transaction(user_id=user.id, amount=amount))
    db.session.commit()
    return jsonify({"balance": user.balance, "deposited": amount})
    return jsonify({"balance": user.balance, "withdrawn": amount})


if __name__ == "__main__":
    app.run(debug=True)
