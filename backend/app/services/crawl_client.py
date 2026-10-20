"""Authenticated HTTP client for Codyssey mission pages."""

import os
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

BASE_URL = "https://adm.codyssey.kr"
USER_ID = os.getenv("CODYSSEY_ID", "").strip()
USER_PW = os.getenv("CODYSSEY_PW", "").strip()
COOKIE = os.getenv("CODYSSEY_COOKIE", "").strip()

AUTH_URL = os.getenv("CODYSSEY_AUTH_URL", "https://api.ams.codyssey.kr/authenticate")
LOGIN_PAGE_URL = "https://codyssey.kr/"
LOGIN_ID_FIELD = os.getenv("CODYSSEY_ID_FIELD", "userId")
LOGIN_PW_FIELD = os.getenv("CODYSSEY_PW_FIELD", "password")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
    "Accept": "text/plain, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
}

# ============================================================
def fix_encoding(response):
    if not response.encoding or response.encoding.lower() == "iso-8859-1":
        response.encoding = "utf-8"
    return response

def use_login():
    return bool(USER_ID and USER_PW)

def find_token(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str) and "token" in k.lower() and "refresh" not in k.lower():
                return v
        for v in obj.values():
            found = find_token(v)
            if found:
                return found
    return None

def visit(session, url, max_hops=8):
    for _ in range(max_hops):
        response = session.get(url, headers=HEADERS, timeout=15, allow_redirects=False)
        location = response.headers.get("Location")
        if response.status_code in (301, 302, 303, 307, 308) and location:
            url = urljoin(url, location)
            parsed = urlparse(url)
            if parsed.scheme == "https" and parsed.port == 80:
                url = parsed._replace(netloc=parsed.hostname).geturl()
            continue
        break
    return response

class FixedSession(requests.Session):
    def get_redirect_target(self, resp):
        url = super().get_redirect_target(resp)
        if url:
            try:
                parsed = urlparse(url)
                if parsed.scheme == "https" and parsed.port == 80:
                    url = parsed._replace(netloc=parsed.hostname).geturl()
            except ValueError:
                pass
        return url

def get_cookie(session, name):
    for cookie in session.cookies:
        if cookie.name == name:
            return cookie.value
    return None

def login(session):
    payload = {LOGIN_ID_FIELD: USER_ID, LOGIN_PW_FIELD: USER_PW}
    headers = {
        **HEADERS,
        "Origin": f"{urlparse(LOGIN_PAGE_URL).scheme}://{urlparse(LOGIN_PAGE_URL).netloc}",
        "Referer": LOGIN_PAGE_URL,
    }

    parsed_auth = urlparse(AUTH_URL)
    for warm_url in (LOGIN_PAGE_URL, f"{parsed_auth.scheme}://{parsed_auth.netloc}/"):
        try:
            session.get(warm_url, headers={"User-Agent": HEADERS["User-Agent"]}, timeout=15)
        except requests.RequestException:
            pass
        if get_cookie(session, "XSRF-TOKEN"):
            break

    xsrf = get_cookie(session, "XSRF-TOKEN")
    if xsrf:
        headers["X-XSRF-TOKEN"] = xsrf
    headers["X-Requested-With"] = "XMLHttpRequest"

    response = session.post(AUTH_URL, data=payload, headers=headers, timeout=15, allow_redirects=False)
    if response.status_code in (400, 415):
        response = session.post(AUTH_URL, json=payload, headers=headers, timeout=15, allow_redirects=False)

    if response.status_code >= 400:
        raise RuntimeError(f"로그인 실패 (상태코드: {response.status_code})")

    try:
        body = response.json()
    except ValueError:
        body = None

    token = find_token(body) if body else None
    if token:
        session.headers["Authorization"] = f"Bearer {token}"

    visit(session, BASE_URL)
    latest_xsrf = get_cookie(session, "XSRF-TOKEN")
    if latest_xsrf:
        session.headers["X-XSRF-TOKEN"] = latest_xsrf

def make_session():
    session = FixedSession()
    if use_login():
        login(session)
    elif COOKIE:
        session.headers.update({"Cookie": COOKIE})
    else:
        raise RuntimeError("로그인 정보가 없습니다 (.env 파일을 확인해주세요).")
    return session

def fetch_html(session, mission):
    url = f"{BASE_URL}/project/projectDetail/uqstnDetail"
    params = {
        "projectNo": mission["project_no"],
        "lcorsNo": mission["lcors_no"],
        "uqstnNo": mission["uqstn_no"],
    }
    headers = {**HEADERS, "Referer": f"{BASE_URL}/project/projectDetail?projectNo={mission['project_no']}"}
    response = session.get(url, params=params, headers=headers, timeout=15)
    response.raise_for_status()
    return fix_encoding(response).text


def fetch_with_retry(session, mission, parser_func):
    try:
        return parser_func(fetch_html(session, mission), mission)
    except RuntimeError as error:
        if not use_login() or "데이터 영역" not in str(error):
            raise
        login(session)
        return parser_func(fetch_html(session, mission), mission)
