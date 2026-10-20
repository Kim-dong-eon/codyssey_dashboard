"""Mission definitions for each cohort."""

COHORT_CONFIGS = {
    # --------------------------------------------------------
    # [1기 설정]
    # --------------------------------------------------------
    1: {
        "name": "1기",
        "active": True,  # False로 바꾸면 해당 기수는 크롤링에서 제외됨
        "level_requirements": {
            1: {"personal": 3, "team": 1},
            2: {"personal": 3, "team": 1},
            3: {"personal": 2, "team": 1},  # 3단계는 3-1, 3-2 총 2개
        },
        # 1) 개인 진도 미션 (1-1 ~ 3-2)
        "personal_missions": [
            {"level": 1, "label": "1-1", "project_no": "144003", "lcors_no": "1129005", "uqstn_no": "186000"},
            {"level": 1, "label": "1-2", "project_no": "144003", "lcors_no": "1129005", "uqstn_no": "186001"},
            {"level": 1, "label": "1-3", "project_no": "144003", "lcors_no": "1129005", "uqstn_no": "186002"},
            {"level": 2, "label": "2-1", "project_no": "144002", "lcors_no": "1129003", "uqstn_no": "188026"},
            {"level": 2, "label": "2-2", "project_no": "144002", "lcors_no": "1129003", "uqstn_no": "188027"},
            {"level": 2, "label": "2-3", "project_no": "144002", "lcors_no": "1129003", "uqstn_no": "188028"},
            {"level": 3, "label": "3-1", "project_no": "144001", "lcors_no": "1129000", "uqstn_no": "188032"},
            {"level": 3, "label": "3-2", "project_no": "144001", "lcors_no": "1129000", "uqstn_no": "188033"},
        ],
        # 2) 팀 프로젝트 미션 (1-1 ~ Final Project)
        "team_missions": [
            {"level": 1, "label": "1-1", "project_no": "144003", "lcors_no": "1129006", "uqstn_no": "186003"},
            {"level": 1, "label": "1-2", "project_no": "144003", "lcors_no": "1129006", "uqstn_no": "186004"},
            {"level": 1, "label": "1-3", "project_no": "144003", "lcors_no": "1129006", "uqstn_no": "186005"},
            {"level": 2, "label": "2-1", "project_no": "144002", "lcors_no": "1129004", "uqstn_no": "188029"},
            {"level": 2, "label": "2-2", "project_no": "144002", "lcors_no": "1129004", "uqstn_no": "188030"},
            {"level": 2, "label": "2-3", "project_no": "144002", "lcors_no": "1129004", "uqstn_no": "188031"},
            {"level": 3, "label": "Final Project", "project_no": "144001", "lcors_no": "1129002", "uqstn_no": "188037"},
        ],
    },

    # --------------------------------------------------------
    # [2기 설정 예시] -> 나중에 2기 시작 시 주석(#)을 풀고 번호만 넣으세요!
    # --------------------------------------------------------
    # 2: {
    #     "name": "2기",
    #     "active": True,
    #     "level_requirements": {
    #         1: {"personal": 3, "team": 1},
    #         2: {"personal": 3, "team": 1},
    #         3: {"personal": 2, "team": 1},
    #     },
    #     "personal_missions": [ ... ],
    #     "team_missions": [ ... ],
    # },
}
