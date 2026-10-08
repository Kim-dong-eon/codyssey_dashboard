import os
import re
import io
import csv
import sys
import json
import time
import random
import glob
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ============================================================
# 기본 및 경로 설정 (백엔드 temp_data 폴더 강제 지정)
# ============================================================

BASE_URL = "https://adm.codyssey.kr"
KST = ZoneInfo("Asia/Seoul")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(BASE_DIR, "temp_data")

os.makedirs(TEMP_DIR, exist_ok=True)
PROGRESS_DIR = TEMP_DIR

# ------------------------------------------------------------
# 로그인 방식 설정
# ------------------------------------------------------------
USER_ID = os.getenv("CODYSSEY_ID", "").strip()
USER_PW = os.getenv("CODYSSEY_PW", "").strip()
COOKIE = os.getenv("CODYSSEY_COOKIE", "").strip()

AUTH_URL = os.getenv("CODYSSEY_AUTH_URL", "https://api.ams.codyssey.kr/authenticate")
LOGIN_PAGE_URL = "https://codyssey.kr/"
LOGIN_ID_FIELD = os.getenv("CODYSSEY_ID_FIELD", "userId")
LOGIN_PW_FIELD = os.getenv("CODYSSEY_PW_FIELD", "password")

# ------------------------------------------------------------
# 학습 진도 다운로드 설정
# ------------------------------------------------------------
PROGRESS_PROJECTS = [
    {"level": 1, "project_no": "144003"},
    {"level": 2, "project_no": "144002"},
    {"level": 3, "project_no": "144001"},
]
INST_CD = os.getenv("CODYSSEY_INST_CD", "00028")
PROGRESS_PAGE_SIZE = os.getenv("CODYSSEY_PROGRESS_PAGE_SIZE", "10000")

MISSIONS = [
    {"label": "1-1", "project_no": "144003", "lcors_no": "1129006", "uqstn_no": "186003"},
    {"label": "1-2", "project_no": "144003", "lcors_no": "1129006", "uqstn_no": "186004"},
    {"label": "1-3", "project_no": "144003", "lcors_no": "1129006", "uqstn_no": "186005"},
    {"label": "2-1", "project_no": "144002", "lcors_no": "1129004", "uqstn_no": "188029"},
    {"label": "2-2", "project_no": "144002", "lcors_no": "1129004", "uqstn_no": "188030"},
    {"label": "2-3", "project_no": "144002", "lcors_no": "1129004", "uqstn_no": "188031"},
    {"label": "Final Project", "project_no": "144001", "lcors_no": "1129002", "uqstn_no": "188037"},
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
    "Accept": "text/plain, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
}

# ============================================================
# 유틸리티
# ============================================================

def log(message):
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] {message}", flush=True)

def normalize_date(raw_date):
    if not raw_date:
        return None
    match = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{2})", raw_date)
    if not match:
        return raw_date
    year, month, day = match.groups()
    return f"20{year}-{month}-{day}"

def normalize_status(raw):
    if not raw: return "알 수 없음"
    text = raw.replace(" ", "")
    if text == "미션완료": return "미션 완료"
    if text == "승인대기": return "승인 대기"
    if text == "미션시작": return "미션 시작"
    if text == "팀셋팅완료": return "팀 셋팅 중"
    return raw

# ============================================================
# 임시 데이터 초기화 (신규 추가)
# ============================================================
def clear_temp_files():
    """크롤링 시작 전 temp_data 폴더의 기존 찌꺼기 파일들을 모두 삭제합니다."""
    old_files = glob.glob(os.path.join(TEMP_DIR, "*.csv")) + glob.glob(os.path.join(TEMP_DIR, "*.json"))
    if old_files:
        log("이전 임시 데이터 파일 삭제 중...")
        for file_path in old_files:
            try:
                os.remove(file_path)
            except OSError as e:
                log(f"파일 삭제 실패: {file_path} - {e}")
        log(f"총 {len(old_files)}개의 이전 파일 삭제 완료.")

# ============================================================
# 웹 스크래핑 및 로그인 처리 로직
# ============================================================

def fix_encoding(response):
    if not response.encoding or response.encoding.lower() == "iso-8859-1":
        response.encoding = "utf-8"
    return response

