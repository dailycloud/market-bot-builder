import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

BASE_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = Path(__file__).resolve().parent / "static"
CONTENT_FILE = BASE_DIR / "database" / "content.json"
INVENTORY_FILE = BASE_DIR / "database" / "inventory.json"

DEFAULT_CONTENT = {
    "menu_title": "Menu",
    "labels": {
        "back": "Back",
        "home": "Home",
        "price": "Price",
        "back_order": 10000,
        "home_order": 10001,
        "back_row": None,
        "home_row": None,
    },
    "sections": [],
}
DEFAULT_INVENTORY = {
    "items": {},
}


def load_content():
    if CONTENT_FILE.exists():
        try:
            return json.loads(CONTENT_FILE.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError:
            return dict(DEFAULT_CONTENT)
    return dict(DEFAULT_CONTENT)


def save_content(data):
    CONTENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONTENT_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CONTENT_FILE)


def load_inventory():
    if INVENTORY_FILE.exists():
        try:
            data = json.loads(INVENTORY_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return dict(DEFAULT_INVENTORY)
    else:
        return dict(DEFAULT_INVENTORY)

    if not isinstance(data, dict):
        return dict(DEFAULT_INVENTORY)
    if "items" not in data or not isinstance(data["items"], dict):
        data["items"] = {}
    return data


def save_inventory(data):
    INVENTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = INVENTORY_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(INVENTORY_FILE)


class MenuBuilderHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/content":
            return self._send_json(load_content())
        if parsed.path == "/api/inventory":
            return self._send_json(load_inventory())
        if parsed.path.startswith("/files/"):
            rel_path = unquote(parsed.path[len("/files/") :])
            return self._send_project_file(rel_path)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/api/content", "/api/inventory"):
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Root must be an object")
        except Exception:
            self.send_error(400, "Invalid JSON")
            return

        if parsed.path == "/api/content":
            save_content(payload)
            return self._send_json({"ok": True})

        if "items" not in payload or not isinstance(payload["items"], dict):
            payload["items"] = {}
        save_inventory(payload)
        self._send_json({"ok": True})

    def _send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_project_file(self, rel_path):
        rel_path = rel_path.lstrip("/\\")
        target = (BASE_DIR / rel_path).resolve()
        try:
            target.relative_to(BASE_DIR)
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        if not target.exists() or not target.is_file():
            self.send_error(404, "Not found")
            return

        content_type = self.guess_type(str(target))
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(target.stat().st_size))
        self.end_headers()
        with target.open("rb") as handle:
            self.wfile.write(handle.read())


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8008), MenuBuilderHandler)
    print("Menu builder is running at http://127.0.0.1:8008")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
