"""Point the app at throwaway storage before any interview_prep module is imported."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="interview-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/app.db"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-bytes-long"