def fetch_html(session, mission):
    url = f"{BASE_URL}/project/projectDetail/uqstnDetail"
    params = {"projectNo": mission["project_no"], "lcorsNo": mission["lcors_no"], "uqstnNo": mission["uqstn_no"]}
    headers = {**HEADERS, "Referer": f"{BASE_URL}/project/projectDetail?projectNo={mission['project_no']}"}
    response = session.get(url, params=params, headers=headers, timeout=15)
    response.raise_for_status()
    return fix_encoding(response).text

def get_completion_date(team_element):
    title = team_element.select_one("strong.tit")
    if not title: return None
    match = re.search(r"\b\d{2}\.\d{2}\.\d{2}\b", title.get_text(" ", strip=True))
    return normalize_date(match.group(0)) if match else None

def parse_mission(html, mission):
    soup = BeautifulSoup(html, "html.parser")
    card = soup.select_one(".card.uqstn")
    if not card: raise RuntimeError("미션 데이터 영역을 찾지 못했습니다.")

    teams, errors = [], []
    for index, team_element in enumerate(soup.select('ul[id^="misTeamList_"] > li'), start=1):
        try:
            name_element = team_element.select_one(".ti")
            if not name_element: continue

            team_sn = name_element.get("data-teamsn")
            team_name = name_element.get_text(strip=True)
            status_element = team_element.select_one(".iSt2")
            status = status_element.get_text(strip=True) if status_element else None

            completion_date = get_completion_date(team_element) if status == "미션완료" else None

            members = [{
                "member_id": m.get("data-mbr-id"),
                "name": m.get("data-mbr-nm"),
                "email": m.get("data-eml-addr"),
                "leader": m.get("data-leadr-yn") == "Y",
            } for m in team_element.select(".btnMisTeamDetail")]

            teams.append({
                "team_sn": team_sn, "team_name": team_name, "status": normalize_status(status),
                "completion_date": completion_date, "member_count": len(members), "members": members,
            })
        except Exception as error:
            errors.append({"type": "TEAM_PARSE_ERROR", "team_index": index, "reason": str(error)})

    return {
        "label": mission["label"], "project_no": mission["project_no"],
        "lcors_no": mission["lcors_no"], "uqstn_no": mission["uqstn_no"],
        "mission_name": card.get("data-nm"), "team_count": len(teams),
        "error_count": len(errors), "errors": errors, "teams": teams,
    }

def use_login(): return bool(USER_ID and USER_PW)

def find_token(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str) and "token" in k.lower() and "refresh" not in k.lower(): return v
        for v in obj.values():
            found = find_token(v)
            if found: return found
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
            except ValueError: pass
        return url

def get_cookie(session, name):
    for cookie in session.cookies:
        if cookie.name == name: return cookie.value
    return None

def login(session):
    payload = {LOGIN_ID_FIELD: USER_ID, LOGIN_PW_FIELD: USER_PW}
    headers = {**HEADERS, "Origin": f"{urlparse(LOGIN_PAGE_URL).scheme}://{urlparse(LOGIN_PAGE_URL).netloc}", "Referer": LOGIN_PAGE_URL}

    parsed_auth = urlparse(AUTH_URL)
    for warm_url in (LOGIN_PAGE_URL, f"{parsed_auth.scheme}://{parsed_auth.netloc}/"):
        try: session.get(warm_url, headers={"User-Agent": HEADERS["User-Agent"]}, timeout=15)
        except requests.RequestException: pass
        if get_cookie(session, "XSRF-TOKEN"): break

    xsrf = get_cookie(session, "XSRF-TOKEN")
    if xsrf: headers["X-XSRF-TOKEN"] = xsrf
    headers["X-Requested-With"] = "XMLHttpRequest"

    response = session.post(AUTH_URL, data=payload, headers=headers, timeout=15, allow_redirects=False)
    if response.status_code in (400, 415):
        response = session.post(AUTH_URL, json=payload, headers=headers, timeout=15, allow_redirects=False)

    if response.status_code >= 400: raise RuntimeError(f"로그인 실패 (상태코드: {response.status_code})")
    
    try: body = response.json()
    except ValueError: body = None

    token = find_token(body) if body else None
    if token: session.headers["Authorization"] = f"Bearer {token}"

    visit(session, BASE_URL)
    latest_xsrf = get_cookie(session, "XSRF-TOKEN")
    if latest_xsrf: session.headers["X-XSRF-TOKEN"] = latest_xsrf

def make_session():
    session = FixedSession()
    if use_login(): login(session)
    elif COOKIE: session.headers.update({"Cookie": COOKIE})
    else: raise RuntimeError("로그인 정보가 없습니다.")
    return session

