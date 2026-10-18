"""Keep ordinary tests independent of developer credentials and paid services."""

import os


def pytest_configure():
    # Empty values also prevent load_dotenv(override=False) from loading secrets.
    # Provider contract tests explicitly install their own mock credentials.
    for name in ("BACKBOARD_API_KEY", "ANTHROPIC_API_KEY", "BACKBOARD_ASSISTANT_ID"):
        os.environ[name] = ""
