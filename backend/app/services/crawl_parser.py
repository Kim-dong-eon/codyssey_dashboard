"""Parse mission pages into data independent of the database."""

import re

from bs4 import BeautifulSoup

def normalize_date(raw_date):
    if not raw_date:
        return None
    match = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{2})", raw_date)
    if not match:
        return raw_date
    year, month, day = match.groups()
    return f"20{year}-{month}-{day}"

def normalize_status(raw):
    if not raw:
        return "알 수 없음"
    text = raw.replace(" ", "")
    if text == "미션완료": return "미션 완료"
    if text == "승인대기": return "승인 대기"
    if text == "미션시작": return "미션 시작"
    if text == "팀셋팅완료": return "팀 셋팅 중"
    return raw

def get_completion_date(li_element):
    title = li_element.select_one("strong.tit")
    if not title:
        return None
    match = re.search(r"\b\d{2}\.\d{2}\.\d{2}\b", title.get_text(" ", strip=True))
    return normalize_date(match.group(0)) if match else None


def parse_team_mission(html, mission):
    soup = BeautifulSoup(html, "html.parser")
    card = soup.select_one(".card.uqstn")
    if not card:
        raise RuntimeError("팀 미션 데이터 영역을 찾지 못했습니다.")

    teams = []
    for team_element in soup.select('ul[id^="misTeamList_"] > li'):
        name_element = team_element.select_one(".ti")
        if not name_element:
            continue

        team_sn = name_element.get("data-teamsn")
        team_name = name_element.get_text(strip=True)
        status_element = team_element.select_one(".iSt2")
        raw_status = status_element.get_text(strip=True) if status_element else None

        completion_date = get_completion_date(team_element) if raw_status == "미션완료" else None

        members = [
            {
                "member_id": m.get("data-mbr-id"),
                "name": m.get("data-mbr-nm"),
                "email": (m.get("data-eml-addr") or "").strip().lower(),
                "leader": m.get("data-leadr-yn") == "Y",
            }
            for m in team_element.select(".btnMisTeamDetail")
        ]

        teams.append({
            "team_sn": team_sn,
            "team_name": team_name,
            "status": normalize_status(raw_status),
            "completion_date": completion_date,
            "members": members,
        })

    if not teams and not mission.get("allow_empty", False):
        raise RuntimeError("팀 미션 데이터 영역은 있지만 팀 목록이 비어 있습니다.")

    return {
        "level": mission["level"],
        "label": mission["label"],
        "teams": teams,
    }

def parse_personal_mission(html, mission):
    """개인 미션에서 [이름, 이메일, 상태(미션 완료/미션 시작), 완료일] 4가지만 추출"""
    soup = BeautifulSoup(html, "html.parser")
    card = soup.select_one(".card.uqstn")
    if not card:
        raise RuntimeError("개인 미션 데이터 영역을 찾지 못했습니다.")

    records = []
    for li_element in soup.select('ul[id^="misTeamList_"] > li'):
        status_el = li_element.select_one(".iSt2")
        raw_status = status_el.get_text(strip=True) if status_el else None
        status = normalize_status(raw_status)
        completion_date = get_completion_date(li_element) if raw_status == "미션완료" else None

        for member_el in li_element.select(".btnMisTeamDetail"):
            name = member_el.get("data-mbr-nm")
            email = member_el.get("data-eml-addr")
            if name and email:
                records.append({
                    "name": name.strip(),
                    "email": email.strip().lower(),
                    "status": status,
                    "completion_date": completion_date,
                })

    if not records and not mission.get("allow_empty", False):
        raise RuntimeError("개인 미션 데이터 영역은 있지만 교육생 목록이 비어 있습니다.")

    return {
        "level": mission["level"],
        "label": mission["label"],
        "records": records,
    }
