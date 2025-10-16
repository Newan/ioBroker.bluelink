#!/usr/bin/env python3

import requests
import re
import sys
import json

# Constants
client_id = "6d477c38-3ca4-4cf3-9557-2a1929a94654"
user_agent = (
    "Mozilla/5.0 (Linux; Android 4.1.1; Galaxy Nexus Build/JRO03C) "
    "AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Mobile Safari/535.19_CCS_APP_AOS"
)
auth_domain = "https://idpconnect-eu.hyundai.com"
redirect_url = "https://prd.eu-ccapi.hyundai.com:8080/api/v1/user/oauth2/redirect"
debug = False

# Initialize session with headers
session = requests.Session()
session.headers.update({
    "User-Agent": user_agent,
    "Accept-Language": "fr-FR,de;q=0.9",
})



def _debug_response(response):
    if not debug:
        return True
    """Print debugging information for the given response object."""
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
        print(response.text[:1000])  # Truncate to first 500 characters for readability
    print("\n\n\n" + "=" * 80)

def _get_tokens(code):
    """Get the token with the code"""
    url = (
        f"{auth_domain}/auth/api/v2/user/oauth2/token"
    )
    
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_url,
        "client_id": client_id,
        "client_secret": "KUy49XxPzLpLuoK0xhBC77W6VXhmtQR9iQhmIFjjoY4IpxsV",
    }

    try:
        response = session.post(url, data=data)
        _debug_response(response)
        if response.status_code == 200:
            tokens = response.json()
            return tokens
        else:
            print(f"\n❌ Error getting tokens from der API!\n{response.text}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Error getting tokens: {e}")
        return None




def main():
    if len(sys.argv) == 1:
        url = "https://idpconnect-eu.hyundai.com/auth/api/v2/user/oauth2/authorize?ui_locales=fr&scope=openid+profile+email+phone&response_type=code&client_id=6d477c38-3ca4-4cf3-9557-2a1929a94654&redirect_uri=https%3A%2F%2Fprd.eu-ccapi.hyundai.com:8080%2Fapi%2Fv1%2Fuser%2Foauth2%2Fredirect&state=ccsp"

        print(f"Step 1: Open your Browser (best is Chrome), CTRL+SHIFT+I, CTRL-SHIFT+P, type 'network conditions', uncheck 'Use browser default' and set the following user-agent:\n")
        print(f"        {user_agent}\n")
        print(f"Step 2: Open this URL:\n")
        print(f"        {url}\n")
        print(f"Step 3: Solve the reCAPTCHA and login with your credentials.")
        confirm = input("        Was the login successful? (y/n): ").strip().lower()

        if confirm != "y":
            print("Exiting script. Please try again after successful login.")
            sys.exit(1)

        redirect_url = input("Step 4: A blank page will open which starts with 'https://prd.eu-ccapi.hyundai.com:8080/api/v1/user/oauth2/redirect?code=...'\n        Copy the full URL from the address bar and paste it here:\n> ")

        try:
            code = re.search(
                r'code=([0-9a-fA-F-]{36}\.[0-9a-fA-F-]{36}\.[0-9a-fA-F-]{36})',
                redirect_url
            ).group(1)
        except Exception:
            print("[ERROR] Could not extract authorization code from the URL. Please try again.")
            sys.exit(1)

        tokens = _get_tokens(code)
        if tokens is not None:
            print(tokens)
            refresh_token = tokens["refresh_token"]
            access_token = tokens["access_token"]
            print(f"\n✅ Your tokens are:\n\n- Refresh Token: {refresh_token}\n- Access Token: {access_token}")

if __name__ == "__main__":
    main()
