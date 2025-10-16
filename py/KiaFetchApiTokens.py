#!/usr/bin/env python3

import requests
import sys
from urllib.parse import urlparse, parse_qs, quote

# Constants
debug: bool = False
auth_domain: str = "https://idpconnect-eu.kia.com"
url_redirect: str = "https://prd.eu-ccapi.kia.com:8080/api/v1/user/oauth2/redirect"
url_authorize_redirect: str = "https://www.kia.com/api/bin/oneid/login"
url_authorize_redirect_quoted: str = quote(url_authorize_redirect, safe='', encoding=None, errors=None)
url_login: str = (
    f"{auth_domain}/auth/api/v2/user/oauth2/authorize?"
    f"ui_locales=de&"
    f"scope=openid+profile+email+phone&"
    f"response_type=code&"
    f"client_id=peukiaidm-online-sales&"
    f"redirect_uri={url_authorize_redirect_quoted}&"
    f"state=aHR0cHM6Ly93d3cua2lhLmNvbS9kZS8"  # base64 https://www.kia.com/de/
)
client_id: str = "fdc85c00-0a2f-4c64-bcb4-2cfb1500730a"
user_agent: str = (
    "Mozilla/5.0 (Linux; Android 4.1.1; Galaxy Nexus Build/JRO03C) "
    "AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Mobile Safari/535.19_CCS_APP_AOS"
)


# Initialize a new session with headers
session = requests.Session()
session.headers.update({
    "User-Agent": user_agent,
    "Accept-Language": "de-DE,de;q=0.9",
})


def _debug_response(response) -> bool:
    """Print debugging information for the given response object."""
    if not debug:
        return False
    print("=" * 80)
    print(f"URL: {response.url}")
    print(f"Status Code: {response.status_code}")
    print("Headers:")
    print(" Request:")
    for key, value in response.request.headers.items():
        print(f"  {key}: {value}")
    print(" Response:")
    for key, value in response.headers.items():
        print(f"  {key}: {value}")
    print("\nCookies stored in session:", session.cookies.get_dict())
    if response.text:
        print("\nResponse Content (truncated):")
        print(response.text[:1000])  # Truncate to first 1000 characters for readability
    print("\n\n\n")
    return True


def _get_connector_session_key() -> str:
    """Retrieve the connector_session_key from the redirect URL."""
    url: str = (
        f"{auth_domain}/auth/api/v2/user/oauth2/authorize?"
        f"response_type=code&"
        f"client_id={client_id}&"
        f"redirect_uri={url_redirect}&"
        f"lang=de&"
        f"state=ccsp"
    )
    response = session.get(url)
    _debug_response(response)
    try:
        url_parsed = urlparse(response.url)
        url_queries = parse_qs(url_parsed.query)
        next_uri: str = url_queries["next_uri"][0]
        next_uri_parsed = urlparse(next_uri)
        next_uri_queries = parse_qs(next_uri_parsed.query)
        connector_session_key: str = next_uri_queries["connector_session_key"][0]
        return connector_session_key
    except Exception as e:
        print(f"\n? Could not extract connector_session_key from the URL {url}. Please try again: {e}")
        sys.exit(1)


def _build_oauth_authorize_url(connector_session_key: str) -> str:
    """Build the OAuth authorization URL with the connector_session_key."""
    return (
        f"{auth_domain}/auth/api/v2/user/oauth2/authorize?"
        f"client_id={client_id}&"
        f"redirect_uri={url_redirect}&"
        f"response_type=code&"
        f"scope=&"
        f"state=ccsp&"
        f"connector_client_id=hmgid1.0-{client_id}&"
        f"ui_locales=&"
        f"connector_scope=&"
        f"connector_session_key={connector_session_key}"
    )


def _get_authorization_code(url: str) -> str:
    """Retrieve the authorization_code from the url."""
    try:
        url_parsed = urlparse(url)
        url_queries = parse_qs(url_parsed.query)
        code: str = url_queries["code"][0]
        return code
    except Exception as e:
        print(f"\n? Could not extract authorization code query from the URL {url}. Please try again: {e}")
        sys.exit(1)


def _get_tokens(authorization_code: str) -> dict:
    """Get the token with the authorization code"""
    url: str = (
        f"{auth_domain}/auth/api/v2/user/oauth2/token"
    )
    data = {
        "grant_type": "authorization_code",
        "code": authorization_code,
        "redirect_uri": url_redirect,
        "client_id": client_id,
        "client_secret": "secret",
    }
    try:
        response = session.post(url, data=data)
        _debug_response(response)
        if response.status_code == 200:
            tokens = response.json()
            return tokens
        else:
            print(f"\n? Error getting tokens from the API!\n{response.text}")
            sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"? Error getting tokens: {e}")
        sys.exit(1)


def main() -> None:
    print(f"Step 1: Open a new tab in your browser (best is Chrome), press CTRL+SHIFT+I, press CTRL-SHIFT+P, "
          f"type 'network conditions', uncheck 'Use browser default' next to 'User agent' "
          f"and set the following user agent:\n")
    print(f"        {user_agent}\n")

    print(f"Step 2: Open this URL in the new tab:\n")
    print(f"        {url_login}\n")

    print(f"Step 3: Solve the reCAPTCHA and login with your credentials. After successful login, "
          f"you get redirected to Kia's homepage.")
    confirm: str = input(
        "        Was the login successful? (y/n): "
    ).strip().lower()
    if confirm != "y":
        print(f"? Exiting script. Please try again after successful login.")
        sys.exit(1)
    connector_session_key = _get_connector_session_key()
    url_auth = _build_oauth_authorize_url(connector_session_key)

    print(f"\nStep 4: Open the following URL in the SAME browser tab where you're logged in:\n")
    print(f"        {url_auth}\n")

    url_code: str = input(
        f"Step 5: A blank page will open with the URL from step 4 which starts with "
        f"'{url_redirect}?code=...&state=ccsp&login_success=y'\n"
        f"        Copy the full URL from the address bar and paste it here:\n\n"
        f"      > "
    )
    authorization_code: str = _get_authorization_code(url_code)
    tokens: dict = _get_tokens(authorization_code)
    if tokens is not None:
        refresh_token: str = tokens["refresh_token"]
        access_token: str = tokens["access_token"]
        print(f"\nStep 6: ? Your tokens are:\n\n"
              f"        - Refresh Token: {refresh_token}\n"
              f"        - Access Token: {access_token}")


if __name__ == "__main__":
    main()
