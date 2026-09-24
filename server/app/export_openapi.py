"""导出 OpenAPI 描述，给前端生成 TS 类型：

uv run python -m app.export_openapi > ../web/openapi.json
cd ../web && pnpm gen:api
"""

import json
import sys

from .main import create_app


def main() -> None:
    json.dump(create_app().openapi(), sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
