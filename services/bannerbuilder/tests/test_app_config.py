import os
from unittest import TestCase
from unittest.mock import patch

from app import create_app


class ApplicationConfigurationTest(TestCase):
    def test_secret_is_required_without_local_opt_in(self) -> None:
        with patch.dict(
            os.environ,
            {"SECRET_KEY": "", "BANNERBUILDER_ALLOW_EPHEMERAL_SECRET": "0"},
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "SECRET_KEY is required"):
                create_app()

    def test_local_opt_in_uses_http_compatible_cookie(self) -> None:
        with patch.dict(
            os.environ,
            {
                "SECRET_KEY": "",
                "BANNERBUILDER_ALLOW_EPHEMERAL_SECRET": "1",
                "BANNERBUILDER_COOKIE_SECURE": "0",
            },
            clear=False,
        ):
            app = create_app()

        self.assertTrue(app.secret_key)
        self.assertFalse(app.config["SESSION_COOKIE_SECURE"])
