#!/usr/bin/env python3

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit


def request(origin: str, path: str, payload: dict[str, str]) -> tuple[int, dict]:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        origin + path,
        data=body,
        headers={"Content-Type": "application/json", "Origin": origin},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


setup_url = Path(".preview-setup-url").read_text().strip()
parts = urlsplit(setup_url)
origin = f"{parts.scheme}://{parts.netloc}"
token = parts.fragment.removeprefix("token=")
mode = sys.argv[1]

if mode == "legacy-setup":
    status, body = request(origin, "/api/setup", {
        "token": token,
        "name": "Legacy Admin",
        "email": "legacy@example.com",
        "password": "correct horse battery",
    })
    assert status == 201 and body == {"status": "complete"}, (status, body)
elif mode == "legacy-login":
    status, body = request(origin, "/api/auth/login", {
        "email": "legacy@example.com",
        "password": "correct horse battery",
    })
    assert status == 200 and body["user"]["email"] == "legacy@example.com", (status, body)
elif mode == "new-setup":
    status, body = request(origin, "/api/setup", {
        "token": token,
        "name": "Admin",
        "email": "admin@example.com",
        "password": "Admin1!x",
    })
    assert status == 201 and body == {"status": "complete"}, (status, body)
elif mode == "invalid-login":
    status, body = request(origin, "/api/auth/login", {
        "email": "admin@example.com",
        "password": "",
    })
    fields = body.get("errors", [])
    assert status == 422 and {"pointer": "/password", "code": "invalid_login_password"} in fields, (status, body)
elif mode == "invalid-setup":
    invalid = [
        "Aa1!xxx",
        "aa1!xxxx",
        "AA1!XXXX",
        "Aax!xxxx",
        "Aa1xxxxx",
        "aá1!xxxx",
        "AÁ1!XXXX",
        "Aa１!xxxx",
        "Aa1！xxxx",
    ]
    for password in invalid:
        status, body = request(origin, "/api/setup", {
            "token": token,
            "name": "Admin",
            "email": "admin@example.com",
            "password": password,
        })
        fields = body.get("errors", [])
        assert status == 422 and {"pointer": "/password", "code": "invalid_password"} in fields, (password, status, body)
else:
    raise SystemExit(f"unknown mode: {mode}")
