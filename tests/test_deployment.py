"""The production entrypoint must not silently relax the public boundary."""

import pytest

from server import serve


@pytest.fixture
def launch(monkeypatch):
    for key in ("REHEARSAL_PUBLIC", "REHEARSAL_PUBLIC_ORIGIN", "RENDER_EXTERNAL_URL",
                "RAILWAY_PUBLIC_DOMAIN", "PORT", "FORWARDED_ALLOW_IPS"):
        monkeypatch.delenv(key, raising=False)
    calls = []
    monkeypatch.setattr(serve.uvicorn, "run", lambda *args, **kwargs: calls.append((args, kwargs)))
    return calls


@pytest.mark.parametrize("origin", ["", "http://demo.example", "https://demo.example/path",
                                  "https://user:password@demo.example", "https://demo.example?token=x"])
def test_production_rejects_missing_or_unsafe_origin(monkeypatch, launch, origin):
    monkeypatch.setenv("REHEARSAL_PUBLIC_ORIGIN", origin)
    with pytest.raises(SystemExit, match="public HTTPS origin"):
        serve.main()
    assert not launch


@pytest.mark.parametrize("setting,value", [
    ("REHEARSAL_PUBLIC", "0"), ("PORT", "0"), ("PORT", "65536"), ("PORT", "abc"),
    ("FORWARDED_ALLOW_IPS", "*"), ("FORWARDED_ALLOW_IPS", "127.0.0.1, *"),
])
def test_production_rejects_unsafe_launch_settings(monkeypatch, launch, setting, value):
    monkeypatch.setenv("REHEARSAL_PUBLIC_ORIGIN", "https://demo.example")
    monkeypatch.setenv(setting, value)
    with pytest.raises(SystemExit):
        serve.main()
    assert not launch


@pytest.mark.parametrize("setting,value", [
    ("REHEARSAL_PUBLIC_ORIGIN", "https://demo.example/"),
    ("RENDER_EXTERNAL_URL", "https://demo.example"),
    ("RAILWAY_PUBLIC_DOMAIN", "demo.example"),
])
def test_production_uses_one_worker_and_explicit_proxy_trust(monkeypatch, launch, setting, value):
    monkeypatch.setenv(setting, value)
    monkeypatch.setenv("PORT", "8090")
    serve.main()
    assert serve.os.environ["REHEARSAL_PUBLIC_ORIGIN"] == "https://demo.example"
    assert serve.os.environ["REHEARSAL_PUBLIC"] == "1"
    assert launch == [(("server.api:app",), {
        "host": "0.0.0.0", "port": 8090, "workers": 1, "proxy_headers": False,
        "forwarded_allow_ips": "", "access_log": False,
    })]