def fetch_and_parse(session, mission):
    try: return parse_mission(fetch_html(session, mission), mission)
    except RuntimeError as error:
        if not use_login() or "미션 데이터 영역" not in str(error): raise
        login(session)
        return parse_mission(fetch_html(session, mission), mission)

def collect(session=None):
    session = session or make_session()
    results, total_errors = [], 0
    log("Codyssey 팀 데이터 크롤링 시작")
    
    for mission in MISSIONS:
        try:
            result = fetch_and_parse(session, mission)
            result["success"] = True
            total_errors += result["error_count"]
        except Exception as error:
            result = {"label": mission["label"], "success": False, "team_count": 0, "error_count": 1, "errors": [{"reason": str(error)}], "teams": []}
            total_errors += 1
        results.append(result)

    success_count = sum(1 for r in results if r["success"])
    return {
        "collected_at": datetime.now(KST).isoformat(timespec="seconds"),
        "summary": {"mission_count": len(MISSIONS), "success_count": success_count, "failed_count": len(results) - success_count, "total_error_count": total_errors},
        "missions": results,
    }

def save_json(data):
    now = datetime.now(KST)
    filename = f"team_native_{now.strftime('%Y-%m-%d_%H-%M')}.json"
    filepath = os.path.join(TEMP_DIR, filename)

    with open(filepath, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)

    return filepath

def decode_csv_bytes(content):
    for encoding in ("utf-8-sig", "cp949"):
        try: return content.decode(encoding)
        except UnicodeDecodeError: continue
    return content.decode("utf-8", errors="replace")

def request_progress_csv(session, item):
    payload = {"instCd": INST_CD, "projectNo": item["project_no"], "page": "1", "pagePerRows": PROGRESS_PAGE_SIZE, "excelType": "5", "sortItemNm": "rate", "sortItemDirection": "DESC"}
    headers = {**HEADERS, "Referer": f"{BASE_URL}/stat/learnerprogress/list", "X-Requested-With": "XMLHttpRequest"}
    token = get_cookie(session, "XSRF-TOKEN")
    if token: headers["X-XSRF-TOKEN"] = token

    response = session.post(f"{BASE_URL}/stat/pjtprogstat/downloadlist", headers=headers, json=payload, timeout=60)
    response.raise_for_status()
    return response, decode_csv_bytes(response.content)

def download_progress_one(session, item):
    response, text = request_progress_csv(session, item)
    if "html" in response.headers.get("Content-Type", "").lower() or "<html" in text[:500].lower():
        if use_login(): login(session)
        response, text = request_progress_csv(session, item)

    rows = [row for row in csv.reader(io.StringIO(text)) if any(cell.strip() for cell in row)]
    row_count = max(len(rows) - 1, 0)
    
    stamp = datetime.now(KST).strftime("%Y-%m-%d_%H-%M")
    path = os.path.join(PROGRESS_DIR, f"progress_level{item['level']}_{item['project_no']}_{stamp}.csv")

    with open(path, "w", encoding="utf-8-sig", newline="") as file:
        file.write(text)

    return {"level": item["level"], "file": path, "row_count": row_count}

def download_progress(session):
    log("학습 진도 다운로드 시작 (CSV)")
    for index, item in enumerate(PROGRESS_PROJECTS):
        if index > 0: time.sleep(random.uniform(1.0, 2.0))
        try:
            result = download_progress_one(session, item)
            log(f"[{result['level']}단계] {result['row_count']}명 -> 저장됨: {os.path.basename(result['file'])}")
        except Exception as error:
            log(f"[{item['level']}단계] 실패: {error}")

def run_team(session):
    try:
        data = collect(session)
        summary = data["summary"]
        log(f"크롤링 완료 | 성공 {summary['success_count']} | 에러 {summary['total_error_count']}회")
        filepath = save_json(data)
        log(f"팀 데이터 JSON 임시 저장 완료: {os.path.basename(filepath)}")
    except Exception as error:
        log(f"[팀플 크롤링 오류] {error}")

def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    
    # [수정] 크롤링 시작 전 기존 임시 폴더 비우기
    clear_temp_files()

    try: session = make_session()
    except Exception as error:
        log(f"[오류] {error}")
        return

    if what in ("all", "team"): run_team(session)
    if what in ("all", "progress"): download_progress(session)

if __name__ == "__main__":
    main()