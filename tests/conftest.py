"""Keep ordinary tests independent of developer credentials and paid services."""

import os


def pytest_configure():
    # Empty values also prevent load_dotenv(override=False) from loading secrets.
    # Provider contract tests explicitly install their own mock credentials.
    for name in ("BACKBOARD_API_KEY", "ANTHROPIC_API_KEY", "BACKBOARD_ASSISTANT_ID", "REHEARSAL_OPERATOR_TOKEN", "REHEARSAL_PUBLIC_ORIGIN", "FALKORDB_URL"):
        os.environ[name] = ""
    os.environ["REHEARSAL_PUBLIC"] = "0"
