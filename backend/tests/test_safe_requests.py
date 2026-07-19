"""Tests for backend.core.safe_requests — SSRF protection and redirect tracking."""
import pytest
from unittest.mock import patch, MagicMock

from backend.core.safe_requests import (
    _validate_url,
    _follow_redirects_safely,
    _MAX_REDIRECTS,
    MAX_RESPONSE_BYTES,
    safe_get,
    safe_post,
)


class TestValidateUrl:
    """Unit tests for _validate_url SSRF blocklist."""

    def test_rejects_non_http_scheme(self):
        with pytest.raises(Exception) as exc:
            _validate_url("ftp://example.com/file")
        assert "Only http/https" in str(exc.value.detail)

    def test_rejects_missing_hostname(self):
        with pytest.raises(Exception) as exc:
            _validate_url("http:///path-only")
        assert "missing hostname" in str(exc.value.detail).lower()

    def test_rejects_loopback_ip(self):
        with pytest.raises(Exception) as exc:
            _validate_url("http://127.0.0.1:8080/admin")
        assert "private" in str(exc.value.detail).lower() or "reserved" in str(exc.value.detail).lower()

    def test_rejects_private_10_network(self):
        with pytest.raises(Exception) as exc:
            _validate_url("http://10.0.0.5/api")
        assert "private" in str(exc.value.detail).lower() or "reserved" in str(exc.value.detail).lower()

    def test_rejects_private_192_168_network(self):
        with pytest.raises(Exception) as exc:
            _validate_url("http://192.168.1.1:3000")
        assert "private" in str(exc.value.detail).lower() or "reserved" in str(exc.value.detail).lower()

    def test_rejects_link_local(self):
        with pytest.raises(Exception) as exc:
            _validate_url("http://169.254.1.1/metadata")
        assert "private" in str(exc.value.detail).lower() or "reserved" in str(exc.value.detail).lower()

    def test_allows_public_ip(self):
        result = _validate_url("http://93.184.216.34/")  # example.com IP
        assert result == "http://93.184.216.34/"

    def test_allows_public_domain(self):
        result = _validate_url("https://example.com/path?q=1")
        assert result == "https://example.com/path?q=1"

    def test_rejects_ipv6_loopback(self):
        with pytest.raises(Exception) as exc:
            _validate_url("http://[::1]:8080/")
        assert "private" in str(exc.value.detail).lower() or "reserved" in str(exc.value.detail).lower()

    def test_rejects_documentation_reserved_ip(self):
        with pytest.raises(Exception) as exc:
            _validate_url("http://192.0.2.10/example")
        assert "private" in str(exc.value.detail).lower() or "reserved" in str(exc.value.detail).lower()


class TestFollowRedirectsSafely:
    """Tests for _follow_redirects_safely with redirect validation."""

    def test_simple_get_without_redirects(self):
        mock_get = MagicMock()
        mock_response = MagicMock()
        mock_response.is_redirect = False
        mock_response.is_permanent_redirect = False
        mock_response.content = b"hello"
        mock_get.return_value = mock_response

        result = _follow_redirects_safely(mock_get, "https://example.com")
        assert result is mock_response

    def test_follows_single_redirect(self):
        mock_get = MagicMock()
        redirect_resp = MagicMock()
        redirect_resp.is_redirect = True
        redirect_resp.is_permanent_redirect = False
        redirect_resp.headers = {"Location": "https://example.com/final"}

        final_resp = MagicMock()
        final_resp.is_redirect = False
        final_resp.is_permanent_redirect = False
        final_resp.content = b"final"
        mock_get.side_effect = [redirect_resp, final_resp]

        result = _follow_redirects_safely(mock_get, "https://example.com/start")
        assert result is final_resp
        assert mock_get.call_count == 2

    def test_rejects_redirect_to_private_ip(self):
        mock_get = MagicMock()
        redirect_resp = MagicMock()
        redirect_resp.is_redirect = True
        redirect_resp.is_permanent_redirect = False
        redirect_resp.headers = {"Location": "http://127.0.0.1/admin"}
        mock_get.return_value = redirect_resp

        with pytest.raises(Exception) as exc:
            _follow_redirects_safely(mock_get, "https://example.com/start")
        assert "private" in str(exc.value.detail).lower() or "reserved" in str(exc.value.detail).lower()

    def test_rejects_too_many_redirects(self):
        mock_get = MagicMock()
        redirect_resp = MagicMock()
        redirect_resp.is_redirect = True
        redirect_resp.is_permanent_redirect = False
        redirect_resp.headers = {"Location": "https://example.com/next"}
        mock_get.return_value = redirect_resp

        with pytest.raises(Exception) as exc:
            _follow_redirects_safely(mock_get, "https://example.com/start")
        assert "redirect" in str(exc.value.detail).lower()
        assert mock_get.call_count == _MAX_REDIRECTS + 1

    def test_rejects_oversized_response(self):
        mock_get = MagicMock()
        resp = MagicMock()
        resp.is_redirect = False
        resp.is_permanent_redirect = False
        resp.url = "https://example.com/large"
        resp.headers = {}
        resp.content = b"x" * (MAX_RESPONSE_BYTES + 1)
        mock_get.return_value = resp

        with pytest.raises(Exception) as exc:
            _follow_redirects_safely(mock_get, "https://example.com/large")
        assert "too large" in str(exc.value.detail).lower()

    def test_rejects_unexpected_content_type(self):
        mock_get = MagicMock()
        resp = MagicMock()
        resp.is_redirect = False
        resp.is_permanent_redirect = False
        resp.url = "https://example.com/file"
        resp.headers = {"Content-Type": "text/html"}
        resp.content = b"<html></html>"
        mock_get.return_value = resp

        with pytest.raises(Exception) as exc:
            _follow_redirects_safely(
                mock_get,
                "https://example.com/file",
                allowed_content_types=("image/",),
            )
        assert "content type" in str(exc.value.detail).lower()

    def test_safe_get_uses_follow_redirects(self):
        with patch("backend.core.safe_requests._follow_redirects_safely") as mock_follow:
            from requests import get as real_get
            safe_get("https://example.com")
            mock_follow.assert_called_once()
            args, kwargs = mock_follow.call_args
            assert args[0] is real_get
            assert args[1] == "https://example.com"

    def test_safe_post_uses_follow_redirects(self):
        with patch("backend.core.safe_requests._follow_redirects_safely") as mock_follow:
            from requests import post as real_post
            safe_post("https://example.com/api", json={"key": "val"})
            mock_follow.assert_called_once()
            args, kwargs = mock_follow.call_args
            assert args[0] is real_post
            assert args[1] == "https://example.com/api"

    def test_safe_get_passes_kwargs_through(self):
        with patch("backend.core.safe_requests._follow_redirects_safely") as mock_follow:
            safe_get("https://example.com", timeout=10, headers={"X-Test": "1"})
            _, kwargs = mock_follow.call_args
            assert kwargs["timeout"] == 10
            assert kwargs["headers"] == {"X-Test": "1"}

    def test_safe_post_passes_kwargs_through(self):
        with patch("backend.core.safe_requests._follow_redirects_safely") as mock_follow:
            safe_post("https://example.com", timeout=30, data={"a": 1})
            _, kwargs = mock_follow.call_args
            assert kwargs["timeout"] == 30
            assert kwargs["data"] == {"a": 1}
